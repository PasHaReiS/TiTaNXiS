"""OCR Audit Log + Undo (v135.51).

Her başarılı OCR apply çağrısından sonra frontend bu route'a POST atarak ne
yaptığını kaydeder (`op_type`, `created_member_ids`, `updated_member_ids`,
`created_points`, `event_id`). `Geri Al` butonu ilgili op_id ile undo endpoint'ini
çağırır. `pasha@titanxis.com` başkalarının işlemlerini de undo edebilir.
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid, logging

logger = logging.getLogger("ocr_audit")
PASHA_EMAIL = "pasha@titanxis.com"


def _now(): return datetime.now(timezone.utc).isoformat()


class AuditCreate(BaseModel):
    op_type: str  # 'ocr_add_member' | 'ocr_power' | 'ocr_castle_rank' | 'ocr_event_points'
    created_member_ids: Optional[List[str]] = None
    updated_member_ids: Optional[List[str]] = None
    created_point_ids: Optional[List[str]] = None
    event_id: Optional[str] = None
    note: Optional[str] = None


def make_ocr_audit_router(db, require_admin):
    router = APIRouter()

    @router.post("/ocr/audit")
    async def record(body: AuditCreate, user: dict = Depends(require_admin)):
        doc = {
            "id": str(uuid.uuid4()),
            "op_type": body.op_type,
            "user_id": user.get("id"),
            "user_email": user.get("email"),
            "user_name": user.get("username"),
            "created_member_ids": body.created_member_ids or [],
            "updated_member_ids": body.updated_member_ids or [],
            "created_point_ids": body.created_point_ids or [],
            "event_id": body.event_id,
            "note": (body.note or "")[:240],
            "created_at": _now(),
            "undone": False,
        }
        await db.ocr_audit.insert_one(doc)
        return {"ok": True, "id": doc["id"]}

    @router.get("/ocr/audit/recent")
    async def recent(limit: int = 20, user: dict = Depends(require_admin)):
        is_pasha = (user.get("email") or "").lower() == PASHA_EMAIL
        q = {"undone": False} if is_pasha else {"undone": False, "user_id": user.get("id")}
        rows = await db.ocr_audit.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 100))).to_list(100)
        return {"items": rows, "is_pasha": is_pasha}

    @router.post("/ocr/audit/{op_id}/undo")
    async def undo(op_id: str, user: dict = Depends(require_admin)):
        op = await db.ocr_audit.find_one({"id": op_id}, {"_id": 0})
        if not op:
            raise HTTPException(404, "op not found")
        if op.get("undone"):
            raise HTTPException(400, "already undone")
        is_pasha = (user.get("email") or "").lower() == PASHA_EMAIL
        if not is_pasha and op.get("user_id") != user.get("id"):
            raise HTTPException(403, "yalnızca kendi işlemini geri alabilirsin (pasha hariç)")

        deleted_members = 0
        deleted_points = 0
        # Created members: delete
        for mid in (op.get("created_member_ids") or []):
            try:
                r = await db.members.delete_one({"id": mid})
                if r.deleted_count: deleted_members += 1
            except Exception as e:
                logger.warning(f"undo member {mid}: {e}")
        # Created points: delete
        for pid in (op.get("created_point_ids") or []):
            try:
                r = await db.points.delete_one({"id": pid})
                if r.deleted_count: deleted_points += 1
            except Exception as e:
                logger.warning(f"undo point {pid}: {e}")
        await db.ocr_audit.update_one(
            {"id": op_id},
            {"$set": {"undone": True, "undone_at": _now(), "undone_by": user.get("id"),
                      "undone_stats": {"members": deleted_members, "points": deleted_points}}},
        )
        return {"ok": True, "deleted_members": deleted_members, "deleted_points": deleted_points}

    return router


async def ensure_ocr_audit_indexes(db):
    try:
        await db.ocr_audit.create_index("id", unique=True)
        await db.ocr_audit.create_index([("user_id", 1), ("created_at", -1)])
        await db.ocr_audit.create_index([("undone", 1), ("created_at", -1)])
    except Exception as e:
        logger.warning(f"ocr_audit index: {e}")
