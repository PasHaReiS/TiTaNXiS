"""Emergent Object Storage — image uploads for VIP attachments,
commander/hero art, and event banners.

MongoDB collection: `files` — canonical source of truth.
  {id, storage_path, original_filename, content_type, size,
   owner_id, purpose (vip|commander|event), is_deleted, created_at}
"""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
from fastapi import APIRouter, Depends, File, HTTPException, Header, Query, UploadFile
from fastapi.responses import Response

log = logging.getLogger("uploads")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() \
    or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "").strip()
APP_NAME = "titanxis"

MAX_BYTES = 8 * 1024 * 1024  # 8 MB
ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "gif"}
MIME_BY_EXT = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "png": "image/png", "webp": "image/webp", "gif": "image/gif",
}

_storage_key: Optional[str] = None


def init_storage(force: bool = False) -> Optional[str]:
    """Mint (once) or reuse a session-scoped storage key. Returns None on failure
    so callers can gracefully disable uploads without crashing the app."""
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    if not EMERGENT_KEY:
        log.warning("EMERGENT_LLM_KEY not set — object storage disabled.")
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init",
                          json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        _storage_key = r.json()["storage_key"]
        log.info("Object storage initialized.")
        return _storage_key
    except Exception as e:
        log.error(f"init_storage failed: {e}")
        return None


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 404:
        # Stale key — re-init once and retry.
        key = init_storage(force=True)
        if not key:
            raise HTTPException(503, "Object storage unavailable")
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()


def _get_object(path: str) -> tuple[bytes, str]:
    key = init_storage()
    if not key:
        raise HTTPException(503, "Object storage unavailable")
    r = requests.get(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 404 and _storage_key:
        # Stale key — re-init once.
        key = init_storage(force=True)
        if key:
            r = requests.get(f"{STORAGE_URL}/objects/{path}",
                             headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")


def register_uploads(api_router: APIRouter, db, require_auth, require_admin):
    async def _optional_user(authorization: Optional[str] = Header(None)):
        if not authorization or not authorization.startswith("Bearer "):
            return None
        try:
            from auth import decode_token
            payload = decode_token(authorization.split(" ", 1)[1])
            return await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        except Exception:
            return None

    @api_router.post("/uploads/image")
    async def upload_image(
        file: UploadFile = File(...),
        purpose: str = Query("vip", regex="^(vip|commander|event|avatar|misc)$"),
        user: dict = Depends(require_auth),
    ):
        filename = file.filename or "upload"
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in ALLOWED_EXT:
            raise HTTPException(400, f"Only image files allowed ({', '.join(sorted(ALLOWED_EXT))})")
        data = await file.read()
        if len(data) == 0:
            raise HTTPException(400, "Empty file")
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"Max size is {MAX_BYTES // 1024 // 1024}MB")
        content_type = MIME_BY_EXT.get(ext, file.content_type or "application/octet-stream")
        file_id = str(uuid.uuid4())
        path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
        result = _put_object(path, data, content_type)
        doc = {
            "id": file_id,
            "storage_path": result["path"],
            "original_filename": filename,
            "content_type": content_type,
            "size": len(data),
            "owner_id": user["id"],
            "purpose": purpose,
            "is_deleted": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.files.insert_one(doc)
        return {
            "id": file_id,
            "url": f"/api/uploads/{file_id}",
            "filename": filename,
            "size": len(data),
            "content_type": content_type,
        }

    @api_router.get("/uploads/{file_id}")
    async def get_file(file_id: str):
        rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "File not found")
        data, ct = _get_object(rec["storage_path"])
        return Response(content=data,
                        media_type=rec.get("content_type") or ct,
                        headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @api_router.delete("/uploads/{file_id}")
    async def delete_file(file_id: str, _: dict = Depends(require_admin)):
        r = await db.files.update_one(
            {"id": file_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc).isoformat()}},
        )
        if r.matched_count == 0:
            raise HTTPException(404, "File not found")
        return {"deleted": True, "id": file_id}
