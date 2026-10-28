"""HTTP integration tests use a disposable deployment, never the user's database."""
import concurrent.futures
import http.cookiejar
import io
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base
from app import models


class AccountTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        cls.root = Path(cls.directory.name)
        engine = create_engine(f"sqlite:///{cls.root / 'assetmanager.db'}")
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            asset = models.Asset(name="迁移前的资产", price=123, notes="原备注")
            db.add(asset)
            db.commit()
            cls.existing_id = asset.id
        engine.dispose()
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{port}"
        cls.server = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', str(port)],
            cwd=Path(__file__).resolve().parents[1], env={**os.environ, 'DATA_DIR': str(cls.root), 'SEED_DEMO': '0'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            try:
                urllib.request.urlopen(cls.url + '/api/health', timeout=1).close()
                break
            except OSError:
                time.sleep(.05)
        else:
            cls.server.terminate()
            raise RuntimeError('Test deployment failed to start')

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.directory.cleanup()

    def setUp(self):
        with sqlite3.connect(self.root / 'account.db') as db:
            for table in ('account', 'sessions', 'login_attempts'):
                db.execute('DELETE FROM ' + table)
        self.client = self.make_client()

    def make_client(self):
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, data=None, client=None, headers=None, method=None):
        defaults = {'X-Keeps-Request': '1', 'Content-Type': 'application/json'}
        defaults.update(headers or {})
        body = data if isinstance(data, bytes) else json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(self.url + path, body, defaults, method=method)
        try:
            response = (client or self.client).open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            try: result = json.loads(raw)
            except (ValueError, UnicodeDecodeError): result = raw
            return response.status, result, response.headers

    def setup_account(self, client=None):
        return self.request('/api/auth/setup', {'username': '我的账号', 'password': 'test-password-123'}, client=client)

    def test_image_cache_revalidates_and_still_requires_login(self):
        self.assertEqual(self.setup_account()[0], 201)
        image = io.BytesIO()
        Image.new('RGB', (16, 16), 'red').save(image, format='PNG')
        status, uploaded, _ = self.request('/api/images', image.getvalue(),
                                           headers={'Content-Type': 'image/png'})
        self.assertEqual(status, 201)
        url = uploaded['image_url']
        status, body, headers = self.request(url)
        self.assertEqual(status, 200)
        self.assertTrue(body)
        self.assertEqual(headers['Cache-Control'], 'private, no-cache')
        self.assertIn('Cookie', headers['Vary'])
        for condition in ({'If-None-Match': headers['ETag']},
                          {'If-Modified-Since': headers['Last-Modified']}):
            status, body, cached = self.request(url, headers=condition)
            self.assertEqual(status, 304)
            self.assertEqual(body, b'')
            self.assertEqual(cached['Cache-Control'], 'private, no-cache')
        _, replacement, _ = self.request('/api/images', image.getvalue(),
                                         headers={'Content-Type': 'image/png'})
        self.assertNotEqual(url, replacement['image_url'])
        self.assertEqual(self.request('/api/assets')[2]['Cache-Control'], 'no-store')
        self.assertEqual(self.request(uploaded['original_url'])[2]['Cache-Control'], 'no-store')
        self.assertEqual(self.request('/media/missing/display.png')[2]['Cache-Control'], 'no-store')
        self.request('/api/auth/logout', {}, method='POST')
        status, _, denied = self.request(url, headers={'If-None-Match': headers['ETag']})
        self.assertEqual(status, 401)
        self.assertEqual(denied['Cache-Control'], 'no-store')

    def test_setup_preserves_assets_and_cannot_be_repeated(self):
        for path in ('/api/assets', '/api/export', '/api/trash', '/api/categories', '/api/tags', '/api/stats', '/media/anything.png', '/api/images/anything/original'):
            self.assertEqual(self.request(path)[0], 401, path)
        status, _, headers = self.setup_account()
        self.assertEqual(status, 201)
        cookie = headers['Set-Cookie']
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=strict', cookie)
        self.assertEqual(self.setup_account()[0], 409)
        code, asset, headers = self.request('/api/assets/' + self.existing_id)
        self.assertEqual(code, 200)
        self.assertEqual(asset['notes'], '原备注')
        self.assertEqual(headers['Cache-Control'], 'no-store')
        with sqlite3.connect(self.root / 'account.db') as db:
            stored = db.execute('SELECT password_hash FROM account').fetchone()[0]
            token_hash = db.execute('SELECT token_hash FROM sessions').fetchone()[0]
        self.assertNotIn('test-password-123', stored)
        self.assertNotIn(token_hash, cookie)
        # Backup/reset flows must not include or erase credentials.
        backup = self.request('/api/export')[1]
        self.assertNotIn('password_hash', json.dumps(backup))
        self.request('/api/import', backup)
        self.assertTrue(self.request('/api/auth/status')[1]['authenticated'])

    def test_csrf_and_setup_validation(self):
        self.assertEqual(self.request('/api/auth/setup', {'username':'a', 'password':'test-password-123'}, headers={'X-Keeps-Request': ''})[0], 403)
        self.assertEqual(self.request('/api/auth/setup', {'username':'a', 'password':'test-password-123'}, headers={'Origin': 'http://evil.example'})[0], 403)
        self.assertEqual(self.request('/api/auth/setup', {'username':'  ', 'password':'test-password-123'})[0], 422)
        self.assertEqual(self.request('/api/auth/setup', {'username':'a', 'password':'short'})[0], 422)
        self.assertEqual(self.setup_account()[0], 201)

    def test_first_setup_accepts_lan_host_but_never_creates_second_account(self):
        headers = {'Host': '192.0.2.10:8765', 'Origin': 'http://192.0.2.10:8765'}
        self.assertFalse(self.request('/api/auth/status', headers=headers)[1]['initialized'])
        credentials = {'username': '局域网账号', 'password': 'test-password-123'}
        self.assertEqual(self.request('/api/auth/setup', credentials, headers=headers)[0], 201)
        self.assertTrue(self.request('/api/auth/status')[1]['initialized'])
        self.assertEqual(self.request('/api/auth/setup', credentials, headers=headers)[0], 409)

    def test_login_logout_expiry_and_password_revokes_all_sessions(self):
        self.setup_account()
        self.assertEqual(self.request('/api/auth/login', {'username':'我的账号'}, client=self.make_client())[0], 401)
        other = self.make_client()
        wrong = {'username':'我的账号', 'password':'wrong-password-123'}
        self.assertEqual(self.request('/api/auth/login', wrong, client=other)[0], 401)
        correct = {'username':'我的账号', 'password':'test-password-123'}
        self.assertEqual(self.request('/api/auth/login', correct, client=other)[0], 200)
        self.assertEqual(self.request('/api/auth/password', {'current_password':'wrong', 'new_password':'changed-password-456'})[0], 400)
        self.assertEqual(self.request('/api/auth/password', {'current_password':'test-password-123', 'new_password':'changed-password-456'})[0], 204)
        self.assertEqual(self.request('/api/assets', client=other)[0], 401)
        self.assertEqual(self.request('/api/assets')[0], 401)
        self.assertEqual(self.request('/api/auth/login', correct)[0], 401)
        correct['password'] = 'changed-password-456'
        self.assertEqual(self.request('/api/auth/login', correct)[0], 200)
        self.assertEqual(self.request('/api/auth/logout', {})[0], 204)
        self.assertEqual(self.request('/api/assets')[0], 401)
        self.request('/api/auth/login', correct)
        with sqlite3.connect(self.root / 'account.db') as db:
            db.execute('UPDATE sessions SET expires=0')
        self.assertEqual(self.request('/api/assets')[0], 401)

    def test_image_download_requires_session(self):
        self.setup_account()
        data = io.BytesIO()
        Image.new('RGB', (8, 8), 'white').save(data, format='PNG')
        code, result, _ = self.request('/api/images', data.getvalue(), headers={'Content-Type':'image/png'})
        self.assertEqual(code, 201)
        for url in (result['image_url'], result['original_url']):
            self.assertEqual(self.request(url)[0], 200)
            self.assertEqual(self.request(url, client=self.make_client())[0], 401)
        self.request('/api/auth/logout', {})
        self.assertEqual(self.request(result['image_url'])[0], 401)

    def test_login_rate_limit(self):
        self.setup_account()
        for _ in range(10):
            self.assertEqual(self.request('/api/auth/login', {'username':'no', 'password':'wrong-password'})[0], 401)
        self.assertEqual(self.request('/api/auth/login', {'username':'no', 'password':'wrong-password'})[0], 429)

    def test_simultaneous_setup_creates_exactly_one_account(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.setup_account(self.make_client())[0], range(2)))
        self.assertEqual(sorted(results), [201, 409])
