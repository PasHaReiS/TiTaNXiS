"""One-shot migration: move legacy commander/hero images from
`/app/uploads/*` into Emergent Object Store, register each in the
`files` collection with the same file id (extension included) so
existing `/api/uploads/{hash}.jpg` URLs keep resolving through the
new object-store GET route without touching any commander/event doc.

Safe to run repeatedly — every step is idempotent:
  • Files already present in `files` (by id) are skipped.
  • Local blobs are LEFT ON DISK; the caller may delete them manually
    after verifying object-store roundtrip works.

Run standalone:      python -m backend.scripts.migrate_legacy_uploads
Or programmatically: `await migrate_legacy_uploads(db)`
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


LEGACY_DIR = Path("/app/uploads")
APP_NAME = "titanxis"
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "gif"}

log = logging.getLogger("legacy-migrate")


async def migrate_legacy_uploads(db) -> dict:
    """Upload every legacy file in LEGACY_DIR to Object Store and record it
    in the `files` collection. Returns a small summary so callers (startup
    hook / admin route) can surface progress.
    """
    from routes.uploads import _put_object, MIME_BY_EXT

    if not LEGACY_DIR.exists():
        return {"migrated": 0, "skipped": 0, "failed": 0, "missing_dir": True}

    migrated = 0
    skipped = 0
    failed = 0
    for p in sorted(LEGACY_DIR.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lstrip(".").lower()
        if ext not in ALLOWED_EXT:
            continue
        # Preserve the extension inside the id so old URLs like
        # `/api/uploads/abc.jpg` still match the new `{file_id}` route.
        file_id = p.name  # e.g. "abc123.jpg"
        existing = await db.files.find_one({"id": file_id}, {"_id": 0, "id": 1})
        if existing:
            skipped += 1
            continue
        try:
            data = p.read_bytes()
            content_type = MIME_BY_EXT.get(ext, mimetypes.guess_type(p.name)[0]
                                           or "application/octet-stream")
            path = f"{APP_NAME}/uploads/legacy/{file_id}"
            result = _put_object(path, data, content_type)
            await db.files.insert_one({
                "id": file_id,
                "storage_path": result["path"],
                "original_filename": p.name,
                "content_type": content_type,
                "size": len(data),
                "owner_id": "legacy",
                "purpose": "legacy",
                "is_deleted": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "migrated_from_disk_at": datetime.now(timezone.utc).isoformat(),
            })
            migrated += 1
        except Exception as e:  # pragma: no cover — telemetry only
            log.warning(f"legacy migration failed for {p.name}: {e}")
            failed += 1
    if migrated or skipped or failed:
        log.info(f"legacy uploads: migrated={migrated} skipped={skipped} failed={failed}")
    return {"migrated": migrated, "skipped": skipped, "failed": failed}


if __name__ == "__main__":  # pragma: no cover — manual run only
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s [%(name)s] %(message)s")
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    print(asyncio.run(migrate_legacy_uploads(db)))
