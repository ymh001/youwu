"""Versioned self-contained backups and staged, transactional restores."""
import hashlib
import io
import json
import math
import os
import re
import shutil
import tempfile
import time
import uuid
import zipfile
from datetime import date, datetime, timezone, timedelta
from pathlib import Path, PurePosixPath
from threading import RLock

import pyzipper
from PIL import Image, ImageOps
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Literal
from sqlalchemy.orm import Session
from sqlalchemy import or_
from . import models, crud, schemas
from .db import DATA_DIR, get_db
from .media import MEDIA_DIR
from .attachments import ROOT as ATTACHMENTS

router = APIRouter(prefix='/api/backup', tags=['backup'])
STAGING = DATA_DIR / '.imports'
STAGING.mkdir(exist_ok=True)
MAX_PACKAGE = 512 * 1024 * 1024
MAX_EXPANDED = 2 * 1024 * 1024 * 1024
LOCK = RLock()


def dump(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def export_package(db, output):
    assets = db.query(models.Asset).filter(models.Asset.deleted_at.is_(None)).all()
    asset_ids = {a.id for a in assets}
    payload = {'format': 'keeps', 'version': 2, 'exported_at': datetime.now(timezone.utc).isoformat(),
        'assets': [], 'categories': [crud.serialize_category(c) for c in db.query(models.Category).all()],
        'tags': [crud.serialize_tag(t) for t in db.query(models.Tag).all()], 'attachments': []}
    files = {}
    for a in assets:
        record = crud.serialize_asset(a)
        record['tag_ids'] = [t.id for t in a.tags]
        record['sort'] = a.sort or 0
        record['updated_at'] = a.updated_at.isoformat() if a.updated_at else None
        if record['parent_id'] not in asset_ids:
            record['parent_id'] = None
            record['show_on_home'] = True
        url = record.get('image_url')
        if url:
            if re.fullmatch(r'/media/[a-f0-9]{32}/display.png', url):
                ident = url.split('/')[2]
                folder = MEDIA_DIR / ident
                originals = [p for p in (folder / 'original.jpg', folder / 'original.png', folder / 'original.heic') if p.is_file()]
                if len(originals) != 1 or not (folder / 'display.png').is_file():
                    raise HTTPException(422, f'资产「{a.name}」图片文件不完整，未生成备份')
                for path in [originals[0], folder / 'display.png']:
                    files[f'media/{ident}/{path.name}'] = path
            elif re.fullmatch(r'/demo/[a-z-]+\.jpg', url):
                path = Path(__file__).resolve().parents[2] / 'web' / 'public' / url.lstrip('/')
                if not path.is_file():
                    path = Path(__file__).resolve().parents[2] / 'web' / 'dist' / url.lstrip('/')
                if not path.is_file():
                    raise HTTPException(422, '演示图片缺失')
                ident = digest(path.read_bytes())[:32]
                files[f'media/{ident}/original.jpg'] = path
                # Convert demo pixels, rather than renaming JPEG bytes to PNG.
                with Image.open(path) as im:
                    out = io.BytesIO(); im.save(out, 'PNG', compress_level=0)
                files[f'media/{ident}/display.png'] = out.getvalue()
                record['image_url'] = f'/media/{ident}/display.png'
            else:
                raise HTTPException(422, f'资产「{a.name}」仍使用外部图片地址，请先上传图片再备份')
        payload['assets'].append(record)
    for f in db.query(models.Attachment).filter(or_(models.Attachment.asset_id.in_(asset_ids), models.Attachment.is_archive.is_(True))).all():
        path = ATTACHMENTS / f.id
        if not path.is_file():
            raise HTTPException(422, f'附件「{f.name}」文件缺失')
        files[f'attachments/{f.id}'] = path
        payload['attachments'].append({'id': f.id, 'asset_id': f.asset_id, 'name': f.name, 'size': f.size, 'is_archive': bool(f.is_archive)})
    files['data.json'] = dump(payload)
    manifest = {'format': 'keeps', 'version': 2, 'exported_at': payload['exported_at'], 'files': {}}
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
        for name, source in files.items():
            if isinstance(source, bytes):
                archive.writestr(name, source)
                manifest['files'][name] = {'sha256': digest(source), 'size': len(source)}
            else:
                archive.write(source, name)
                manifest['files'][name] = {'sha256': file_hash(source), 'size': source.stat().st_size}
        archive.writestr('manifest.json', dump(manifest))
    return {'assets': len(assets), 'images': len({r['image_url'] for r in payload['assets'] if r.get('image_url')}), 'attachments': len(payload['attachments'])}


@router.get('/export')
def export(db: Session = Depends(get_db)):
    fd, filename = tempfile.mkstemp(suffix='.zip', dir=DATA_DIR)
    os.close(fd)
    path = Path(filename)
    try:
        with LOCK:
            export_package(db, path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return FileResponse(path, media_type='application/zip', filename=f'keeps-backup-{date.today()}.zip', background=BackgroundTask(path.unlink, missing_ok=True))


def legacy_convert(data, folder):
    warnings = ['旧包只有单份资产图片，作为来源图并生成展示图；不会虚构缺失的拍摄原图。',
                '附属物品默认计入主物品成本；可在资产编辑中逐项修改。',
                '旧平台提醒、目标等未对应的字段已保存在资产的旧平台原始资料中，可下载核对。']
    records = [a for a in data['assets'] if not a.get('is_deleted')]
    cats = [c for c in data.get('categories', []) if not c.get('is_deleted')]
    tags = [t for t in data.get('tags', []) if not t.get('is_deleted')]
    def ident(old): return uuid.uuid5(uuid.NAMESPACE_URL, 'legacy-asset:' + str(old)).hex
    def day(value):
        if value in (None, ''): return None
        return datetime.fromtimestamp(float(value), timezone(timedelta(hours=8))).date().isoformat()
    def stamp(value):
        return datetime.fromtimestamp(float(value), timezone.utc).isoformat() if value else None
    parents = {}
    for a in records:
        for child in a.get('additional_item_ids', []):
            if child in parents and parents[child] != a['id']:
                raise HTTPException(422, '旧数据存在一个附属物品属于多个主资产的冲突')
            parents[child] = a['id']
    valid = {a['id'] for a in records}
    out = {'format':'keeps', 'version':2, 'assets':[], 'categories':[], 'tags':[], 'attachments':[]}
    for c in cats:
        out['categories'].append({'id':ident(c['id']), 'name':c.get('title') or '未命名', 'icon':'', 'color':'#007aff', 'sort':c.get('sort',0)})
    for t in tags:
        out['tags'].append({'id':ident(t['id']), 'name':t.get('title') or '未命名', 'color':'#94a3b8', 'sort':t.get('sort',0)})
    used_images = set()
    for a in records:
        if a.get('type',0) not in (0,1,2) or a.get('state',0) not in (0,1,2) or a.get('cost_rule_value',0) not in (0,1,2):
            raise HTTPException(422, '旧备份包含尚未识别的类型或成本规则，未导入')
        parent = parents.get(a['id'])
        if parent and parent not in valid:
            warnings.append('部分附属物品的主资产已删除，恢复为独立资产。'); parent = None
        status = {0:'serving',1:'retired',2:'sold'}[a.get('state',0)]
        typ = 'wish' if a.get('type') == 1 else 'asset'
        image_url = None
        if a.get('cover_image'):
            name = a['cover_image']
            if Path(name).name != name:
                raise HTTPException(422, '旧图片路径无效')
            source = folder / 'images' / name
            if not source.is_file():
                raise HTTPException(422, '旧备份缺少资产图片：' + name)
            used_images.add(name)
            media_id = file_hash(source)[:32]
            target = folder / 'media' / media_id
            target.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as im:
                im.load()
                original_ext = 'png' if im.format == 'PNG' else 'jpg' if im.format == 'JPEG' else 'heic' if im.format == 'HEIF' else None
                if original_ext:
                    shutil.copyfile(source, target / ('original.' + original_ext))
                else:
                    im.save(target / 'original.png', 'PNG')
                display = ImageOps.exif_transpose(im).convert('RGBA')
                display.save(target / 'display.png', 'PNG', compress_level=0)
            image_url = f'/media/{media_id}/display.png'
        record = dict(id=ident(a['id']), name=a.get('name') or '未命名', price=float(a.get('price') or 0), type=typ, status=status,
            purchase_date=day(a.get('buy_date')) if typ == 'asset' else None, wish_date=day(a.get('buy_date')) if typ == 'wish' else None,
            sold_price=float(a.get('used_price') or 0) if status == 'sold' else None,
            sold_date=day(a.get('sell_date')) if status=='sold' else None, retired_date=day(a.get('retirement_date')) if status=='retired' else None,
            created_at=stamp(a.get('created_at')), updated_at=stamp(a.get('update_at')), category_id=ident(a['category_id']) if a.get('category_id') in {c['id'] for c in cats} else None,
            tag_ids=[ident(i) for i in a.get('tag_ids',[]) if i in {t['id'] for t in tags}], image_url=image_url, notes=a.get('note') or '',
            cost_rule={0:'per_day',1:'per_use',2:'custom'}[a.get('cost_rule_value',0)], used_count=int(a.get('used_count') or 0),
            target_daily=a.get('target_cost'), is_pinned=bool(a.get('is_top')), exclude_total=bool(a.get('is_excluded_from_total')),
            exclude_daily=bool(a.get('is_not_include_total')), parent_id=ident(parent) if parent else None,
            show_on_home=not bool(parent), include_in_parent=True, sort=a.get('sort') or 0, legacy_data=json.dumps(a, ensure_ascii=False))
        if status == 'sold' and not record['sold_date'] or status == 'retired' and not record['retired_date']:
            warnings.append('部分旧记录缺少状态日期，已保留为空，需核对补填。')
        out['assets'].append(record)
    unused = [p for p in (folder/'images').glob('*') if p.is_file() and p.name not in used_images]
    (folder/'attachments').mkdir(exist_ok=True)
    for source in unused:
        attachment_id = ident('unlinked-image:' + source.name)
        shutil.copyfile(source,folder/'attachments'/attachment_id)
        out['attachments'].append({'id':attachment_id,'asset_id':None,'name':'未关联图片-'+source.name,'size':source.stat().st_size,'is_archive':True})
    if unused:
        warnings.append(f'{len(unused)} 张未关联图片已保留到迁移档案，可在备份界面下载核对，并随完整备份保存。')
    if len(records) != len(data['assets']):
        warnings.append(f'跳过 {len(data["assets"])-len(records)} 条旧平台已删除记录。')
    return out, list(dict.fromkeys(warnings))


from .targets import validate_target

def validate(data, folder):
    if data.get('format') != 'keeps' or data.get('version') != 2:
        raise HTTPException(422, '不支持的备份版本')
    def ids(rows):
        values = [r.get('id','') for r in rows]
        if len(values) != len(set(values)) or any(not re.fullmatch('[a-f0-9]{32}', i) for i in values):
            raise HTTPException(422, '备份 ID 重复或格式无效')
        return set(values)
    assets = data['assets']; aids = ids(assets); cids = ids(data['categories']); tids = ids(data['tags']); ids(data.get('attachments',[]))
    parents = {a['id']:a.get('parent_id') for a in assets}
    types = {a['id']:a.get('type','asset') for a in assets}
    for c in data['categories']: schemas.CategoryIn(**c)
    for t in data['tags']: schemas.TagIn(**t)
    for a in assets:
        if 'target_mode' not in a: a['target_mode'] = 'price' if (a.get('target_daily') or 0) > 0 else 'none'
        validate_target(a)
        schemas.AssetIn(**a)
        for key in ('price','sold_price','custom_daily','target_daily'):
            if a.get(key) is not None and not math.isfinite(float(a[key])):
                raise HTTPException(422, '金额包含无效数值')
        for key in ('purchase_date','sold_date','retired_date','wish_date'):
            if a.get(key) and not crud.parse_date(a[key]): raise HTTPException(422, '备份日期无效')
        for key in ('created_at','updated_at'):
            if a.get(key): datetime.fromisoformat(a[key].replace('Z','+00:00'))
        if a.get('category_id') and a['category_id'] not in cids or any(t not in tids for t in a.get('tag_ids',[])):
            raise HTTPException(422, '分类或标签关联缺失')
        seen = {a['id']}; parent = a.get('parent_id')
        while parent:
            if parent not in aids or parent in seen or types[parent] != 'asset' or a.get('type') == 'wish':
                raise HTTPException(422, '附属关系缺失、类型不符或形成循环')
            seen.add(parent); parent = parents[parent]
        url = a.get('image_url')
        if url:
            if not re.fullmatch(r'/media/[a-f0-9]{32}/display.png',url): raise HTTPException(422,'图片路径无效')
            group = folder / url.lstrip('/')
            originals = [group.parent/f'original.{ext}' for ext in ('jpg','png','heic') if (group.parent/f'original.{ext}').is_file()]
            if not group.is_file() or len(originals)!=1: raise HTTPException(422,'图片缺少原图或展示图')
            for image in [group]+originals:
                with Image.open(image) as decoded: decoded.verify()
    for f in data.get('attachments',[]):
        if (f['asset_id'] not in aids and not (f.get('is_archive') and f['asset_id'] is None)) or not isinstance(f.get('name'), str) or not f['name'] or len(f['name']) > 255:
            raise HTTPException(422, '附件关联或名称无效')
        path = folder/'attachments'/f['id']
        if not path.is_file() or path.stat().st_size != f['size']: raise HTTPException(422,'附件缺失或大小不符')


def prepare(archive_path, password=None):
    token = uuid.uuid4().hex
    folder = STAGING/token
    folder.mkdir()
    try:
        with pyzipper.AESZipFile(str(archive_path)) as archive:
            infos = [i for i in archive.infolist() if not i.is_dir()]
            if len(infos)>10000 or sum(i.file_size for i in infos)>MAX_EXPANDED:
                raise HTTPException(413, '解压后的文件过多或超过 2 GB')
            names=set()
            for info in infos:
                p=PurePosixPath(info.filename)
                if p.is_absolute() or '..' in p.parts or chr(92) in info.filename or ':' in info.filename or str(p) in names or (info.external_attr>>16)&0o170000==0o120000:
                    raise HTTPException(422,'压缩包包含不安全或重复的路径')
                names.add(str(p))
            encrypted = any(i.flag_bits & 1 for i in infos)
            if encrypted:
                secret = password or ((DATA_DIR/'legacy-backup.key').read_text() if (DATA_DIR/'legacy-backup.key').is_file() else None)
                if not secret: raise HTTPException(422,'压缩包需要解密，请填写备份密码')
                archive.setpassword(secret.encode())
            roots = [i.filename for i in infos if PurePosixPath(i.filename).name=='data.json' and '__MACOSX' not in i.filename]
            if len(roots)!=1: raise HTTPException(422,'压缩包必须包含唯一的 data.json')
            root = PurePosixPath(roots[0]).parent
            total=0
            for info in infos:
                try: relative=PurePosixPath(info.filename).relative_to(root)
                except ValueError: continue
                if '__MACOSX' in relative.parts or relative.name=='.DS_Store': continue
                target=folder/str(relative);target.parent.mkdir(parents=True,exist_ok=True)
                with archive.open(info) as source, target.open('wb') as dest:
                    while True:
                        chunk=source.read(1024*1024)
                        if not chunk:break
                        total+=len(chunk)
                        if total>MAX_EXPANDED:raise HTTPException(413,'解压体积超过限制')
                        dest.write(chunk)
        if (folder/'data.json').stat().st_size > 32*1024*1024: raise HTTPException(413,'数据清单超过 32 MB')
        data=json.loads((folder/'data.json').read_text())
        legacy = 'asset_images' in data
        warnings=[]
        if legacy:
            if not encrypted: raise HTTPException(422,'请选择旧平台原始加密压缩包，不接受预先解密的数据目录或 JSON')
            data,warnings=legacy_convert(data,folder)
        else:
            manifest=json.loads((folder/'manifest.json').read_text())
            if manifest.get('format')!='keeps' or manifest.get('version')!=2:raise HTTPException(422,'备份清单版本不支持')
            required={'data.json'}
            required.update(str(p.relative_to(folder)) for top in ('media','attachments') for p in (folder/top).rglob('*') if p.is_file())
            if set(manifest.get('files',{}))!=required:raise HTTPException(422,'备份清单不完整')
            for name in required:
                record=manifest['files'][name];path=folder/name
                if path.stat().st_size!=record['size'] or file_hash(path)!=record['sha256']:raise HTTPException(422,'备份文件校验失败：'+name)
        validate(data,folder)
        # The normalized package is only trusted after all validation succeeded.
        (folder/'normalized.json').write_bytes(dump(data))
        report={'token':token,'source':'旧平台加密备份' if legacy else '有物完整备份','assets':len(data['assets']),
            'images':len({a['image_url'] for a in data['assets'] if a.get('image_url')}),'attachments':len(data.get('attachments',[])),
            'accessories':sum(bool(a.get('parent_id')) for a in data['assets']),
            'sold':sum(a['status']=='sold' for a in data['assets']),'retired':sum(a['status']=='retired' for a in data['assets']),
            'wishes':sum(a['type']=='wish' for a in data['assets']), 'warnings':warnings,
            'items':[{'id':a['id'],'name':a['name'],'status':a['status'],'price':a['price'],'parent_id':a.get('parent_id')} for a in data['assets']]}
        (folder/'report.json').write_bytes(dump(report))
        return report
    except HTTPException:
        shutil.rmtree(folder,ignore_errors=True);raise
    except (RuntimeError, zipfile.BadZipFile, pyzipper.BadZipFile):
        shutil.rmtree(folder,ignore_errors=True);raise HTTPException(422,'解密失败或压缩包损坏，请检查密码与原始文件')
    except Exception:
        shutil.rmtree(folder,ignore_errors=True);raise HTTPException(422,'备份结构、图片或字段无效，未修改现有数据')


@router.post('/preview')
async def preview(request: Request):
    # Expire abandoned previews; no live asset files are kept here.
    for old in STAGING.iterdir():
        if old.is_dir() and old.stat().st_mtime < time.time()-86400: shutil.rmtree(old,ignore_errors=True)
    fd,path=tempfile.mkstemp(dir=STAGING,suffix='.upload'); os.close(fd)
    try:
        size=0
        with open(path,'wb') as dest:
            async for chunk in request.stream():
                size+=len(chunk)
                if size>MAX_PACKAGE:raise HTTPException(413,'压缩包最多 512 MB')
                dest.write(chunk)
        from urllib.parse import unquote
        password=unquote(request.headers.get('x-backup-password','')) or None
        return await run_in_threadpool(prepare,path,password)
    finally: Path(path).unlink(missing_ok=True)


class ApplyIn(BaseModel):
    token: str
    mode: Literal['merge','replace'] = 'merge'


def apply_package(token, mode, db):
    if not re.fullmatch('[a-f0-9]{32}',token):raise HTTPException(404,'导入预览不存在')
    folder=STAGING/token
    if not (folder/'normalized.json').is_file():raise HTTPException(404,'导入预览已过期，请重新选择压缩包')
    data=json.loads((folder/'normalized.json').read_text());validate(data,folder)
    installed=[]
    with LOCK:
        try:
            existing={a.id:a for a in db.query(models.Asset).all()}
            skipped={a['id'] for a in data['assets'] if a['id'] in existing and (mode=='merge' or existing[a['id']].deleted_at is not None)}
            incoming=[a for a in data['assets'] if a['id'] not in skipped]
            # Install immutable content-addressed files before committing any database rows.
            image_map={}
            for a in incoming:
                url=a.get('image_url')
                if not url:continue
                source=folder/url.lstrip('/'); group=source.parent
                files=sorted(group.iterdir()); new_id=digest(''.join(file_hash(p) for p in files).encode())[:32]
                target=MEDIA_DIR/new_id
                if not target.exists():
                    temp=MEDIA_DIR/(new_id+'.'+uuid.uuid4().hex+'.tmp');shutil.copytree(group,temp)
                    temp.rename(target);installed.append(target)
                image_map[url]=f'/media/{new_id}/display.png'
            if mode=='replace':
                active_ids=[i for i,a in existing.items() if a.deleted_at is None]
                db.execute(models.asset_tags.delete().where(models.asset_tags.c.asset_id.in_(active_ids)))
                db.query(models.Attachment).filter(or_(models.Attachment.asset_id.in_(active_ids), models.Attachment.is_archive.is_(True))).delete(synchronize_session=False)
                db.query(models.Asset).filter(models.Asset.id.in_(active_ids)).delete(synchronize_session=False)
                db.query(models.ValueSnapshot).delete(synchronize_session=False)
                db.flush();db.expire_all()
            # Keep existing category/tag identities on merge; remap conflicting metadata instead of overwriting trash.
            maps={}
            for key,model in [('categories',models.Category),('tags',models.Tag)]:
                maps[key]={}
                for item in data[key]:
                    values={k:item[k] for k in ('name','icon','color','sort') if k in item and hasattr(model,k)}
                    ident=item['id'];old=db.get(model,ident)
                    if old and any(getattr(old,k)!=v for k,v in values.items()):
                        ident=uuid.uuid5(uuid.NAMESPACE_URL,ident+json.dumps(values,sort_keys=True)).hex;old=db.get(model,ident)
                    if not old:db.add(model(id=ident,**values))
                    maps[key][item['id']]=ident
            db.flush()
            ids={a['id'] for a in incoming}
            for a in incoming:
                parsed=schemas.AssetIn(**a).model_dump()
                fields={k:v for k,v in parsed.items() if hasattr(models.Asset,k) and k not in ('category_id','parent_id')}
                for k in ('purchase_date','sold_date','retired_date','wish_date'):fields[k]=crud.parse_date(fields.get(k))
                fields['image_url']=image_map.get(a.get('image_url'))
                fields['category_id']=maps['categories'].get(a.get('category_id'))
                parent=a.get('parent_id')
                fields['parent_id']=parent if parent in ids or parent in existing and existing[parent].deleted_at is None and mode=='merge' else None
                if parent and not fields['parent_id']:fields['show_on_home']=True
                fields['legacy_data']=a.get('legacy_data');fields['sort']=a.get('sort',0)
                for k in ('created_at','updated_at'):
                    if a.get(k):fields[k]=datetime.fromisoformat(a[k].replace('Z','+00:00')).astimezone(timezone.utc).replace(tzinfo=None) if datetime.fromisoformat(a[k].replace('Z','+00:00')).tzinfo else datetime.fromisoformat(a[k])
                record=models.Asset(id=a['id'],**fields)
                record.tags=db.query(models.Tag).filter(models.Tag.id.in_([maps['tags'][i] for i in a.get('tag_ids',[])])).all()
                db.add(record)
            for f in data.get('attachments',[]):
                if f['asset_id'] not in ids and not f.get('is_archive'):continue
                source=folder/'attachments'/f['id']; ident=f['id']
                target=ATTACHMENTS/ident
                if target.exists() and file_hash(target)!=file_hash(source):
                    ident=uuid.uuid5(uuid.NAMESPACE_URL,ident+file_hash(source)).hex
                    target=ATTACHMENTS/ident
                if db.get(models.Attachment,ident):
                    existing_file=db.get(models.Attachment,ident)
                    if existing_file.asset_id!=f['asset_id'] or existing_file.name!=f['name']:
                        raise HTTPException(422,'附件 ID 冲突，未修改原有数据')
                    continue
                if not target.exists():shutil.copyfile(source,target);installed.append(target)
                db.add(models.Attachment(id=ident,asset_id=f['asset_id'],name=f['name'],size=f['size'],is_archive=bool(f.get('is_archive'))))
            db.flush()
            if mode=='replace':
                keep_categories=set(maps['categories'].values()) | {a.category_id for a in db.query(models.Asset).all() if a.category_id}
                keep_tags=set(maps['tags'].values()) | {row[0] for row in db.query(models.asset_tags.c.tag_id).all()}
                db.query(models.Category).filter(~models.Category.id.in_(keep_categories)).delete(synchronize_session=False)
                db.query(models.Tag).filter(~models.Tag.id.in_(keep_tags)).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
            for p in installed:
                if p.is_dir():shutil.rmtree(p,ignore_errors=True)
                else:p.unlink(missing_ok=True)
            raise
    shutil.rmtree(folder,ignore_errors=True)
    return {'ok':True,'imported':len(incoming),'skipped':len(skipped),'mode':mode}


@router.post('/apply')
def apply(payload: ApplyIn, db: Session = Depends(get_db)):
    try:return apply_package(payload.token,payload.mode,db)
    except HTTPException:raise
    except Exception:raise HTTPException(422,'导入未完成，原有数据库已保留，请检查备份')

@router.delete('/preview/{token}', status_code=204)
def discard(token: str):
    if re.fullmatch('[a-f0-9]{32}', token):shutil.rmtree(STAGING/token,ignore_errors=True)
