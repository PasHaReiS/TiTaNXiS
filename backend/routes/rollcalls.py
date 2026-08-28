"""Roll-call / Yoklama — admin starts a live attendance check tied to an
event; every notification-enabled user receives a push (and Telegram DM
if linked) with 3 quick reply buttons (✅ Katılıyorum / ❌ Katılamıyorum /
🤔 Belki). Live counts stream back to the admin panel via GET polling.

Data model:
- `rollcalls`: `{id, event_id, event_name, message, started_at,
   started_by_username, closed}`
- `rollcall_responses`: `{id, rollcall_id, user_id, username, response,
   responded_at}` — response ∈ {"yes", "no", "maybe"}. One doc per
   (rollcall, user); re-responding upserts.

Endpoints:
- GET  /api/rollcalls                        — list recent (auth)
- POST /api/rollcalls                        — admin starts a rollcall
- GET  /api/rollcalls/{id}                   — details + aggregated counts
- POST /api/rollcalls/{id}/respond           — user responds
- POST /api/rollcalls/{id}/close             — admin closes
"""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RollcallStartBody(BaseModel):
    event_id: Optional[str] = None
    event_name: Optional[str] = None
    message: Optional[str] = "Kim hazır?"


class RollcallRespondBody(BaseModel):
    response: str  # "yes" | "no" | "maybe"


