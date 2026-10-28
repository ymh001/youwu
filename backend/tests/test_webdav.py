import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from app import webdav

class WebDAVTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.remote={'/dav/keeps-backup.zip':b'previous'};self.corrupt=False;self.reject_move=False
        test=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_PROPFIND(self):self.send_response(207);self.end_headers()
            def do_PUT(self):
                test.remote[self.path]=self.rfile.read(int(self.headers['Content-Length']));self.send_response(201);self.end_headers()
            def do_GET(self):
                if self.path not in test.remote:self.send_response(404);self.end_headers();return
                self.send_response(200);self.end_headers();self.wfile.write(b'bad' if test.corrupt else test.remote[self.path])
            def do_MOVE(self):
                if test.reject_move:self.send_response(405);self.end_headers();return
                from urllib.parse import urlsplit
                dest=urlsplit(self.headers['Destination']).path;test.remote[dest]=test.remote.pop(self.path);self.send_response(204);self.end_headers()
            def do_DELETE(self):test.remote.pop(self.path,None);self.send_response(204);self.end_headers()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.patches=[patch.object(webdav,'DATA_DIR',self.root),patch.object(webdav,'CONFIG',self.root/'webdav.json')]
        for p in self.patches:p.start()
        webdav.save_config(webdav.ConfigIn(url=f'http://127.0.0.1:{self.server.server_port}/dav/',username='test',password='secret'))
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
        for p in self.patches:p.stop()
        self.temp.cleanup()
    def export(self,db,path):path.write_bytes(b'complete-package');return {'assets':2,'images':1,'attachments':1}
    def test_upload_verified_then_move_and_password_never_returned(self):
        self.assertTrue(webdav.test_connection()['ok']);self.assertNotIn('password',webdav.read_config())
        c=webdav.read_config();webdav.save_config(webdav.ConfigIn(url=c['url'],username=c['username'],password=None))
        self.assertEqual(webdav.config()['password'],'secret')
        with patch.object(webdav,'export_package',self.export):self.assertTrue(webdav.upload(None)['ok'])
        self.assertEqual(self.remote,{'/dav/keeps-backup.zip':b'complete-package'})
    def test_corrupt_upload_and_unsupported_move_keep_previous_backup(self):
        with patch.object(webdav,'export_package',self.export):
            self.corrupt=True
            with self.assertRaises(HTTPException):webdav.upload(None)
            self.assertEqual(self.remote,{'/dav/keeps-backup.zip':b'previous'})
            self.corrupt=False;self.reject_move=True
            with self.assertRaises(HTTPException):webdav.upload(None)
            self.assertEqual(self.remote,{'/dav/keeps-backup.zip':b'previous'})
    def test_changing_destination_does_not_leak_saved_password(self):
        webdav.save_config(webdav.ConfigIn(url='https://different.invalid/dav/',username='test',password=None))
        self.assertEqual(webdav.config()['password'],'')

    def test_config_cannot_change_during_transfer(self):
        webdav.TRANSFER.acquire()
        try:
            with self.assertRaises(HTTPException) as error:
                webdav.save_config(webdav.ConfigIn(url='https://different.invalid/dav/'))
            self.assertEqual(error.exception.status_code,409)
        finally:webdav.TRANSFER.release()
