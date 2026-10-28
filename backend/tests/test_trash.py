import json
import tempfile
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session
from app import models, schemas, media
from app.db import Base, migrate_schema
from app.main import delete_asset, get_asset, export_data, stats, change_status
from app.trash import restore, retention_days, purge_expired, update_retention, RetentionIn, delete_permanently


class TrashTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.directory = tempfile.TemporaryDirectory()
        self.media_patch = patch.object(media, 'MEDIA_DIR', Path(self.directory.name))
        self.media_patch.start()
        self.folder = Path(self.directory.name) / ('a' * 32)
        self.folder.mkdir()
        (self.folder / 'display.png').write_bytes(b'current display')
        (self.folder / 'original.jpg').write_bytes(b'current original')
        self.category = models.Category(name='电脑')
        self.asset = models.Asset(name='保留原始资料', price=1200, purchase_date=date.today()-timedelta(days=20), notes='备注', category=self.category, image_url=f'/media/{"a" * 32}/display.png')
        self.db.add(self.asset)
        self.db.commit()
        self.id = self.asset.id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.media_patch.stop()
        self.directory.cleanup()

    def test_delete_excludes_from_export_and_stats_but_preserves_data_for_restore(self):
        original_created = self.asset.created_at
        delete_asset(self.id, self.db)
        self.assertIsNotNone(self.asset.deleted_at)
        self.assertTrue(self.folder.exists())
        self.assertEqual(json.loads(export_data(self.db).body)['assets'], [])
        self.assertEqual(stats(db=self.db)['count'], 0)
        with self.assertRaises(HTTPException):
            get_asset(self.id, self.db)
        result = restore(self.id, self.db)
        self.assertEqual(result['notes'], '备注')
        self.assertEqual(result['category_name'], '电脑')
        self.assertEqual(self.asset.created_at, original_created)
        self.assertIsNone(self.asset.deleted_at)
        self.assertTrue(self.folder.exists())

    def test_retention_defaults_to_180_and_never_does_not_purge(self):
        self.assertEqual(retention_days(self.db), 180)
        self.asset.deleted_at = datetime.utcnow()-timedelta(days=365)
        self.db.commit()
        update_retention(RetentionIn(retention_days=None), self.db)
        self.assertIsNone(retention_days(self.db))
        self.assertEqual(purge_expired(self.db), 0)
        result = update_retention(RetentionIn(retention_days=7), self.db)
        self.assertEqual(result['removed'], 1)
        self.assertIsNone(self.db.get(models.Asset, self.id))
        self.assertFalse(self.folder.exists())

    def test_expiry_boundary_only_removes_deleted_records_and_keeps_shared_media(self):
        now = datetime(2026, 10, 27, 6)
        self.asset.deleted_at = now-timedelta(days=180)
        copy = models.Asset(name='仍在使用', price=1, image_url=self.asset.image_url)
        recent = models.Asset(name='刚删除', price=1, deleted_at=now-timedelta(days=179))
        self.db.add_all([copy, recent]); self.db.commit()
        self.assertEqual(purge_expired(self.db, now), 1)
        self.assertIsNotNone(self.db.get(models.Asset, copy.id))
        self.assertIsNotNone(self.db.get(models.Asset, recent.id))
        self.assertTrue(self.folder.exists())
        with self.assertRaises(HTTPException):
            delete_permanently(copy.id, self.db)

    def test_status_requires_price_and_valid_explicit_dates(self):
        for payload in [dict(status='sold', sold_date=date.today().isoformat()), dict(status='retired'), dict(status='retired', retired_date=(date.today()+timedelta(days=1)).isoformat()), dict(status='sold', sold_price=-1, sold_date=date.today().isoformat())]:
            with self.assertRaises(HTTPException):
                change_status(self.id, schemas.StatusIn(**payload), self.db)
            self.assertEqual(self.asset.status, 'serving')
        retired = date.today()-timedelta(days=2)
        result = change_status(self.id, schemas.StatusIn(status='retired', retired_date=retired.isoformat()), self.db)
        self.assertEqual(result['retired_date'], retired.isoformat())
        sold = date.today()-timedelta(days=1)
        result = change_status(self.id, schemas.StatusIn(status='sold', sold_price=0, sold_date=sold.isoformat()), self.db)
        self.assertEqual(result['sold_price'], 0)
        self.assertEqual(result['sold_date'], sold.isoformat())
        self.assertIsNone(result['retired_date'])


class MigrationTests(unittest.TestCase):
    def test_existing_sqlite_rows_survive_additive_migration(self):
        engine = create_engine('sqlite://')
        with engine.begin() as connection:
            connection.execute(text('CREATE TABLE assets (id TEXT PRIMARY KEY, name TEXT)'))
            connection.execute(text("INSERT INTO assets VALUES ('kept', '已有资产')"))
        with patch('app.db.engine', engine):
            migrate_schema()
            migrate_schema()
        self.assertIn('deleted_at', {c['name'] for c in inspect(engine).get_columns('assets')})
        with engine.connect() as connection:
            self.assertEqual(connection.execute(text('SELECT name, deleted_at FROM assets')).first(), ('已有资产', None))
        engine.dispose()
