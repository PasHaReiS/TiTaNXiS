"""OCR route — screenshot → structured JSON via Emergent LLM vision integration.

Three modes:
  - members: parse a guild member list screenshot → [{name, power, castle_level, alliance_name?, rank?}]
  - event:   parse an event-result screenshot → {event_hint, participants: [{name, points}]}
  - war:     parse a war-result screenshot → {winner, loser, casualties_won, casualties_lost, notes}

Uses emergentintegrations LlmChat with GPT-5.4 (vision-capable) via the Emergent LLM key.
"""
import os
import uuid
import json
import base64
import re
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional


_LLM_MODEL = os.environ.get("OCR_MODEL", "gpt-5.4")
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB hard cap

_PROMPTS = {
    "members": (
        "You are given a screenshot of a mobile strategy game's guild member roster. "
        "Extract EVERY visible member row into strict JSON with this exact shape and NOTHING else: "
        "{\"members\": [{\"name\": str, \"power\": int|null, \"castle_level\": int|null, "
        "\"alliance_name\": str|null, \"rank\": str|null}]}. "
        "Rules: `power` = the individual might/combat power number without separators. "
        "`castle_level` = numeric level (e.g. 'F8' → 8, 'H30' → 30). "
        "`rank` must be one of R1/R2/R3/R4/R5 if visible, else null. "
        "`alliance_name` is the small alliance tag/prefix if present (e.g. [GOW]). "
        "Skip empty rows. Return raw JSON only — no markdown fences, no commentary."
    ),
    "event": (
        "You are given a screenshot of an event scoreboard from a mobile strategy game. "
        "Extract into strict JSON: "
        "{\"event_hint\": str|null, \"participants\": [{\"name\": str, \"points\": int}]}. "
        "`event_hint` = any visible event title (SvS, Guild Fest, etc.), otherwise null. "
        "`points` = the participant's earned points as an integer (strip separators). "
        "Return raw JSON only — no markdown fences, no commentary."
    ),
    "war": (
        "You are given a screenshot of a battle-result screen from a mobile strategy game. "
        "Extract into strict JSON: "
        "{\"winner\": str|null, \"loser\": str|null, \"casualties_won\": int|null, "
        "\"casualties_lost\": int|null, \"notes\": str|null}. "
        "`casualties_*` are the raw troop-loss counts. "
        "Return raw JSON only — no markdown fences, no commentary."
    ),
}


def _extract_json(text: str) -> dict:
    """Strip common markdown fences, then json.loads. Falls back to first `{...}` slice."""
    t = (text or "").strip()
    # Remove ```json ... ``` or ``` ... ``` fences.
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        return json.loads(t)
    except Exception:
        # Best-effort brace extraction
        m = re.search(r"\{[\s\S]*\}", t)
        if not m:
            raise
        return json.loads(m.group(0))


class OcrApplyMembersBody(BaseModel):
    members: list[dict]


def make_ocr_router(db, require_edit, require_auth):
    router = APIRouter()

    @router.post("/ocr/parse")
    async def parse_screenshot(
        mode: str = Query(..., description="members | event | war"),
        file: UploadFile = File(...),
        _: dict = Depends(require_auth),
    ):
        if mode not in _PROMPTS:
            raise HTTPException(400, f"Geçersiz mod: {mode}")
        contents = await file.read()
        if not contents:
            raise HTTPException(400, "Boş dosya")
        if len(contents) > _MAX_IMAGE_BYTES:
            raise HTTPException(413, "Dosya çok büyük (max 8 MB)")
        # Sniff MIME from magic bytes (fall back to filename if unknown).
        mime = None
        if contents[:8].startswith(b"\x89PNG"):
            mime = "image/png"
        elif contents[:3] == b"\xff\xd8\xff":
            mime = "image/jpeg"
        elif contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
            mime = "image/webp"
        if not mime:
            fn = (file.filename or "").lower()
            if fn.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif fn.endswith(".png"):
                mime = "image/png"
            elif fn.endswith(".webp"):
                mime = "image/webp"
        if not mime:
            raise HTTPException(400, "Sadece PNG, JPEG veya WEBP destekleniyor")

        b64 = base64.b64encode(contents).decode()

        # Local import so the module still loads if emergentintegrations is missing.
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY tanımlı değil")
        chat = LlmChat(
            api_key=api_key,
            session_id=f"ocr-{uuid.uuid4().hex[:8]}",
            system_message="You are a precise OCR JSON extractor. Return only valid JSON.",
        ).with_model("openai", _LLM_MODEL)
        prompt = _PROMPTS[mode]
        msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])
        try:
            reply = await chat.send_message(msg)
        except Exception as e:
            raise HTTPException(502, f"LLM hatası: {e}")
        try:
            data = _extract_json(reply)
        except Exception:
            raise HTTPException(422, f"LLM cevabı JSON değil: {reply[:200]}")
        return {"mode": mode, "data": data, "raw_preview": reply[:400]}

    @router.post("/ocr/apply-members")
    async def apply_members(body: OcrApplyMembersBody, admin: dict = Depends(require_edit)):
        """Admin-only bulk create/update after user reviews OCR preview.

        For each row: if a member with the same (case-insensitive) name exists, PATCH power/castle.
        Otherwise INSERT a new member. Returns per-row status.
        """
        # Preload existing members once for fast lookup by name.
        existing = await db.members.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)
        by_name = {(m.get("name") or "").strip().lower(): m for m in existing}
        created = 0
        updated = 0
        skipped = 0
        errors: list[str] = []
        for row in body.members:
            name = str(row.get("name") or "").strip()
            if not name:
                skipped += 1
                continue
            power = row.get("power")
            castle = row.get("castle_level")
            rank = row.get("rank") or None
            alliance_name = row.get("alliance_name") or None
            key = name.lower()
            try:
                if key in by_name:
                    upd = {}
                    if isinstance(power, (int, float)) and power > 0:
                        upd["bireysel_guc"] = int(power)
                    if isinstance(castle, (int, float)) and castle > 0:
                        upd["castle_level"] = int(castle)
                    if rank in ("R1", "R2", "R3", "R4", "R5"):
                        upd["rank"] = rank
                    if alliance_name:
                        upd["alliance_name"] = alliance_name
                    if upd:
                        await db.members.update_one({"id": by_name[key]["id"]}, {"$set": upd})
                        updated += 1
                    else:
                        skipped += 1
                else:
                    doc = {
                        "id": str(uuid.uuid4()),
                        "name": name,
                        "rank": rank if rank in ("R1", "R2", "R3", "R4", "R5") else "R1",
                        "alliance_name": alliance_name or "",
                        "bireysel_guc": int(power) if isinstance(power, (int, float)) and power > 0 else 0,
                        "castle_level": int(castle) if isinstance(castle, (int, float)) and castle > 0 else 0,
                    }
                    await db.members.insert_one(doc)
                    created += 1
            except Exception as e:
                errors.append(f"{name}: {e}")
        return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}

    return router
