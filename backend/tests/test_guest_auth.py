import http.cookiejar
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request


class GuestLoginTests(unittest.TestCase):
    def test_guest_only_login_and_isolated_session(self):
        with tempfile.TemporaryDirectory() as directory:
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)], cwd=Path(__file__).resolve().parents[1], env={**os.environ, "DATA_DIR": directory, "GUEST_LOGIN": "1", "SESSION_COOKIE": "youwu_guest_session", "SEED_DEMO": "0"}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            def request(path, data=None, headers=None):
                req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, json.dumps(data).encode() if data is not None else None, {"Content-Type":"application/json", "X-Keeps-Request":"1", **(headers or {})})
                try:
                    response=client.open(req, timeout=5)
                except urllib.error.HTTPError as error:
                    response=error
                with response:
                    raw=response.read()
                    return response.status, json.loads(raw) if raw else None, response.headers
            try:
                for _ in range(100):
                    try:
                        state=request("/api/auth/status")[1]
                        break
                    except OSError:
                        time.sleep(.05)
                self.assertTrue(state["initialized"])
                self.assertTrue(state["guest_mode"])
                self.assertEqual(request("/api/assets")[0],401)
                self.assertEqual(request("/api/auth/login", {"username":"other"})[0],401)
                code, _, headers=request("/api/auth/login", {"username":"guest"})
                self.assertEqual(code,200)
                self.assertIn("youwu_guest_session=",headers["Set-Cookie"])
                self.assertEqual(request("/api/assets")[0],200)
                self.assertEqual(request("/api/auth/setup", {"username":"other", "password":"password-test-123"})[0],403)
                self.assertEqual(request("/api/auth/password", {"current_password":"x", "new_password":"password-test-123"})[0],403)
                self.assertEqual(request("/api/auth/logout", {})[0],204)
                self.assertEqual(request("/api/assets")[0],401)
            finally:
                server.terminate()
                server.wait(timeout=10)
