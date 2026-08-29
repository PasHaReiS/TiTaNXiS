"""Admin To-Do list (v135.31).

Lonca yönetimiyle ilgili özel görev listesi. Sadece admin. CRUD + toggle
done. `assigned_to` username string; validation seçime kalıyor (tipik
kullanımda admin herhangi bir üye adı yazabilir).
"""
from datetime import datetime, timezone
from typing import Optional
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("admin_todos")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    # ISO date (YYYY-MM-DD) or full ISO datetime; frontend uses `<input type="date">`.
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    note: Optional[str] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[str] = None
    assigned_to: Optional[str] = None
    note: Optional[str] = None
    done: Optional[bool] = None


def make_admin_todos_router(db, require_admin):
    router = APIRouter()

    def _serialize(d: dict) -> dict:
        d = {k: v for k, v in d.items() if k != "_id"}
        d.setdefault("done", False)
        return d

    @router.get("/admin-todos")
    async def list_todos(
        status: Optional[str] = None,  # 'open' | 'done' | None (all)
        _: dict = Depends(require_admin),
    ):
        q = {}
        if status == "open":
            q["done"] = {"$ne": True}
        elif status == "done":
            q["done"] = True
        cursor = db.admin_todos.find(q, {"_id": 0}).sort([("done", 1), ("due_date", 1), ("created_at", -1)])
        items = [_serialize(x) async for x in cursor]
        return {
            "items": items,
            "count": len(items),
            "open_count": sum(1 for x in items if not x.get("done")),
            "done_count": sum(1 for x in items if x.get("done")),
        }

    @router.post("/admin-todos")
    async def create_todo(body: TodoCreate, user: dict = Depends(require_admin)):
        now = _now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "title": body.title.strip(),
            "due_date": (body.due_date or "").strip() or None,
            "assigned_to": (body.assigned_to or "").strip() or None,
            "note": (body.note or "").strip() or None,
            "done": False,
            "done_at": None,
            "done_by": None,
            "created_at": now,
            "updated_at": now,
            "created_by_username": (user or {}).get("username") or "sistem",
        }
        await db.admin_todos.insert_one(doc)
        return {"ok": True, "item": _serialize(doc)}

    @router.patch("/admin-todos/{tid}")
    async def update_todo(tid: str, body: TodoUpdate, user: dict = Depends(require_admin)):
        existing = await db.admin_todos.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "todo not found")
        upd = {}
        if body.title is not None:
            t = body.title.strip()
            if not t:
                raise HTTPException(400, "title cannot be empty")
            upd["title"] = t
        if body.due_date is not None:
            upd["due_date"] = body.due_date.strip() or None
        if body.assigned_to is not None:
            upd["assigned_to"] = body.assigned_to.strip() or None
        if body.note is not None:
            upd["note"] = body.note.strip() or None
        if body.done is not None:
            upd["done"] = bool(body.done)
            upd["done_at"] = _now_iso() if body.done else None
            upd["done_by"] = (user or {}).get("username") if body.done else None
        if not upd:
            return {"ok": True, "item": _serialize(existing)}
        upd["updated_at"] = _now_iso()
        await db.admin_todos.update_one({"id": tid}, {"$set": upd})
        doc = await db.admin_todos.find_one({"id": tid}, {"_id": 0})
        return {"ok": True, "item": _serialize(doc)}

    @router.delete("/admin-todos/{tid}")
    async def delete_todo(tid: str, _: dict = Depends(require_admin)):
        r = await db.admin_todos.delete_one({"id": tid})
        if r.deleted_count == 0:
            raise HTTPException(404, "todo not found")
        return {"ok": True}

    return router


async def ensure_admin_todos_indexes(db):
    try:
        await db.admin_todos.create_index("id", unique=True)
        await db.admin_todos.create_index([("done", 1), ("due_date", 1)])
    except Exception as e:
        logger.warning(f"admin_todos index ensure: {e}")
