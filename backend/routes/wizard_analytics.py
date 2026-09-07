"""PC Excel Wizard funnel telemetry + admin filtered summary + alert cron.

Public POST /wizard-analytics/event — kullanıcı sihirbaz adım geçişleri.
Admin  GET  /wizard-analytics/summary — funnel özeti (opsiyonel filtreler).
Admin  POST /wizard-analytics/check-alerts — cron güvenli düşük dönüşüm uyarısı.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field


_VALID_EVENTS = {
    "wizard_opened",
    "step1_download",
    "step2_next",
    "step3_import",
    "step3_import_success",
    "step3_translate",
    "wizard_closed",
}


class WizardEventBody(BaseModel):
    event: str
    kind: Optional[str] = None
    session_id: Optional[str] = None
    meta: Optional[dict] = Field(default_factory=dict)


def make_wizard_analytics_router(db, require_admin, optional_auth=None, broadcast_push=None):
    router = APIRouter()

    @router.post("/wizard-analytics/event")
    async def record_event(body: WizardEventBody, request: Request):
        if body.event not in _VALID_EVENTS:
            return {"ok": False, "reason": "invalid_event"}
        doc = {
            "id": str(uuid.uuid4()),
            "event": body.event,
            "kind": (body.kind or "").strip().lower() or None,
            "session_id": (body.session_id or "").strip() or None,
            "created_at": datetime.now(timezone.utc),
            "meta": body.meta or {},
        }
        try:
            if optional_auth:
                u = await optional_auth(request)
                if u:
                    doc["user_id"] = u.get("id")
                    doc["user_role"] = u.get("role")
                    doc["user_username"] = u.get("username")
        except Exception:
            pass
        await db.pc_wizard_events.insert_one(doc)
        return {"ok": True}

    async def _funnel(match_extra: dict):
        pipeline = [
            {"$match": match_extra},
            {"$group": {"_id": "$event", "count": {"$sum": 1}}},
        ]
        rows = await db.pc_wizard_events.aggregate(pipeline).to_list(50)
        counts = {r["_id"]: r["count"] for r in rows}
        opens = counts.get("wizard_opened", 0) or 0
        step1 = counts.get("step1_download", 0) or 0
        step2 = counts.get("step2_next", 0) or 0
        step3 = counts.get("step3_import", 0) or 0
        success = counts.get("step3_import_success", 0) or 0
        translate = counts.get("step3_translate", 0) or 0
        return {
            "opens": opens,
            "step1_download": step1,
            "step2_next": step2,
            "step3_import": step3,
            "step3_import_success": success,
            "step3_translate": translate,
            "conv_open_to_download": round(100 * step1 / opens, 1) if opens else 0,
            "conv_download_to_upload": round(100 * step3 / step1, 1) if step1 else 0,
            "conv_upload_to_success": round(100 * success / step3, 1) if step3 else 0,
            "conv_end_to_end": round(100 * success / opens, 1) if opens else 0,
        }

    @router.get("/wizard-analytics/summary")
    async def analytics_summary(
        _: dict = Depends(require_admin),
        since: Optional[str] = Query(None, description="ISO8601 UTC lower bound; override 7g/30g default"),
        until: Optional[str] = Query(None, description="ISO8601 UTC upper bound"),
        user_id: Optional[str] = Query(None),
        kind: Optional[str] = Query(None, description="pre | diger"),
    ):
        """Funnel + zaman dilimi metrikleri. `since/until/user_id/kind` filtre
        parametreleri opsiyonel — hiçbiri verilmezse eskisi gibi 7g + 30g döner."""
        now = datetime.now(timezone.utc)

        def _parse(iso: Optional[str]) -> Optional[datetime]:
            if not iso:
                return None
            try:
                d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if d.tzinfo is None:
                    d = d.replace(tzinfo=timezone.utc)
                return d
            except Exception:
                raise HTTPException(400, f"invalid ISO8601: {iso}")

        s = _parse(since)
        u = _parse(until)
        extra_filter: dict = {}
        if user_id:
            extra_filter["user_id"] = user_id
        if kind and kind.lower() in ("pre", "diger"):
            extra_filter["kind"] = kind.lower()

        if s or u:
            match = {"$and": [{"created_at": {"$gte": s or (now - timedelta(days=365))}}, {"created_at": {"$lte": u or now}}, extra_filter]} if extra_filter else {"created_at": {"$gte": s or (now - timedelta(days=365)), "$lte": u or now}}
            filtered = await _funnel(match)
            return {"filtered": filtered, "range": {"since": (s or now - timedelta(days=365)).isoformat(), "until": (u or now).isoformat()}}

        # Default: 7 + 30 gün (mevcut davranış)
        since_7 = now - timedelta(days=7)
        since_30 = now - timedelta(days=30)
        base_extra = extra_filter or {}
        m7 = {**base_extra, "created_at": {"$gte": since_7}}
        m30 = {**base_extra, "created_at": {"$gte": since_30}}
        last7 = await _funnel(m7)
        last30 = await _funnel(m30)

        kind_pipeline = [
            {"$match": {**base_extra, "created_at": {"$gte": since_30}, "kind": {"$in": ["pre", "diger"]}}},
            {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
        ]
        kind_rows = await db.pc_wizard_events.aggregate(kind_pipeline).to_list(10)
        by_kind = {r["_id"]: r["count"] for r in kind_rows}

        daily_pipeline = [
            {"$match": {**base_extra, "created_at": {"$gte": since_30}, "event": "wizard_opened"}},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id": 1}},
        ]
        daily = [
            {"date": r["_id"], "opens": r["count"]}
            async for r in db.pc_wizard_events.aggregate(daily_pipeline)
        ]

        # Top 5 users (last 30d, only if user_id NOT filtered)
        top_users = []
        if not user_id:
            top_pipeline = [
                {"$match": {"created_at": {"$gte": since_30}, "user_id": {"$exists": True, "$ne": None}}},
                {"$group": {"_id": "$user_id", "username": {"$last": "$user_username"}, "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ]
            top_users = [
                {"user_id": r["_id"], "username": r.get("username") or "?", "events": r["count"]}
                async for r in db.pc_wizard_events.aggregate(top_pipeline)
            ]

        return {
            "last_7_days": last7,
            "last_30_days": last30,
            "by_kind_30d": by_kind,
            "daily_opens_30d": daily,
            "top_users_30d": top_users,
        }

    @router.post("/wizard-analytics/check-alerts")
    async def check_alerts():
        """Cron-safe düşük dönüşüm alarmı — 30 gün içinde `conv_end_to_end < 40`
        ve `opens >= 5` ise adminlere Web Push atılır. 24 saat cool-down."""
        now = datetime.now(timezone.utc)
        since_30 = now - timedelta(days=30)
        stats = await _funnel({"created_at": {"$gte": since_30}})

        # Debounce: son 24 saat içinde alert atıldıysa tekrar atma
        marker = await db.pc_wizard_alerts.find_one({"key": "low_conversion"}, {"_id": 0})
        cool_off = False
        if marker and marker.get("last_sent_at"):
            try:
                last = datetime.fromisoformat(marker["last_sent_at"].replace("Z", "+00:00"))
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                if (now - last).total_seconds() < 24 * 3600:
                    cool_off = True
            except Exception:
                pass

        conv = stats["conv_end_to_end"] or 0
        opens = stats["opens"] or 0
        should_alert = opens >= 5 and conv < 40 and not cool_off

        alert_sent = False
        if should_alert and broadcast_push:
            try:
                await broadcast_push(
                    title="⚠️ Wizard dönüşümü düşük",
                    body=f"Son 30 gün: {opens} açılış, sadece %{conv} tamamlandı. Kullanıcılar bir adımda takılıyor olabilir.",
                    url="/admin/wizard-analytics",
                    tag="wizard-alert",
                    sound="rally",
                    notif_pref="admin",
                )
                await db.pc_wizard_alerts.update_one(
                    {"key": "low_conversion"},
                    {"$set": {
                        "key": "low_conversion",
                        "last_sent_at": now.isoformat(),
                        "last_conv": conv,
                        "last_opens": opens,
                    }},
                    upsert=True,
                )
                alert_sent = True
            except Exception:
                pass

        return {
            "checked_at": now.isoformat(),
            "conv_end_to_end_30d": conv,
            "opens_30d": opens,
            "should_alert": should_alert,
            "alert_sent": alert_sent,
            "cool_off": cool_off,
        }

    return router
