"""Manual, explicit WebDAV overwrite using verified temporary uploads and MOVE."""
import base64
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Optional
from threading import Lock
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .db import DATA_DIR, get_db
from .backup import MAX_PACKAGE, export_package, prepare, file_hash

router = APIRouter(prefix='/api/webdav', tags=['webdav'])
CONFIG = DATA_DIR/'webdav.json'
TRANSFER = Lock()
REMOTE = 'keeps-backup.zip'

class ConfigIn(BaseModel):
    url: str
    username: str = ''
    password: Optional[str] = None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None


def config():
    if not CONFIG.is_file():raise HTTPException(422,'请先配置 WebDAV')
    return json.loads(CONFIG.read_text())


def send(method, name='', data=None, headers=None):
    c=config(); url=c['url']+urllib.parse.quote(name)
    auth=base64.b64encode((c['username']+':'+c['password']).encode()).decode()
    request=urllib.request.Request(url, data=data, method=method,
        headers={'Authorization':'Basic '+auth, **(headers or {})})
    try:
        return urllib.request.build_opener(NoRedirect()).open(request,timeout=45)
    except urllib.error.HTTPError as error:
        code=error.code;error.close()
        raise HTTPException(502,f'WebDAV 返回 {code}，请检查地址、权限与服务器支持')
    except (OSError,ValueError):
        raise HTTPException(502,'WebDAV 连接失败或超时，原有备份未被本次操作确认替换')


def download(name, path):
    size=0
    with send('GET',name) as response, open(path,'wb') as target:
        for chunk in iter(lambda:response.read(1024*1024),b''):
            size+=len(chunk)
            if size>MAX_PACKAGE:raise HTTPException(413,'云端备份超过 512 MB')
            target.write(chunk)
    return size

@router.get('')
def read_config():
    if not CONFIG.is_file():return {'url':'','username':'','has_password':False}
    c=config();return {'url':c['url'],'username':c['username'],'has_password':bool(c['password'])}

@router.put('')
def save_config(payload: ConfigIn):
    if not TRANSFER.acquire(blocking=False):raise HTTPException(409,'备份传输中，请稍后修改配置')
    try:
        parsed=urllib.parse.urlsplit(payload.url.strip())
        if parsed.scheme not in ('http','https') or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise HTTPException(422,'请输入 HTTP(S) WebDAV 文件夹地址，账号密码请填在独立输入框')
        previous=config() if CONFIG.exists() else {}
        # Never silently send an old password to a different host or account.
        url=payload.url.strip().rstrip('/')+'/'
        password=payload.password if payload.password is not None else previous.get('password','') if previous.get('url')==url and previous.get('username')==payload.username else ''
        temp=CONFIG.with_suffix('.tmp')
        temp.write_text(json.dumps({'url':url,'username':payload.username,'password':password}));temp.chmod(0o600);temp.replace(CONFIG)
        return read_config()
    finally:TRANSFER.release()

@router.post('/test')
def test_connection():
    with send('PROPFIND',headers={'Depth':'0'}) as response:
        if response.status not in (200,207):raise HTTPException(502,'WebDAV 文件夹不可访问')
    return {'ok':True}

@router.post('/upload')
def upload(db: Session = Depends(get_db)):
    if not TRANSFER.acquire(blocking=False):raise HTTPException(409,'已有备份传输正在进行')
    remote='.keeps-upload-'+uuid.uuid4().hex+'.zip'
    created=False
    try:
        with tempfile.TemporaryDirectory(dir=DATA_DIR) as directory:
            package=Path(directory)/'backup.zip';check=Path(directory)/'verify.zip'
            summary=export_package(db,package)
            if package.stat().st_size>MAX_PACKAGE:raise HTTPException(413,'备份超过 512 MB，未上传')
            with send('PUT',remote,data=package.read_bytes(),headers={'Content-Type':'application/zip','If-None-Match':'*'}):pass
            created=True
            download(remote,check)
            if file_hash(package)!=file_hash(check):raise HTTPException(502,'上传校验失败，未替换云端备份')
            with send('MOVE',remote,headers={'Destination':config()['url']+REMOTE,'Overwrite':'T'}):pass
            created=False
            return {'ok':True,**summary,'size':package.stat().st_size}
    finally:
        if created:
            try:
                with send('DELETE',remote):pass
            except Exception:pass
        TRANSFER.release()

@router.post('/download')
def fetch_remote():
    if not TRANSFER.acquire(blocking=False):raise HTTPException(409,'已有备份传输正在进行')
    try:
        with tempfile.TemporaryDirectory(dir=DATA_DIR) as directory:
            package=Path(directory)/'backup.zip';download(REMOTE,package)
            return prepare(package)
    finally:TRANSFER.release()
