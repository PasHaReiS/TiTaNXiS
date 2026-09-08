"""Merkezi audit log — üye/etkinlik/puan/duyuru mutasyonlarını okur.
Mevcut koleksiyonları birleştirir: `member_changes`, `activity_log`,
`ocr_audit`, `audit_log`. Filtreli tablo için tek endpoint."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query


def make_audit_log_router(db, require_admin):
    router = APIRouter()

    @router.get("/admin/audit-log")
    async def audit_log(
        _: dict = Depends(require_admin),
        since: Optional[str] = None,
        until: Optional[str] = None,
        action: Optional[str] = None,
        actor: Optional[str] = None,
        limit: int = Query(200, ge=1, le=2000),
    ):
        def _parse(iso):
            if not iso:
                return None
            try:
                d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except Exception:
                return None

        s = _parse(since)
        u = _parse(until)
        rows = []

        # member_changes
        q1: dict = {}
        if s or u:
            q1["changed_at"] = {}
            if s: q1["changed_at"]["$gte"] = s.isoformat()
            if u: q1["changed_at"]["$lte"] = u.isoformat()
        if actor:
            q1["actor_username"] = {"$regex": actor, "$options": "i"}
        async for d in db.member_changes.find(q1, {"_id": 0}).sort("changed_at", -1).limit(limit):
            rows.append({
                "ts": d.get("changed_at"),
                "action": f"member_{d.get('field') or 'update'}",
                "actor": d.get("actor_username") or "?",
                "target": d.get("member_name") or d.get("member_id"),
                "detail": f"{d.get('field')}: {d.get('before')} → {d.get('after')}",
            })

        # activity_log
        q2: dict = {}
        if s or u:
            q2["timestamp"] = {}
            if s: q2["timestamp"]["$gte"] = s.isoformat()
            if u: q2["timestamp"]["$lte"] = u.isoformat()
        async for d in db.activity_log.find(q2, {"_id": 0}).sort("timestamp", -1).limit(limit):
            rows.append({
                "ts": d.get("timestamp"),
                "action": d.get("action_type") or "activity",
                "actor": d.get("actor_username") or "sistem",
                "target": d.get("member_name") or "?",
                "detail": d.get("details") or "",
            })

        # audit_log (merges, deletes)
        q3: dict = {}
        if s or u:
            q3["ts"] = {}
            if s: q3["ts"]["$gte"] = s.isoformat()
            if u: q3["ts"]["$lte"] = u.isoformat()
        if actor:
            q3["actor_username"] = {"$regex": actor, "$options": "i"}
        async for d in db.audit_log.find(q3, {"_id": 0}).sort("ts", -1).limit(limit):
            rows.append({
                "ts": d.get("ts"),
                "action": d.get("action") or "audit",
                "actor": d.get("actor_username") or "?",
                "target": d.get("primary_id") or d.get("secondary_snapshot", {}).get("name") or "?",
                "detail": f"points_moved={d.get('points_moved', 0)}" if d.get("action") == "merge_members" else str(d)[:200],
            })

        # OCR audit
        q4: dict = {}
        if s or u:
            q4["created_at"] = {}
            if s: q4["created_at"]["$gte"] = s.isoformat()
            if u: q4["created_at"]["$lte"] = u.isoformat()
        async for d in db.ocr_audit.find(q4, {"_id": 0}).sort("created_at", -1).limit(limit):
            rows.append({
                "ts": d.get("created_at"),
                "action": f"ocr_{d.get('op_type', 'unknown')}",
                "actor": d.get("actor_username") or "?",
                "target": ", ".join(d.get("sample_names", [])[:3]),
                "detail": f"undone={d.get('undone', False)}",
            })

        rows.sort(key=lambda r: r.get("ts") or "", reverse=True)
        if action:
            rows = [r for r in rows if action.lower() in (r.get("action") or "").lower()]
        return rows[:limit]

    return router