def make_rollcalls_router(db, require_auth, require_admin, broadcast_push=None, broadcast_in_app=None):
    router = APIRouter()

    @router.get("/rollcalls")
    async def list_rollcalls(_: dict = Depends(require_auth), limit: int = 20):
        rows = await db.rollcalls.find({}, {"_id": 0}).sort("started_at", -1).to_list(max(1, min(limit, 100)))
        return {"items": rows}

    @router.post("/rollcalls")
    async def start_rollcall(body: RollcallStartBody, user: dict = Depends(require_admin)):
        # Resolve event name if only id given.
        ev_name = (body.event_name or "").strip()
        if body.event_id and not ev_name:
            e = await db.events.find_one({"id": body.event_id}, {"_id": 0, "name": 1})
            if e:
                ev_name = e.get("name") or ""
        if not ev_name:
            raise HTTPException(400, "Etkinlik adı gerekli")
        msg = (body.message or "Kim hazır?").strip() or "Kim hazır?"
        doc = {
            "id": str(uuid.uuid4()),
            "event_id": body.event_id,
            "event_name": ev_name,
            "message": msg,
            "started_at": _now_iso(),
            "started_by_username": user.get("username") or "",
            "closed": False,
        }
        await db.rollcalls.insert_one(doc)
        doc.pop("_id", None)
        # Fan-out push + in-app so linked users see it immediately. Telegram
        # DM piggybacks on the same push infrastructure the announcement
        # broadcaster uses — we deliberately keep it lightweight here.
        title = f"📣 Yoklama · {ev_name}"
        body_text = msg
        url = f"/raporlar?rollcall={doc['id']}"
        fanout = {"push_sent": 0, "app_notif_sent": 0}
        try:
            if broadcast_push:
                push_r = await broadcast_push(title, body_text, url, tag=f"rollcall-{doc['id']}", sound="rally")
                fanout["push_sent"] = (push_r or {}).get("sent", 0) if isinstance(push_r, dict) else 0
        except Exception:
            pass
        try:
            if broadcast_in_app:
                app_r = await broadcast_in_app({
                    "id": doc["id"], "title": title, "body": body_text,
                    "url": url, "image_url": None,
                    "send_channel": False, "send_dm": False,
                    "send_app": True, "event_id": body.event_id,
                })
                fanout["app_notif_sent"] = (app_r or {}).get("app_notif_sent", 0) if isinstance(app_r, dict) else 0
        except Exception:
            pass
        return {"ok": True, "rollcall": doc, "fanout": fanout}

    @router.get("/rollcalls/{rid}")
    async def get_rollcall(rid: str, _: dict = Depends(require_auth)):
        r = await db.rollcalls.find_one({"id": rid}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Yoklama bulunamadı")
        # Aggregate.
        yes = no = maybe = 0
        responses = []
        async for row in db.rollcall_responses.find({"rollcall_id": rid}, {"_id": 0}).sort("responded_at", -1):
            responses.append(row)
            if row.get("response") == "yes": yes += 1
            elif row.get("response") == "no": no += 1
            elif row.get("response") == "maybe": maybe += 1
        return {
            "rollcall": r,
            "counts": {"yes": yes, "no": no, "maybe": maybe, "total": yes + no + maybe},
            "responses": responses,
        }

    @router.post("/rollcalls/{rid}/respond")
    async def respond(rid: str, body: RollcallRespondBody, user: dict = Depends(require_auth)):
        resp = (body.response or "").strip().lower()
        if resp not in ("yes", "no", "maybe"):
            raise HTTPException(400, "Yanıt: yes | no | maybe")
        r = await db.rollcalls.find_one({"id": rid}, {"_id": 0})
        if not r:
            raise HTTPException(404, "Yoklama bulunamadı")
        if r.get("closed"):
            raise HTTPException(400, "Yoklama kapandı")
        await db.rollcall_responses.update_one(
            {"rollcall_id": rid, "user_id": user["id"]},
            {"$set": {
                "id": str(uuid.uuid4()),
                "rollcall_id": rid,
                "user_id": user["id"],
                "username": user.get("username") or "",
                "response": resp,
                "responded_at": _now_iso(),
            }},
            upsert=True,
        )
        # v135.8 — Yoklama Streak: Kullanıcı son 10 yoklamada üst üste "yes"
        # yanıtı verdiyse "streak" preset rozetini otomatik atar. Admin daha
        # sonra manuel olarak kaldırabilir (DELETE /members/{id}/badges/{bid}).
        # Kullanıcı bir üyeye bağlıysa (member_ids) rozet o üyeye eklenir.
        streak_result = {"assigned": False}
        try:
            if resp == "yes":
                # 10 en yeni yanıt (herhangi yoklamadaki) → hepsi 'yes' mi?
                recent = await db.rollcall_responses.find(
                    {"user_id": user["id"]},
                    {"_id": 0, "response": 1, "responded_at": 1},
                ).sort("responded_at", -1).to_list(10)
                if len(recent) >= 10 and all((x.get("response") == "yes") for x in recent):
                    streak_badge = await db.badges.find_one({"key": "streak"}, {"_id": 0, "id": 1})
                    member_ids = user.get("member_ids") or []
                    if streak_badge and member_ids:
                        target = member_ids[0]
                        exists = await db.member_badges.find_one({"member_id": target, "badge_id": streak_badge["id"]})
                        if not exists:
                            await db.member_badges.insert_one({
                                "id": str(uuid.uuid4()),
                                "member_id": target,
                                "badge_id": streak_badge["id"],
                                "awarded_at": _now_iso(),
                                "awarded_by_username": "system:rollcall_streak",
                            })
                            streak_result = {"assigned": True, "member_id": target, "badge_id": streak_badge["id"]}
        except Exception:
            pass
        return {"ok": True, "streak": streak_result}

    @router.post("/rollcalls/{rid}/close")
    async def close_rollcall(rid: str, _: dict = Depends(require_admin)):
        r = await db.rollcalls.update_one({"id": rid}, {"$set": {"closed": True, "closed_at": _now_iso()}})
        if r.matched_count == 0:
            raise HTTPException(404, "Yoklama bulunamadı")
        return {"ok": True}

    return router


async def ensure_rollcalls_indexes(db):
    await db.rollcalls.create_index("id", unique=True)
    await db.rollcall_responses.create_index([("rollcall_id", 1), ("user_id", 1)], unique=True)
    await db.rollcall_responses.create_index("rollcall_id")
