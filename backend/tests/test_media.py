import asyncio
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app import media, models
from app.db import Base


class Request:
    def __init__(self, data):
        self.data = data

    async def stream(self):
        yield self.data


class ImageStorageTests(unittest.TestCase):
    def test_transparent_display_is_unchanged_and_source_downloadable(self):
        source = Image.new("RGBA", (32, 20), (10, 80, 210, 120))
        data = io.BytesIO()
        source.save(data, format="PNG")
        with tempfile.TemporaryDirectory() as directory, patch.object(media, "MEDIA_DIR", Path(directory)):
            result = asyncio.run(media.upload_image(Request(data.getvalue())))
            image_id = result["image_url"].split("/")[2]
            folder = Path(directory) / image_id
            self.assertEqual({p.name for p in folder.iterdir()}, {"original.png", "display.png"})
            with Image.open(folder / "display.png") as display:
                self.assertEqual(display.size, source.size)
                self.assertEqual(display.tobytes(), source.tobytes())
            response = media.download_original(image_id)
            self.assertEqual(Path(response.path).name, "original.png")

    def test_only_original_is_downscaled(self):
        source = Image.new("RGB", (2600, 100), (12, 90, 200))
        data = io.BytesIO()
        source.save(data, format="PNG")
        with tempfile.TemporaryDirectory() as directory, patch.object(media, "MEDIA_DIR", Path(directory)):
            result = asyncio.run(media.upload_image(Request(data.getvalue())))
            folder = Path(directory) / result["image_url"].split("/")[2]
            with Image.open(folder / "display.png") as display, Image.open(folder / "original.jpg") as original:
                self.assertEqual(display.size, (2600, 100))
                self.assertEqual(original.width, 2400)
            self.assertEqual(len(list(folder.iterdir())), 2)

    def test_invalid_and_oversize_images_are_rejected_without_files(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(media, "MEDIA_DIR", Path(directory)):
            with self.assertRaises(HTTPException) as caught:
                asyncio.run(media.upload_image(Request(b"not an image")))
            self.assertEqual(caught.exception.status_code, 422)
            with patch.object(media, "MAX_BYTES", 2), self.assertRaises(HTTPException) as caught:
                asyncio.run(media.upload_image(Request(b"123")))
            self.assertEqual(caught.exception.status_code, 413)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_copy_keeps_shared_image_until_last_reference_is_removed(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        image_id = "a" * 32
        url = f"/media/{image_id}/display.png"
        with tempfile.TemporaryDirectory() as directory, patch.object(media, "MEDIA_DIR", Path(directory)), Session(engine) as db:
            folder = Path(directory) / image_id
            folder.mkdir()
            (folder / "display.png").write_bytes(b"image")
            first = models.Asset(name="first", price=1, image_url=url)
            second = models.Asset(name="copy", price=1, image_url=url)
            db.add_all([first, second])
            db.commit()
            db.delete(first)
            db.commit()
            self.assertFalse(media.remove_unreferenced_image(url, db))
            self.assertTrue(folder.exists())
            db.delete(second)
            db.commit()
            self.assertTrue(media.remove_unreferenced_image(url, db))
            self.assertFalse(folder.exists())
        engine.dispose()

    def test_original_path_cannot_traverse(self):
        with self.assertRaises(HTTPException) as caught:
            media.download_original("../assetmanager.db")
        self.assertEqual(caught.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
