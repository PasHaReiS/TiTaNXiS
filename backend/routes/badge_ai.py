"""AI Badge Suggestions — OpenAI GPT-4o-mini via Emergent LLM key.

Endpoints:
- POST /api/members/{member_id}/badge-suggestions          → generate fresh suggestions
- GET  /api/members/{member_id}/badge-suggestions          → list latest pending suggestions
- POST /api/members/{member_id}/badge-suggestions/{key}/approve → auto-assign badge
- POST /api/members/{member_id}/badge-suggestions/{key}/reject  → drop suggestion

Suggestions are persisted in `badge_suggestions` collection so admins can revisit them.
Each suggestion carries the AI's reason string for context.
"""
import os
import json
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


_MODEL = os.environ.get("BADGE_AI_MODEL", "gpt-4o-mini")


def _extract_json(text: str) -> dict:
    """Extract first JSON object from LLM reply (strips ```json fences)."""
    if not text:
        raise ValueError("empty reply")
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    # Find outermost {...}
    start = t.find("{")
    end = t.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no json object")
    return json.loads(t[start:end + 1])


async def _compute_member_stats(db, member_id: str) -> dict:
    """Aggregate stats the LLM will reason over."""
    m = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not m:
        return {}
    # Total points + event participation
    total_pts = 0
    events_participated: set[str] = set()
    async for p in db.points.find(
        {"member_id": member_id}, {"_id": 0, "points": 1, "event_id": 1}
    ):
        total_pts += int(p.get("points") or 0)
        if p.get("event_id"):
            events_participated.add(p["event_id"])
    # RSVP streak (consecutive-yes across chronological events)
    streak = 0
    try:
        rows = await db.rsvps.find(
            {"member_id": member_id}, {"_id": 0, "answer": 1, "event_start": 1}
        ).sort("event_start", -1).to_list(50)
        for r in rows:
            if str(r.get("answer") or "").lower() == "yes":
                streak += 1
            else:
                break
    except Exception:
        streak = 0
    # Rank position by total points (simple: fetch all totals)
    all_totals: dict[str, int] = {}
    async for p in db.points.find({}, {"_id": 0, "member_id": 1, "points": 1}):
        mid = p.get("member_id")
        if not mid:
            continue
        all_totals[mid] = all_totals.get(mid, 0) + int(p.get("points") or 0)
    sorted_mids = sorted(all_totals.items(), key=lambda kv: -kv[1])
    rank_pos: Optional[int] = None
    for i, (mid, _pts) in enumerate(sorted_mids, start=1):
        if mid == member_id:
            rank_pos = i
            break
    # Existing badges (avoid duplicate suggestions)
    existing_ids = {
        b["badge_id"]
        async for b in db.member_badges.find(
            {"member_id": member_id}, {"_id": 0, "badge_id": 1}
        )
    }
    return {
        "name": m.get("name"),
        "alliance": m.get("alliance_name"),
        "rank": m.get("rank"),
        "power": m.get("power"),
        "total_points": total_pts,
        "events_participated": len(events_participated),
        "rsvp_yes_streak": streak,
        "rank_position": rank_pos,
        "total_members": len(sorted_mids),
        "existing_badge_ids": list(existing_ids),
    }


async def _generate_suggestions(db, member_id: str, stats: dict) -> List[dict]:
    """Call GPT-4o-mini with stats + available badge catalog → structured suggestions."""
    all_badges = await db.badges.find({}, {"_id": 0}).to_list(200)
    catalog = [
        {"key": b.get("key") or b.get("id"), "name": b["name"],
         "description": b.get("description") or "", "id": b["id"]}
        for b in all_badges
        if b["id"] not in stats.get("existing_badge_ids", [])
    ]
    if not catalog:
        return []
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(500, "EMERGENT_LLM_KEY tanımlı değil")
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=api_key,
        session_id=f"badge-ai-{uuid.uuid4().hex[:8]}",
        system_message=(
            "You are a guild badge recommendation assistant. Given a member's stats "
            "and the available badge catalog, pick 1–4 badges that best fit their "
            "performance. Respond with STRICT JSON: "
            "{\"suggestions\": [{\"key\": str, \"reason\": str, \"confidence\": float}]}. "
            "confidence is 0.0–1.0. Reason is one short Turkish sentence explaining "
            "WHY this badge fits (mention concrete numbers when possible). Never invent "
            "keys not in the catalog. No markdown, no commentary."
        ),
    ).with_model("openai", _MODEL)
    prompt = (
        f"Üye istatistikleri:\n{json.dumps(stats, ensure_ascii=False, indent=2)}\n\n"
        f"Mevcut rozet kataloğu (key, name, description):\n"
        f"{json.dumps(catalog, ensure_ascii=False, indent=2)}\n\n"
        f"Sadece bu key'lerden seç. JSON döndür."
    )
    try:
        reply = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(502, f"LLM hatası: {e}")
    try:
        data = _extract_json(reply)
    except Exception:
        raise HTTPException(422, f"LLM cevabı JSON değil: {reply[:200]}")
    suggestions = data.get("suggestions") or []
    catalog_map = {c["key"]: c for c in catalog}
    out: List[dict] = []
    for s in suggestions:
        k = s.get("key")
        cat = catalog_map.get(k)
        if not cat:
            continue
        out.append({
            "key": k,
            "badge_id": cat["id"],
            "badge_name": cat["name"],
            "reason": (s.get("reason") or "").strip()[:400],
            "confidence": max(0.0, min(1.0, float(s.get("confidence") or 0.5))),
        })
    return out


