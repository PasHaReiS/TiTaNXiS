"""OCR Audit Log + Undo (v135.51 → v136 multi-select).

Her başarılı OCR apply çağrısından sonra frontend bu route'a POST atarak ne
yaptığını kaydeder (`op_type`, `created_member_ids`, `updated_member_ids`,
`created_points`, `event_id`). `Geri Al` butonu ilgili op_id ile undo endpoint'ini
çağırır. `pasha@titanxis.com` başkalarının işlemlerini de undo edebilir.

v136 — Multi-select bulk undo (`POST /ocr/audit/undo-bulk`) + `types` filter
parametresi (`/ocr/audit/recent?types=ocr_event_points`). Frontend'de Events
sayfasında ve Members sayfasında ayrı ayrı toplu undo panelleri kullanır.
"""
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import uuid, logging

logger = logging.getLogger("ocr_audit")
PASHA_EMAIL = "pasha@titanxis.com"

ALL_OP_TYPES = {"ocr_add_member", "ocr_power", "ocr_castle_rank", "ocr_event_points"}
MEMBER_OP_TYPES = {"ocr_add_member", "ocr_power", "ocr_castle_rank"}
EVENT_OP_TYPES = {"ocr_event_points"}


def _now(): return datetime.now(timezone.utc).isoformat()


class AuditCreate(BaseModel):
    op_type: str  # 'ocr_add_member' | 'ocr_power' | 'ocr_castle_rank' | 'ocr_event_points'
    created_member_ids: Optional[List[str]] = None
    updated_member_ids: Optional[List[str]] = None
    created_point_ids: Optional[List[str]] = None
    event_id: Optional[str] = None
    note: Optional[str] = None
    # v136 — Snapshot of the ORIGINAL point rows that were deleted+replaced
    # during an `overwrite_duplicates` OCR run. Undo re-inserts them so the
    # previous values are restored.
    overwritten_snapshots: Optional[List[dict]] = None
    # v136 — First N participant/member names for the undo-confirm dialog.
    # Frontend prompts admin with "Silinecek: 3 üye · Ali, Ekko, Vanya".
    sample_names: Optional[List[str]] = None


class BulkUndoBody(BaseModel):
    op_ids: List[str]


