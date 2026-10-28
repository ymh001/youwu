import unittest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.db import Base
from app.models import Category
from app.schemas import CategoryOrderIn
from app.main import reorder_categories


class CategoryOrderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.db.add_all([Category(id='a', name='电脑', sort=0), Category(id='b', name='手机', sort=1)])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_order_is_persisted_without_changing_names(self):
        result = reorder_categories(CategoryOrderIn(ids=['b', 'a']), self.db)
        self.assertEqual([c['name'] for c in result], ['手机', '电脑'])
        self.db.expire_all()
        self.assertEqual([c.id for c in self.db.query(Category).order_by(Category.sort)], ['b', 'a'])

    def test_stale_or_duplicate_list_is_rejected_without_partial_change(self):
        for ids in [['b'], ['b', 'b'], ['b', 'unknown']]:
            with self.assertRaises(HTTPException) as error:
                reorder_categories(CategoryOrderIn(ids=ids), self.db)
            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual([c.id for c in self.db.query(Category).order_by(Category.sort)], ['a', 'b'])
