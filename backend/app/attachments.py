import re
import uuid
from urllib.parse import unquote
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from .db import DATA_DIR, get_db
from . import models

ROOT = DATA_DIR / 'attachments'
ROOT.mkdir(exist_ok=True)
router = APIRouter(prefix='/api/attachments', tags=['attachments'])

@router.post('', status_code=201)
async def upload(request: Request, db: Session = Depends(get_db)):
    name = unquote(request.headers.get('x-file-name', '附件')).replace('\\', '/').split('/')[-1].strip()[:255] or '附件'
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data) > 30 * 1024 * 1024:
            raise HTTPException(413, '单个附件最多 30 MB')
    if not data:
        raise HTTPException(422, '附件为空')
    ident = uuid.uuid4().hex
    path = ROOT / ident
    path.write_bytes(data)
    try:
        file = models.Attachment(id=ident, name=name, size=len(data))
        db.add(file)
        db.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {'id': ident, 'name': name, 'size': len(data), 'url': f'/api/attachments/{ident}'}

@router.get('/archive/list')
def archives(db: Session = Depends(get_db)):
    return [{'id':f.id,'name':f.name,'size':f.size,'url':f'/api/attachments/{f.id}'} for f in db.query(models.Attachment).filter_by(is_archive=True).all()]

@router.get('/{ident}')
def download(ident: str, db: Session = Depends(get_db)):
    file = db.get(models.Attachment, ident) if re.fullmatch('[a-f0-9]{32}', ident) else None
    if not file or not (ROOT / ident).is_file():
        raise HTTPException(404, '附件不存在')
    # Always download, never render untrusted HTML/SVG in the application's origin.
    return FileResponse(ROOT / ident, filename=file.name, media_type='application/octet-stream')

@router.delete('/{ident}', status_code=204)
def remove(ident: str, db: Session = Depends(get_db)):
    file = db.get(models.Attachment, ident)
    if not file:
        return
    if file.asset_id or file.is_archive:
        raise HTTPException(409, '附件仍被资产使用，请先在资产编辑中移除')
    db.delete(file)
    db.commit()
    (ROOT / ident).unlink(missing_ok=True)
