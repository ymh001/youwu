import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from datetime import date, datetime
import pyzipper
from PIL import Image
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from app import backup, models, schemas, crud, attachments
from app.main import _apply_payload
from app.db import Base

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.media=self.root/'media';self.files=self.root/'attachments';self.staging=self.root/'.imports'
        for p in (self.media,self.files,self.staging):p.mkdir()
        self.patches=[patch.object(backup,'DATA_DIR',self.root),patch.object(backup,'MEDIA_DIR',self.media),patch.object(backup,'ATTACHMENTS',self.files),patch.object(backup,'STAGING',self.staging)]
        for p in self.patches:p.start()
        self.engine=create_engine('sqlite://');Base.metadata.create_all(self.engine);self.db=Session(self.engine)
        self.ident='a'*32;folder=self.media/self.ident;folder.mkdir()
        Image.new('RGBA',(20,10),(12,34,56,78)).save(folder/'display.png');Image.new('RGB',(20,10),'white').save(folder/'original.jpg')
        self.parent=models.Asset(id='b'*32,name='主资产',price=100,purchase_date=date.today(),image_url=f'/media/{self.ident}/display.png',notes='文字备注')
        self.child=models.Asset(id='c'*32,name='附属资产',price=20,parent_id=self.parent.id,show_on_home=False,include_in_parent=True,purchase_date=date.today(),legacy_data='{"source":"retained"}')
        self.deleted=models.Asset(id='d'*32,name='回收站资料',price=30,deleted_at=datetime.utcnow())
        self.file=models.Attachment(id='e'*32,asset_id=self.parent.id,name='发票.pdf',size=8);(self.files/self.file.id).write_bytes(b'%PDF-1.7')
        self.db.add_all([self.parent,self.child,self.deleted,self.file]);self.db.commit()
    def tearDown(self):
        self.db.close();self.engine.dispose()
        for p in reversed(self.patches):p.stop()
        self.temp.cleanup()
    def package(self):
        output=self.root/'backup.zip';backup.export_package(self.db,output);return output
    def test_roundtrip_preserves_ids_relations_images_attachments_and_excludes_trash(self):
        output=self.package()
        with zipfile.ZipFile(output) as z:
            data=json.loads(z.read('data.json'));self.assertEqual(len(data['assets']),2);self.assertEqual(len(data['attachments']),1)
            self.assertNotIn('account.db',z.namelist());self.assertEqual(z.read('attachments/'+'e'*32),b'%PDF-1.7')
        report=backup.prepare(output);self.assertEqual(report['accessories'],1)
        result=backup.apply_package(report['token'],'replace',self.db);self.assertEqual(result['imported'],2)
        self.db.expire_all();child=self.db.get(models.Asset,'c'*32);parent=self.db.get(models.Asset,'b'*32)
        self.assertEqual(child.parent_id,parent.id);self.assertFalse(child.show_on_home);self.assertEqual(child.legacy_data,'{"source":"retained"}')
        self.assertEqual(crud.serialize_asset(parent)['combined_cost'],120)
        self.assertIsNotNone(self.db.get(models.Asset,'d'*32).deleted_at)
        self.assertEqual(len(crud.serialize_asset(parent)['attachments']),1)
        original=self.media/parent.image_url.split('/')[2]/'original.jpg'
        self.assertEqual(original.read_bytes(),(self.media/self.ident/'original.jpg').read_bytes())
        report=backup.prepare(output);result=backup.apply_package(report['token'],'merge',self.db);self.assertEqual(result['skipped'],2)
    def test_corrupt_file_and_traversal_rejected_before_writes(self):
        output=self.package()
        with zipfile.ZipFile(output) as z: contents={n:z.read(n) for n in z.namelist()}
        contents['attachments/'+'e'*32]=b'corrupt!'
        with zipfile.ZipFile(self.root/'bad.zip','w') as z:
            for n,v in contents.items():z.writestr(n,v)
        with self.assertRaises(HTTPException):backup.prepare(self.root/'bad.zip')
        with zipfile.ZipFile(self.root/'traversal.zip','w') as z:z.writestr('../escape',b'bad')
        with self.assertRaises(HTTPException):backup.prepare(self.root/'traversal.zip')
        self.assertEqual(self.db.query(models.Asset).count(),3)
    def test_failed_commit_keeps_previous_rows_and_removes_installed_files(self):
        report=backup.prepare(self.package());before=set(self.media.iterdir())
        def fail(session):raise RuntimeError('simulated disk failure')
        event.listen(self.db,'before_commit',fail)
        try:
            with self.assertRaises(RuntimeError):backup.apply_package(report['token'],'replace',self.db)
        finally:event.remove(self.db,'before_commit',fail)
        self.assertEqual(self.db.query(models.Asset).count(),3);self.assertEqual(set(self.media.iterdir()),before)
        self.assertEqual(self.db.get(models.Asset,'b'*32).notes,'文字备注')
    def test_encrypted_legacy_archive_and_wrong_password(self):
        source={'assets':[{'id':'old-parent','name':'旧资产','price':100,'buy_date':1704067200,'type':0,'state':2,'used_price':10,'sell_date':1704153600,'cover_image':'photo.jpg','additional_item_ids':['old-child']},{'id':'old-child','name':'旧附属','price':20,'type':2,'state':0}], 'categories':[],'tags':[],'asset_images':[{'image_file_name':'photo.jpg'}]}
        output=self.root/'legacy.ias'
        with pyzipper.AESZipFile(str(output),'w',compression=pyzipper.ZIP_DEFLATED,encryption=pyzipper.WZ_AES) as z:
            z.setpassword(b'fixture-password');z.writestr('data.json',json.dumps(source));z.writestr('images/photo.jpg',(self.media/self.ident/'original.jpg').read_bytes());z.writestr('images/unlinked.jpg',(self.media/self.ident/'original.jpg').read_bytes())
        with self.assertRaises(HTTPException):backup.prepare(output,'wrong')
        report=backup.prepare(output,'fixture-password');self.assertEqual(report['attachments'],1);self.assertEqual((report['assets'],report['sold'],report['accessories']),(2,1,1))
        backup.apply_package(report['token'],'merge',self.db)
        parent=self.db.query(models.Asset).filter_by(name='旧资产').one();child=self.db.query(models.Asset).filter_by(name='旧附属').one()
        self.assertEqual(self.db.query(models.Attachment).filter_by(is_archive=True).count(),1)
        self.assertEqual(child.parent_id,parent.id);self.assertTrue(child.include_in_parent);self.assertEqual(parent.sold_price,10);self.assertEqual(parent.sold_date,date(2024,1,2))
        self.assertEqual(backup.apply_package(backup.prepare(output,'fixture-password')['token'],'merge',self.db)['skipped'],2)
    def test_cycles_rejected_and_parent_edit_preserves_attachment(self):
        with self.assertRaises(HTTPException):_apply_payload(self.parent,{'parent_id':self.child.id},self.db)
        self.db.rollback()
        _apply_payload(self.child,{'include_in_parent':False},self.db);self.db.commit()
        self.assertEqual(crud.serialize_asset(self.parent)['combined_cost'],100)
        _apply_payload(self.parent,{'notes':'changed'},self.db);self.db.commit()
        self.assertEqual(self.db.get(models.Attachment,self.file.id).asset_id,self.parent.id)
    def test_target_modes_roundtrip_and_manual_increment(self):
        from app.main import increment_target
        _apply_payload(self.parent,{'target_mode':'custom','target_quantity':20,'target_unit':'公里','target_step':2.5,'target_completed':3},self.db)
        self.db.commit()
        increment_target(self.parent.id,self.db)
        self.db.expire_all()
        self.assertEqual(self.db.get(models.Asset,self.parent.id).target_completed,5.5)
        output=self.package();backup.apply_package(backup.prepare(output)['token'],'replace',self.db)
        a=self.db.get(models.Asset,'b'*32)
        self.assertEqual((a.target_mode,a.target_quantity,a.target_unit,a.target_step,a.target_completed),('custom',20,'公里',2.5,5.5))
        _apply_payload(a,{'target_mode':'price','target_daily':5},self.db);self.db.commit()
        _apply_payload(a,{'target_mode':'none','target_daily':None},self.db);self.db.commit()
        self.assertIsNone(a.target_daily)
        with self.assertRaises(HTTPException):increment_target(a.id,self.db)
    def test_target_validation_rejects_invalid_dates_and_empty_quantity(self):
        from pydantic import ValidationError
        for payload in ({'target_mode':'price','target_daily':0},{'target_mode':'date','target_date':'2000-01-01'},{'target_mode':'custom','target_quantity':None}):
            with self.assertRaises(HTTPException):_apply_payload(self.parent,payload,self.db)
            self.db.rollback()
        with self.assertRaises(ValidationError):schemas.AssetIn(name='test',target_step=0)
        with self.assertRaises(ValidationError):schemas.AssetIn(name='test',target_completed=-1)
    def test_wish_conversion_requires_purchase_date_and_preserves_identity(self):
        self.parent.type='wish';self.parent.purchase_date=None;self.db.commit()
        with self.assertRaises(HTTPException):_apply_payload(self.parent,{'type':'asset'},self.db)
        self.db.rollback()
        _apply_payload(self.parent,{'type':'asset','purchase_date':date.today().isoformat()},self.db);self.db.commit()
        self.assertEqual(self.parent.id,'b'*32)
        self.assertEqual(self.parent.notes,'文字备注')
        self.assertEqual(self.db.get(models.Attachment,self.file.id).asset_id,self.parent.id)