def make_badge_ai_router(db, require_auth, require_admin):
    router = APIRouter()

    @router.post("/members/{member_id}/badge-suggestions")
    async def generate(member_id: str, user: dict = Depends(require_admin)):
        """Admin triggers fresh AI suggestions. Persists as `status=pending`."""
        m = await db.members.find_one({"id": member_id}, {"_id": 0, "id": 1, "name": 1})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        stats = await _compute_member_stats(db, member_id)
        suggestions = await _generate_suggestions(db, member_id, stats)
        # Drop existing pending, insert fresh
        await db.badge_suggestions.delete_many(
            {"member_id": member_id, "status": "pending"}
        )
        docs = []
        for s in suggestions:
            doc = {
                "id": str(uuid.uuid4()),
                "member_id": member_id,
                "member_name": m.get("name"),
                "badge_id": s["badge_id"],
                "badge_key": s["key"],
                "badge_name": s["badge_name"],
                "reason": s["reason"],
                "confidence": s["confidence"],
                "status": "pending",
                "created_at": _now_iso(),
                "created_by": user.get("username"),
            }
            docs.append(doc)
        if docs:
            await db.badge_suggestions.insert_many([{**d} for d in docs])
        for d in docs:
            d.pop("_id", None)
        return {"stats": stats, "suggestions": docs}

    @router.get("/members/{member_id}/badge-suggestions")
    async def list_suggestions(member_id: str, _: dict = Depends(require_auth)):
        """Return latest pending suggestions for a member."""
        rows = await db.badge_suggestions.find(
            {"member_id": member_id, "status": "pending"}, {"_id": 0}
        ).sort("confidence", -1).to_list(20)
        return {"items": rows}

    # Alias: `/ai-badge-suggestions` (kullanıcı istediği yol) → aynı sonuç.
    @router.get("/members/{member_id}/ai-badge-suggestions")
    async def list_suggestions_alias(member_id: str, _: dict = Depends(require_auth)):
        rows = await db.badge_suggestions.find(
            {"member_id": member_id, "status": "pending"}, {"_id": 0}
        ).sort("confidence", -1).to_list(20)
        return {"items": rows}

    @router.post("/members/{member_id}/ai-badge-suggestions")
    async def generate_alias(member_id: str, user: dict = Depends(require_admin)):
        m = await db.members.find_one({"id": member_id}, {"_id": 0, "id": 1, "name": 1})
        if not m:
            raise HTTPException(404, "Üye bulunamadı")
        stats = await _compute_member_stats(db, member_id)
        suggestions = await _generate_suggestions(db, member_id, stats)
        await db.badge_suggestions.delete_many(
            {"member_id": member_id, "status": "pending"}
        )
        docs = []
        for s in suggestions:
            doc = {
                "id": str(uuid.uuid4()),
                "member_id": member_id,
                "member_name": m.get("name"),
                "badge_id": s["badge_id"],
                "badge_key": s["key"],
                "badge_name": s["badge_name"],
                "reason": s["reason"],
                "confidence": s["confidence"],
                "status": "pending",
                "created_at": _now_iso(),
                "created_by": user.get("username"),
            }
            docs.append(doc)
        if docs:
            await db.badge_suggestions.insert_many([{**d} for d in docs])
        for d in docs:
            d.pop("_id", None)
        return {"stats": stats, "suggestions": docs}

    @router.post("/members/{member_id}/badge-suggestions/{suggestion_id}/approve")
    async def approve(member_id: str, suggestion_id: str, user: dict = Depends(require_admin)):
        s = await db.badge_suggestions.find_one(
            {"id": suggestion_id, "member_id": member_id}, {"_id": 0}
        )
        if not s:
            raise HTTPException(404, "Öneri bulunamadı")
        badge_id = s["badge_id"]
        existing = await db.member_badges.find_one(
            {"member_id": member_id, "badge_id": badge_id}
        )
        if not existing:
            await db.member_badges.insert_one({
                "id": str(uuid.uuid4()),
                "member_id": member_id,
                "badge_id": badge_id,
                "awarded_at": _now_iso(),
                "awarded_by_username": user.get("username") or "AI",
                "awarded_via": "ai_suggestion",
                "ai_reason": s.get("reason"),
            })
        await db.badge_suggestions.update_one(
            {"id": suggestion_id},
            {"$set": {
                "status": "approved",
                "acted_by": user.get("username"),
                "acted_at": _now_iso(),
            }},
        )
        try:
            await db.audit_log.insert_one({
                "action": "ai_badge_approve",
                "member_id": member_id,
                "badge_id": badge_id,
                "suggestion_id": suggestion_id,
                "actor_username": user.get("username"),
                "ts": _now_iso(),
            })
        except Exception:
            pass
        return {"ok": True, "badge_id": badge_id, "already_assigned": bool(existing)}

    @router.post("/members/{member_id}/badge-suggestions/{suggestion_id}/reject")
    async def reject(member_id: str, suggestion_id: str, user: dict = Depends(require_admin)):
        res = await db.badge_suggestions.update_one(
            {"id": suggestion_id, "member_id": member_id},
            {"$set": {
                "status": "rejected",
                "acted_by": user.get("username"),
                "acted_at": _now_iso(),
            }},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Öneri bulunamadı")
        try:
            await db.audit_log.insert_one({
                "action": "ai_badge_reject",
                "member_id": member_id,
                "suggestion_id": suggestion_id,
                "actor_username": user.get("username"),
                "ts": _now_iso(),
            })
        except Exception:
            pass
        return {"ok": True}

    return router


async def ensure_badge_ai_indexes(db):
    await db.badge_suggestions.create_index("id", unique=True)
    await db.badge_suggestions.create_index([("member_id", 1), ("status", 1)])
