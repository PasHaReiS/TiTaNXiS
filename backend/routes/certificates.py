"""Member certificates + performance card (v135.34).

Sertifika = admin'in `event_id` seçip "SvS Şampiyonu - Ağustos 2026" gibi
bir başlıkla üyelere verdiği dijital rozet. `POST /api/certificates/issue`
event id + template başlığı + member_ids alır, bulk issue eder. Üye
kendisininkini `GET /api/auth/me/certificates` ile görür; admin herhangi
birininki için `GET /api/certificates/member/{member_id}` çağırır. PNG
generation `GET /api/certificates/{cert_id}/image.png` — PIL ile tema-uyumlu
poster (v135.30 SHARE_THEMES paletinden).

Performance card = üyenin son 30 gün özet metrikleri: RSVP oranı, ortalama
puan, en iyi ay, streak. `GET /api/members/{member_id}/performance`.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import io
import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger("certificates")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class IssueBody(BaseModel):
    event_id: str
    title: str = Field(..., min_length=1, max_length=160)
    member_ids: List[str]
    theme: Optional[str] = "amber"


def make_certificates_router(db, require_admin, require_auth,
                              compose_share_image_fn, SHARE_THEMES):
    router = APIRouter()

    def _serialize(d: dict) -> dict:
        return {k: v for k, v in d.items() if k != "_id"}

    @router.post("/certificates/issue")
    async def issue_certs(body: IssueBody, user: dict = Depends(require_admin)):
        ev = await db.events.find_one({"id": body.event_id}, {"_id": 0, "name": 1, "date": 1})
        if not ev:
            raise HTTPException(404, "event not found")
        theme = body.theme if body.theme in (SHARE_THEMES or {}) else "amber"
        created = []
        for mid in set(body.member_ids):
            m = await db.members.find_one({"id": mid}, {"_id": 0, "name": 1})
            if not m:
                continue
            doc = {
                "id": str(uuid.uuid4()),
                "member_id": mid,
                "member_name": m.get("name"),
                "event_id": body.event_id,
                "event_name": ev.get("name"),
                "event_date": ev.get("date"),
                "title": body.title.strip(),
                "theme": theme,
                "issued_at": _now_iso(),
                "issued_by": (user or {}).get("username") or "admin",
            }
            await db.certificates.insert_one(doc)
            created.append(_serialize(doc))
        return {"ok": True, "created": created, "count": len(created)}

    @router.get("/certificates/member/{member_id}")
    async def list_member_certs(member_id: str, _: dict = Depends(require_auth)):
        rows = await db.certificates.find(
            {"member_id": member_id}, {"_id": 0}
        ).sort("issued_at", -1).to_list(200)
        return {"items": rows, "count": len(rows)}

    @router.get("/auth/me/certificates")
    async def list_my_certs(user: dict = Depends(require_auth)):
        member_ids = user.get("member_ids") or ([user.get("member_id")] if user.get("member_id") else [])
        member_ids = [m for m in member_ids if m]
        if not member_ids:
            return {"items": [], "count": 0}
        rows = await db.certificates.find(
            {"member_id": {"$in": member_ids}}, {"_id": 0}
        ).sort("issued_at", -1).to_list(500)
        return {"items": rows, "count": len(rows)}

    @router.delete("/certificates/{cid}")
    async def revoke_cert(cid: str, _: dict = Depends(require_admin)):
        r = await db.certificates.delete_one({"id": cid})
        if r.deleted_count == 0:
            raise HTTPException(404, "certificate not found")
        return {"ok": True}

    @router.get("/certificates/{cid}/image.png")
    async def cert_image(cid: str):
        cert = await db.certificates.find_one({"id": cid}, {"_id": 0})
        if not cert:
            raise HTTPException(404, "certificate not found")
        # Reuse the event share composer with a synthetic "event" — the
        # composer already renders title / date / group / footer with our
        # 6-theme palette + Noto Color Emoji. `group_name` is repurposed as
        # the member name so the poster reads e.g.:
        #   "🏆 SvS Şampiyonu - Ağustos 2026" (title)
        #   date · group=PashaSenol · × 1
        synthetic_event = {
            "id": cert.get("event_id"),
            "name": cert.get("title") or "Sertifika",
            "date": cert.get("event_date") or cert.get("issued_at"),
            "group_name": f"🏆 {cert.get('member_name') or '—'}",
            "multiplier": 1,
            "banner_url": None,
        }
        png = await compose_share_image_fn(synthetic_event, theme=cert.get("theme") or "amber")
        return Response(
            content=png, media_type="image/png",
            headers={"Cache-Control": "public, max-age=300"},
        )

    return router


def make_performance_router(db, require_auth):
    """Member performance card — 30-day summary + best month."""
    router = APIRouter()

    @router.get("/members/{member_id}/performance")
    async def member_performance(member_id: str, _: dict = Depends(require_auth)):
        m = await db.members.find_one({"id": member_id}, {"_id": 0, "name": 1})
        if not m:
            raise HTTPException(404, "member not found")
        now = datetime.now(timezone.utc)
        cutoff30 = (now - timedelta(days=30)).isoformat()

        # RSVP oranı (son 30 gün, attendance_enabled etkinlikler)
        recent_events = await db.events.find(
            {"date": {"$gte": cutoff30}, "attendance_enabled": {"$ne": False},
             "archived": {"$ne": True}},
            {"_id": 0, "id": 1},
        ).to_list(500)
        recent_ev_ids = [e["id"] for e in recent_events]
        # Linked user for this member
        linked = await db.users.find_one(
            {"$or": [{"member_ids": member_id}, {"member_id": member_id}]},
            {"_id": 0, "id": 1},
        )
        rsvp_yes = rsvp_maybe = rsvp_no = 0
        streak = 0
        if linked and recent_ev_ids:
            async for r in db.event_rsvps.find(
                {"user_id": linked["id"], "event_id": {"$in": recent_ev_ids}},
                {"_id": 0, "status": 1},
            ):
                s = r.get("status")
                if s == "yes": rsvp_yes += 1
                elif s == "maybe": rsvp_maybe += 1
                elif s == "no": rsvp_no += 1
        total_recent = len(recent_ev_ids) or 1
        rsvp_rate = round(100.0 * (rsvp_yes + 0.5 * rsvp_maybe) / total_recent, 1)

        # Streak — reuse the app-wide _compute_user_yes_streak lazily.
        if linked:
            try:
                from server import _compute_user_yes_streak
                streak = await _compute_user_yes_streak(linked["id"])
            except Exception:
                pass

        # 30-günlük ortalama puan (attendance) + en iyi ay
        att30_rows = await db.attendance.find(
            {"member_id": member_id, "date": {"$gte": cutoff30}},
            {"_id": 0, "score": 1},
        ).to_list(500)
        scores30 = [float(r.get("score") or 0) for r in att30_rows]
        avg_score = round(sum(scores30) / len(scores30), 1) if scores30 else 0.0

        # En iyi ay (tüm zamanlar)
        best_month = None
        best_month_score = 0.0
        month_totals: dict = {}
        async for r in db.attendance.find(
            {"member_id": member_id, "date": {"$ne": None}},
            {"_id": 0, "date": 1, "score": 1},
        ):
            d = str(r.get("date") or "")[:7]  # YYYY-MM
            if not d: continue
            month_totals[d] = month_totals.get(d, 0.0) + float(r.get("score") or 0)
        if month_totals:
            best_month, best_month_score = max(month_totals.items(), key=lambda x: x[1])
            best_month_score = round(best_month_score, 1)

        return {
            "member_id": member_id,
            "member_name": m.get("name"),
            "window_days": 30,
            "recent_events_count": len(recent_ev_ids),
            "rsvp_yes_count": rsvp_yes,
            "rsvp_maybe_count": rsvp_maybe,
            "rsvp_no_count": rsvp_no,
            "rsvp_rate_pct": rsvp_rate,
            "avg_score_30d": avg_score,
            "attendance_count_30d": len(scores30),
            "current_streak": streak,
            "best_month": best_month,
            "best_month_score": best_month_score,
        }

    return router


async def ensure_certificates_indexes(db):
    try:
        await db.certificates.create_index("id", unique=True)
        await db.certificates.create_index([("member_id", 1), ("issued_at", -1)])
    except Exception as e:
        logger.warning(f"certificates index ensure: {e}")
