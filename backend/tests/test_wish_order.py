import unittest
from datetime import datetime, timedelta
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base
from app.models import Asset
from app.schemas import CategoryOrderIn
from app.main import list_assets, reorder_wishes


class WishOrderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([
            Asset(id='a', name='First', type='wish', price=1, sort=0),
            Asset(id='b', name='Second', type='wish', price=2, sort=1),
            Asset(id='asset', name='Owned', type='asset', sort=7),
            Asset(id='trash', name='Deleted', type='wish', sort=9, deleted_at=datetime.utcnow()),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def order(self):
        return [a['id'] for a in list_assets(type='wish', status=None, category_id=None, tag_id=None, q=None, sort='created_desc', db=self.db)]

    def test_reorder_persists_and_list_uses_it(self):
        reorder_wishes(CategoryOrderIn(ids=['b', 'a']), self.db)
        self.db.expire_all()
        self.assertEqual(self.order(), ['b', 'a'])
        self.assertEqual(self.db.get(Asset, 'asset').sort, 7)
        self.assertEqual(self.db.get(Asset, 'trash').sort, 9)
        self.assertEqual(self.db.get(Asset, 'b').price, 2)

    def test_stale_duplicates_and_non_wishes_rejected_atomically(self):
        for ids in [['a'], ['a', 'a'], ['a', 'asset'], ['a', 'trash'], ['a', 'unknown']]:
            with self.assertRaises(HTTPException) as error:
                reorder_wishes(CategoryOrderIn(ids=ids), self.db)
            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual(self.order(), ['a', 'b'])

    def test_unsorted_new_wish_appears_first(self):
        self.db.add(Asset(id='new', name='New', type='wish', created_at=datetime.utcnow()+timedelta(seconds=1)))
        self.db.commit()
        self.assertEqual(self.order(), ['new', 'a', 'b'])
