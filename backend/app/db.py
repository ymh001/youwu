import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "assetmanager.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def migrate_schema():
    # Additive migration for existing local databases; asset rows stay intact.
    if "deleted_at" not in {column["name"] for column in inspect(engine).get_columns("assets")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE assets ADD COLUMN deleted_at DATETIME"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_assets_deleted_at ON assets(deleted_at)"))

    columns = {column["name"] for column in inspect(engine).get_columns("assets")}
    with engine.begin() as connection:
        for name, declaration in {
            "target_mode": "VARCHAR(16) NOT NULL DEFAULT 'none'",
            "target_date": "VARCHAR(10)", "target_quantity": "FLOAT",
            "target_unit": "VARCHAR(16) NOT NULL DEFAULT '次'", "target_step": "FLOAT NOT NULL DEFAULT 1",
            "target_completed": "FLOAT NOT NULL DEFAULT 0",
            "parent_id": "VARCHAR(32)", "show_on_home": "BOOLEAN NOT NULL DEFAULT 1",
            "include_in_parent": "BOOLEAN NOT NULL DEFAULT 1", "legacy_data": "TEXT"
        }.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE assets ADD COLUMN {name} {declaration}"))

    if "target_mode" not in columns and "target_daily" in columns:
        with engine.begin() as connection:
            connection.execute(text("UPDATE assets SET target_mode='price' WHERE target_daily > 0"))

    if "attachments" in inspect(engine).get_table_names() and "is_archive" not in {c["name"] for c in inspect(engine).get_columns("attachments")}:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE attachments ADD COLUMN is_archive BOOLEAN NOT NULL DEFAULT 0"))


@event.listens_for(Session, "after_commit")
@event.listens_for(Session, "after_rollback")
def clear_derived_cache(session):
    session.info.pop('_children_map', None)
    session.info.pop('_attachment_map', None)
