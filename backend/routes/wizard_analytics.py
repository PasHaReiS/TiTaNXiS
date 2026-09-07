"""PC Excel Wizard funnel telemetry.

Public POST /wizard-analytics/event — kullanıcı sihirbaz adım geçişleri.
Admin GET  /wizard-analytics/summary — funnel özeti + son 7 gün + son 30 gün.
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field


_VALID_EVENTS = {
    "wizard_opened",       # kullanıcı Sihirbaz butonuna bastı
    "step1_download",      # Excel indir tıklandı
    "step2_next",           # Düzenle → Yükle ilerledi
    "step3_import",         # Excel yükle tıklandı
    "step3_import_success", # yükleme 200 döndü
    "step3_translate",      # Çevir tıklandı
    "wizard_closed",        # kapatıldı
}


class WizardEventBody(BaseModel):
    event: str
    kind: Optional[str] = None  # "pre" | "diger"
    session_id: Optional[str] = None
    meta: Optional[dict] = Field(default_factory=dict)


def make_wizard_analytics_router(db, require_admin, optional_auth=None):
    router = APIRouter()

    @router.post("/wizard-analytics/event")
    async def record_event(body: WizardEventBody, request: Request):
        """Non-authed telemetry pixel — kullanıcının auth token'ı varsa user_id
        loglanır; yoksa anonim. Tüm olaylar 30 gün TTL indexli koleksiyona yazılır."""
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
        # Best-effort user_id: token'daki kullanıcıyı çekmeyi dene.
        try:
            if optional_auth:
                u = await optional_auth(request)
                if u:
                    doc["user_id"] = u.get("id")
                    doc["user_role"] = u.get("role")
        except Exception:
            pass
        await db.pc_wizard_events.insert_one(doc)
        return {"ok": True}

    @router.get("/wizard-analytics/summary")
    async def analytics_summary(_: dict = Depends(require_admin)):
        """Funnel + zaman dilimi metrikleri. Frontend admin panelde
        özet karta dönüştürür."""
        now = datetime.now(timezone.utc)
        since_7 = now - timedelta(days=7)
        since_30 = now - timedelta(days=30)

        async def _funnel(since: datetime):
            pipeline = [
                {"$match": {"created_at": {"$gte": since}}},
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
                # Adım-adım dönüşüm oranları (%)
                "conv_open_to_download": round(100 * step1 / opens, 1) if opens else 0,
                "conv_download_to_upload": round(100 * step3 / step1, 1) if step1 else 0,
                "conv_upload_to_success": round(100 * success / step3, 1) if step3 else 0,
                "conv_end_to_end": round(100 * success / opens, 1) if opens else 0,
            }

        last7 = await _funnel(since_7)
        last30 = await _funnel(since_30)

        # Kind breakdown (pre / diger)
        kind_pipeline = [
            {"$match": {"created_at": {"$gte": since_30}, "kind": {"$in": ["pre", "diger"]}}},
            {"$group": {"_id": "$kind", "count": {"$sum": 1}}},
        ]
        kind_rows = await db.pc_wizard_events.aggregate(kind_pipeline).to_list(10)
        by_kind = {r["_id"]: r["count"] for r in kind_rows}

        # Son 30 gün, günlük opens sayısı (basit sparkline için)
        daily_pipeline = [
            {"$match": {"created_at": {"$gte": since_30}, "event": "wizard_opened"}},
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

        return {
            "last_7_days": last7,
            "last_30_days": last30,
            "by_kind_30d": by_kind,
            "daily_opens_30d": daily,
        }

    return router