async def _do_undo_one(db, op: dict) -> dict:
    """Perform undo for a single op doc. Returns stats. Does NOT check auth.

    v136 — Also restores `overwritten_snapshots` (original point rows that
    were deleted+replaced during an OCR overwrite). We first delete the
    OCR-inserted rows so we don't collide on member_id+event_id, then
    re-insert the snapshots (skipping any whose id already exists).
    """
    deleted_members = 0
    deleted_points = 0
    restored_points = 0
    for mid in (op.get("created_member_ids") or []):
        try:
            r = await db.members.delete_one({"id": mid})
            if r.deleted_count:
                deleted_members += 1
        except Exception as e:
            logger.warning(f"undo member {mid}: {e}")
    for pid in (op.get("created_point_ids") or []):
        try:
            r = await db.points.delete_one({"id": pid})
            if r.deleted_count:
                deleted_points += 1
        except Exception as e:
            logger.warning(f"undo point {pid}: {e}")
    # Restore original point rows (before OCR overwrite).
    snaps = op.get("overwritten_snapshots") or []
    for snap in snaps:
        try:
            if not isinstance(snap, dict) or not snap.get("id"):
                continue
            existing = await db.points.find_one({"id": snap["id"]}, {"_id": 0, "id": 1})
            if existing:
                continue
            snap_copy = {k: v for k, v in snap.items() if k != "_id"}
            await db.points.insert_one(snap_copy)
            restored_points += 1
        except Exception as e:
            logger.warning(f"restore snapshot: {e}")
    return {
        "deleted_members": deleted_members,
        "deleted_points": deleted_points,
        "restored_points": restored_points,
    }


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
            "overwritten_snapshots": body.overwritten_snapshots or [],
            "sample_names": (body.sample_names or [])[:10],
            "event_id": body.event_id,
            "note": (body.note or "")[:240],
            "created_at": _now(),
            "undone": False,
        }
        await db.ocr_audit.insert_one(doc)
        return {"ok": True, "id": doc["id"]}

    @router.get("/ocr/audit/recent")
    async def recent(
        limit: int = 20,
        types: Optional[str] = Query(None, description="Virgülle ayrılmış op_type filtresi (örn. ocr_event_points veya ocr_add_member,ocr_power,ocr_castle_rank)"),
        include_undone: bool = False,
        user: dict = Depends(require_admin),
    ):
        is_pasha = (user.get("email") or "").lower() == PASHA_EMAIL
        q: dict = {} if is_pasha else {"user_id": user.get("id")}
        if not include_undone:
            q["undone"] = False
        if types:
            wanted = [t.strip() for t in types.split(",") if t.strip() in ALL_OP_TYPES]
            if wanted:
                q["op_type"] = {"$in": wanted}
        rows = await db.ocr_audit.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 200))).to_list(200)
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

        stats = await _do_undo_one(db, op)
        await db.ocr_audit.update_one(
            {"id": op_id},
            {"$set": {"undone": True, "undone_at": _now(), "undone_by": user.get("id"),
                      "undone_by_name": user.get("username") or user.get("email"),
                      "undone_stats": stats}},
        )
        return {"ok": True, **stats}

    @router.post("/ocr/audit/undo-bulk")
    async def undo_bulk(body: BulkUndoBody, user: dict = Depends(require_admin)):
        """Toplu geri alma. Undone / yetkisiz / bulunamayan kayıtlar atlanır.
        Response: {ok, total, undone, skipped, deleted_members, deleted_points, results:[{op_id, status, reason?}]}"""
        op_ids = [x for x in (body.op_ids or []) if isinstance(x, str) and x]
        if not op_ids:
            raise HTTPException(400, "op_ids boş")
        if len(op_ids) > 100:
            raise HTTPException(400, "en fazla 100 kayıt aynı anda geri alınabilir")

        is_pasha = (user.get("email") or "").lower() == PASHA_EMAIL
        uid = user.get("id")
        total_members = 0
        total_points = 0
        total_restored = 0
        undone_cnt = 0
        skipped_cnt = 0
        results = []

        # Fetch all ops in one query
        docs = await db.ocr_audit.find({"id": {"$in": op_ids}}, {"_id": 0}).to_list(200)
        found_map = {d.get("id"): d for d in docs}

        for op_id in op_ids:
            op = found_map.get(op_id)
            if not op:
                skipped_cnt += 1
                results.append({"op_id": op_id, "status": "skipped", "reason": "not_found"})
                continue
            if op.get("undone"):
                skipped_cnt += 1
                results.append({"op_id": op_id, "status": "skipped", "reason": "already_undone"})
                continue
            if not is_pasha and op.get("user_id") != uid:
                skipped_cnt += 1
                results.append({"op_id": op_id, "status": "skipped", "reason": "forbidden"})
                continue
            try:
                stats = await _do_undo_one(db, op)
                total_members += stats["deleted_members"]
                total_points += stats["deleted_points"]
                total_restored += stats.get("restored_points", 0)
                await db.ocr_audit.update_one(
                    {"id": op_id},
                    {"$set": {"undone": True, "undone_at": _now(), "undone_by": uid,
                              "undone_by_name": user.get("username") or user.get("email"),
                              "undone_stats": stats}},
                )
                undone_cnt += 1
                results.append({"op_id": op_id, "status": "undone", **stats})
            except Exception as e:
                skipped_cnt += 1
                logger.exception(f"bulk undo failed for {op_id}")
                results.append({"op_id": op_id, "status": "skipped", "reason": f"error:{e}"})

        return {
            "ok": True,
            "total": len(op_ids),
            "undone": undone_cnt,
            "skipped": skipped_cnt,
            "deleted_members": total_members,
            "deleted_points": total_points,
            "restored_points": total_restored,
            "results": results,
        }

    return router


async def ensure_ocr_audit_indexes(db):
    try:
        await db.ocr_audit.create_index("id", unique=True)
        await db.ocr_audit.create_index([("user_id", 1), ("created_at", -1)])
        await db.ocr_audit.create_index([("undone", 1), ("created_at", -1)])
        await db.ocr_audit.create_index([("op_type", 1), ("created_at", -1)])
    except Exception as e:
        logger.warning(f"ocr_audit index: {e}")
