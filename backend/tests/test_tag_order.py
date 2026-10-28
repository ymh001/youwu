import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base
from app.models import Tag, Category, Asset
from app.schemas import TagOrderIn, TagIn, CategoryIn
from app.main import reorder_tags, update_tag, update_category, list_tags

class TagOrderTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db=Session(self.engine)
        a=Tag(id='a',name='A',sort=0,color='#123456')
        b=Tag(id='b',name='B',sort=1)
        self.db.add_all([a,b,Asset(id='asset',name='Owned',tags=[a,b]),Category(id='c',name='Cat',sort=8,color='#654321')])
        self.db.commit()
    def tearDown(self):
        self.db.close();self.engine.dispose()
    def test_reorder_keeps_assignments_and_persists(self):
        reorder_tags(TagOrderIn(ids=['b','a']),self.db)
        self.db.expire_all()
        self.assertEqual([t['id'] for t in list_tags(self.db)],['b','a'])
        self.assertEqual({t.id for t in self.db.get(Asset,'asset').tags},{'a','b'})
    def test_invalid_or_stale_order_does_not_partially_save(self):
        for ids in [['b'],['b','b'],['b','unknown']]:
            with self.assertRaises(HTTPException) as e:reorder_tags(TagOrderIn(ids=ids),self.db)
            self.assertEqual(e.exception.status_code,409)
            self.assertEqual([t['id'] for t in list_tags(self.db)],['a','b'])
    def test_rename_keeps_sort_and_color(self):
        reorder_tags(TagOrderIn(ids=['b','a']),self.db)
        update_tag('a',TagIn(name='Renamed'),self.db)
        update_category('c',CategoryIn(name='Renamed category'),self.db)
        self.db.expire_all()
        self.assertEqual((self.db.get(Tag,'a').sort,self.db.get(Tag,'a').color),(1,'#123456'))
        self.assertEqual((self.db.get(Category,'c').sort,self.db.get(Category,'c').color),(8,'#654321'))
