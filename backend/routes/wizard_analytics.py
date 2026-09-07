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


def make_wizard_analytics_router(db, require_admin, optional_auth=None, broadcast_push=None, send_admin_telegram=None):
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

        # v141 — Daily conversion trend: her gün için opens vs success
        # birlikte döner. Frontend recharts LineChart bunu ikili line'a
        # dönüştürür (kayıp adımlarını görsel olarak bulmak için).
        conv_pipeline = [
            {"$match": {**base_extra, "created_at": {"$gte": since_30},
                        "event": {"$in": ["wizard_opened", "step3_import_success"]}}},
            {"$group": {
                "_id": {
                    "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                    "event": "$event",
                },
                "count": {"$sum": 1},
            }},
        ]
        conv_rows = await db.pc_wizard_events.aggregate(conv_pipeline).to_list(1000)
        conv_by_day: dict = {}
        for r in conv_rows:
            d = r["_id"]["date"]
            row = conv_by_day.setdefault(d, {"date": d, "opens": 0, "success": 0})
            if r["_id"]["event"] == "wizard_opened":
                row["opens"] = r["count"]
            elif r["_id"]["event"] == "step3_import_success":
                row["success"] = r["count"]
        daily_conv = sorted(
            [{**v, "conv": round(100 * v["success"] / v["opens"], 1) if v["opens"] else 0}
             for v in conv_by_day.values()],
            key=lambda x: x["date"],
        )

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
            "daily_conversion_30d": daily_conv,
            "top_users_30d": top_users,
        }

    @router.post("/wizard-analytics/check-alerts")
    async def check_alerts():
        """Cron-safe düşük dönüşüm alarmı — 30 gün içinde `conv_end_to_end < 40`
        ve `opens >= 5` ise adminlere Web Push + Telegram DM atılır. 24 saat cool-down."""
        from routes.cron_health import log_cron_run
        now = datetime.now(timezone.utc)
        since_30 = now - timedelta(days=30)
        stats = await _funnel({"created_at": {"$gte": since_30}})

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
        tg_sent = False
        if should_alert:
            body_txt = f"Son 30 gün: {opens} açılış, sadece %{conv} tamamlandı. Kullanıcılar bir adımda takılıyor olabilir."
            if broadcast_push:
                try:
                    await broadcast_push(
                        title="⚠️ Wizard dönüşümü düşük",
                        body=body_txt,
                        url="/admin/wizard-analytics",
                        tag="wizard-alert",
                        sound="rally",
                        notif_pref="admin",
                    )
                    alert_sent = True
                except Exception:
                    pass
            # v141 — Telegram hook: admin channel'a da fan-out
            if send_admin_telegram:
                try:
                    tg_sent = bool(await send_admin_telegram(
                        f"🚨 <b>Wizard dönüşümü düşük</b>\n{body_txt}\n\n<a href='https://oyun-loncasi.preview.emergentagent.com/admin/wizard-analytics'>Analitik paneli</a>"
                    ))
                except Exception:
                    pass
            if alert_sent or tg_sent:
                await db.pc_wizard_alerts.update_one(
                    {"key": "low_conversion"},
                    {"$set": {
                        "key": "low_conversion",
                        "last_sent_at": now.isoformat(),
                        "last_conv": conv,
                        "last_opens": opens,
                        "channels": {"push": alert_sent, "telegram": tg_sent},
                    }},
                    upsert=True,
                )

        # Cron log
        try:
            await log_cron_run(db, "wizard-analytics-alert-check", "success",
                              detail=f"opens={opens} conv={conv} alert={alert_sent} tg={tg_sent}")
        except Exception:
            pass

        return {
            "checked_at": now.isoformat(),
            "conv_end_to_end_30d": conv,
            "opens_30d": opens,
            "should_alert": should_alert,
            "alert_sent": alert_sent,
            "telegram_sent": tg_sent,
            "cool_off": cool_off,
        }

    return router


def make_wizard_csv_router(db, require_admin):
    """v141 — Ayrı router: /wizard-analytics/export.csv (filtered event dump)."""
    from fastapi.responses import Response
    import csv, io
    csv_router = APIRouter()

    @csv_router.get("/wizard-analytics/export.csv")
    async def export_csv(
        _: dict = Depends(require_admin),
        since: Optional[str] = None,
        until: Optional[str] = None,
        user_id: Optional[str] = None,
        kind: Optional[str] = None,
        limit: int = 5000,
    ):
        """CSV export of raw wizard events matching the given filters. Powers
        the "CSV İndir" button on /admin/wizard-analytics for audit/deep-dive."""
        q: dict = {}
        now = datetime.now(timezone.utc)
        if since:
            try:
                d = datetime.fromisoformat(since.replace("Z", "+00:00"))
                q.setdefault("created_at", {})["$gte"] = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except Exception:
                raise HTTPException(400, f"invalid since: {since}")
        if until:
            try:
                d = datetime.fromisoformat(until.replace("Z", "+00:00"))
                q.setdefault("created_at", {})["$lte"] = d if d.tzinfo else d.replace(tzinfo=timezone.utc)
            except Exception:
                raise HTTPException(400, f"invalid until: {until}")
        if user_id:
            q["user_id"] = user_id
        if kind and kind.lower() in ("pre", "diger"):
            q["kind"] = kind.lower()

        cursor = db.pc_wizard_events.find(q, {"_id": 0}).sort("created_at", -1).limit(min(20000, max(1, limit)))
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["created_at", "event", "kind", "user_id", "user_username", "user_role", "session_id", "meta"])
        n = 0
        async for r in cursor:
            ca = r.get("created_at")
            if hasattr(ca, "isoformat"):
                ca = ca.isoformat()
            w.writerow([
                ca or "",
                r.get("event") or "",
                r.get("kind") or "",
                r.get("user_id") or "",
                r.get("user_username") or "",
                r.get("user_role") or "",
                r.get("session_id") or "",
                str(r.get("meta") or {}),
            ])
            n += 1
        fname = f"wizard_events_{now.strftime('%Y%m%d_%H%M')}.csv"
        return Response(
            content=buf.getvalue(),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{fname}"',
                     "X-Rows-Exported": str(n)},
        )

    return csv_router
