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
import difflib
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from typing import Optional


# Strip a leading alliance tag like "[GOW] PasHa" → "PasHa" and normalise to lowercase for lookup.
_ALLIANCE_TAG_RE = re.compile(r"^\s*\[[^\]]*\]\s*")


def _strip_alliance_tag(name: str) -> str:
    """Remove any leading `[ALLIANCE]` prefix. Idempotent + whitespace-safe."""
    if not name:
        return ""
    cleaned = _ALLIANCE_TAG_RE.sub("", name).strip()
    return cleaned


def _norm_key(name: str) -> str:
    """Case-SENSITIVE member key: only strips the leading [ALLIANCE] tag.

    Rationale: users may keep "Ecem" and "ecem" as two DISTINCT members (mirroring
    the case-sensitive alliance policy GOW vs GoW vs GOw). Keeping the original
    case means exact match won't merge them. Fuzzy match (difflib cutoff 0.82)
    also naturally treats "Ecem" vs "ecem" as different (ratio ~0.75), so
    typo-tolerance still works only when case is preserved.
    """
    return _strip_alliance_tag(name)


def _fuzzy_match(cleaned: str, candidates: list[str]) -> Optional[str]:
    """Return the closest candidate (case-preserved key) or None if no >=0.82 match."""
    if not cleaned or not candidates:
        return None
    hits = difflib.get_close_matches(cleaned, candidates, n=1, cutoff=0.82)
    return hits[0] if hits else None



_LLM_MODEL = os.environ.get("OCR_MODEL", "gpt-5.4")
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB hard cap

_PROMPTS = {
    "members": (
        "You are given a screenshot of a mobile strategy game's guild member roster. "
        "Extract EVERY visible member row into strict JSON with this exact shape and NOTHING else: "
        "{\"members\": [{\"name\": str, \"power\": int|null, \"castle_level\": int|null, "
        "\"alliance_name\": str|null, \"rank\": str|null}]}. "
        "Rules: "
        "• `power` = the individual might/combat power number as a raw integer (strip separators). "
        "  If the game shows suffixes like '1.5B' or '800M' or '250K', normalise: "
        "  B → *1,000,000,000 · M → *1,000,000 · K → *1,000. Example: '1.5B' → 1500000000, '800M' → 800000000. "
        "• `castle_level` = ONLY the number displayed DIRECTLY NEXT TO the small PINK / "
        "  MAGENTA (Hex-shaped) HEXAGON ICON that sits right before the player name. "
        "  Do NOT return numbers from anywhere else on the screen (row indexes, kill "
        "  counts, side stats, might/power values, event points — none of these). "
        "  If no pink hexagon is visible next to that row, return null. Example: hexagon "
        "  shows '38' → 38. Letter prefix like 'F8' or 'H30' → strip the letter and keep "
        "  only the integer part. "
        "• `rank` must be one of R1/R2/R3/R4/R5 if visible (usually a small badge near the "
        "  name), else null. "
        "• `alliance_name` = the alliance tag shown next to the name, WITHOUT any brackets. "
        "  Return only the plain letters/digits (e.g. if the screenshot shows '[GOW] PasHa' "
        "  return alliance_name='GOW', name='PasHa'). NEVER include '[' or ']' characters. "
        "Skip empty rows. Return raw JSON only — no markdown fences, no commentary."
    ),
    "event": (
        "You are given a screenshot of an event scoreboard from a mobile strategy game. "
        "Extract EVERY visible participant row into strict JSON with this exact shape and NOTHING else: "
        "{\"event_hint\": str|null, \"participants\": [{\"name\": str, \"points\": int, "
        "\"alliance_name\": str|null}]}. "
        "Rules: "
        "• `event_hint` = any visible event title (SvS, Guild Fest, etc.), otherwise null. "
        "• `points` = the participant's earned points as an integer (strip separators like "
        "  commas/dots/spaces). Example '1.234.567' → 1234567. "
        "• `alliance_name` = the alliance tag next to the name, WITHOUT any brackets. "
        "  Return only the plain letters/digits (e.g. '[GOW] PasHa' → alliance_name='GOW', "
        "  name='PasHa'). NEVER include '[' or ']' characters. If no tag visible, null. "
        "• `name` = ONLY the player's display name — do NOT include alliance tags, rank "
        "  badges, castle level numbers, or leading row-index digits. "
        "IMPORTANT: Do NOT extract castle_level, rank, or power for event scoreboards — "
        "these fields belong to the member-roster mode only. Return raw JSON only — no "
        "markdown fences, no commentary."
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


_POWER_SUFFIX_RE = re.compile(r"^\s*([0-9]+(?:[.,][0-9]+)?)\s*([KkMmBb])\s*$")


def _normalise_power(value) -> Optional[int]:
    """Convert '1.5B', '800M', '250K' or a raw number to an int; None if unusable."""
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    s = str(value).strip().replace(",", ".")
    m = _POWER_SUFFIX_RE.match(s)
    if m:
        num = float(m.group(1))
        mult = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}[m.group(2).lower()]
        return int(num * mult)
    try:
        n = int(float(s.replace(".", "").replace(" ", "")))
        return n if n > 0 else None
    except Exception:
        return None


def _clean_alliance(value) -> Optional[str]:
    """Strip brackets/whitespace from an alliance tag; return None if empty."""
    if value is None:
        return None
    s = str(value).replace("[", "").replace("]", "").strip()
    return s or None


def _postprocess_rows(data: dict, mode: str) -> dict:
    """Normalise LLM output — strip `[]` from alliance_name, coerce power suffixes."""
    if not isinstance(data, dict):
        return data
    keys = {"members": "members", "event": "participants"}
    key = keys.get(mode)
    if not key:
        return data
    rows = data.get(key) or []
    cleaned = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        r = dict(r)
        if "alliance_name" in r:
            r["alliance_name"] = _clean_alliance(r.get("alliance_name"))
        if "power" in r:
            r["power"] = _normalise_power(r.get("power"))
        cleaned.append(r)
    data[key] = cleaned
    return data


_RANK_ORDER = {"R1": 1, "R2": 2, "R3": 3, "R4": 4, "R5": 5}


def _auto_rank_from_castle(castle: Optional[int], current_rank: Optional[str]) -> Optional[str]:
    """Emergent-side promotion rule — kale seviyesi ≥8 → R3, 5-7 → R2.
    R1 and below-5 castles keep whatever rank the admin already chose. NEVER
    demotes (R4/R5 admins stay put). Returns None when the current rank is
    already ≥ target (no change needed).
    """
    if not isinstance(castle, int) or castle <= 0:
        return None
    if castle >= 8:
        target = "R3"
    elif castle >= 5:
        target = "R2"
    else:
        return None  # castle <5 doesn't trigger auto-promotion
    current = current_rank if current_rank in _RANK_ORDER else "R1"
    if _RANK_ORDER.get(current, 1) >= _RANK_ORDER[target]:
        return None
    return target


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


class OcrApplyEventPointsBody(BaseModel):
    event_id: str
    participants: list[dict]  # [{name: str, points: int, rank?: str, alliance_name?: str}]
    multiplier: Optional[float] = 1.0
    # When True, duplicate members (already scored in this event) get their
    # existing point rows DELETED and replaced with the new OCR values.
    # When False (default), duplicates are skipped and surfaced in `skipped_duplicates`.
    overwrite_duplicates: bool = False


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
        data = _postprocess_rows(data, mode)
        return {"mode": mode, "data": data, "raw_preview": reply[:400]}

    @router.post("/ocr/apply-members")
    async def apply_members(body: OcrApplyMembersBody, admin: dict = Depends(require_edit)):
        """Admin-only bulk create/update after user reviews OCR preview.

        Names may arrive prefixed with an alliance tag like `[GOW] PasHa` — the tag is
        stripped before matching so we don't create duplicates. If no exact match, a
        fuzzy (difflib ratio >=0.82) fallback matches typos/OCR artefacts.
        """
        existing = await db.members.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)
        # Index by CASE-SENSITIVE name (alliance tag stripped). "Ali" and "ali"
        # are intentionally kept as distinct members.
        by_name = {_norm_key(m.get("name") or ""): m for m in existing}
        by_name_keys = list(by_name.keys())
        created = 0
        updated = 0
        skipped = 0
        errors: list[str] = []
        for row in body.members:
            raw_name = str(row.get("name") or "").strip()
            clean_name = _strip_alliance_tag(raw_name)
            if not clean_name:
                skipped += 1
                continue
            power = row.get("power")
            castle = row.get("castle_level")
            rank = row.get("rank") or None
            alliance_name = row.get("alliance_name") or None
            # If OCR gave us "[GOW] PasHa" but no alliance_name field, capture the tag.
            if not alliance_name:
                m_tag = _ALLIANCE_TAG_RE.match(raw_name)
                if m_tag:
                    alliance_name = m_tag.group(0).strip().strip("[]").strip() or None
            key = _norm_key(clean_name)
            # Exact match first, fuzzy fallback second.
            match_key = key if key in by_name else _fuzzy_match(key, by_name_keys)
            try:
                if match_key:
                    upd = {}
                    if isinstance(power, (int, float)) and power > 0:
                        upd["bireysel_guc"] = int(power)
                    if isinstance(castle, (int, float)) and castle > 0:
                        upd["castle_level"] = int(castle)
                    if rank in ("R1", "R2", "R3", "R4", "R5"):
                        upd["rank"] = rank
                    if alliance_name:
                        upd["alliance_name"] = alliance_name
                    # Auto-rank rule — if castle_level bumped and the admin did
                    # NOT explicitly set a higher rank in the OCR payload, promote:
                    # castle ≥ 8 → R3, castle 5-7 → R2. Never demotes.
                    existing_member = by_name[match_key]
                    if "castle_level" in upd:
                        effective_rank = upd.get("rank") or existing_member.get("rank") or "R1"
                        auto = _auto_rank_from_castle(upd["castle_level"], effective_rank)
                        if auto and auto != effective_rank:
                            upd["rank"] = auto
                    if upd:
                        await db.members.update_one({"id": existing_member["id"]}, {"$set": upd})
                        updated += 1
                    else:
                        skipped += 1
                else:
                    seed_castle = int(castle) if isinstance(castle, (int, float)) and castle > 0 else 0
                    seed_rank = rank if rank in ("R1", "R2", "R3", "R4", "R5") else "R1"
                    auto = _auto_rank_from_castle(seed_castle, seed_rank)
                    if auto:
                        seed_rank = auto
                    doc = {
                        "id": str(uuid.uuid4()),
                        "name": clean_name,
                        "rank": seed_rank,
                        "alliance_name": alliance_name or "",
                        "bireysel_guc": int(power) if isinstance(power, (int, float)) and power > 0 else 0,
                        "castle_level": seed_castle,
                    }
                    await db.members.insert_one(doc)
                    created += 1
            except Exception as e:
                errors.append(f"{clean_name}: {e}")
        # Audit log — best-effort, never fails the request.
        try:
            from datetime import datetime as _dt, timezone as _tz
            await db.ocr_audit.insert_one({
                "id": str(uuid.uuid4()),
                "mode": "members",
                "actor": (admin or {}).get("username") or (admin or {}).get("email") or "?",
                "created": created,
                "updated": updated,
                "skipped": skipped,
                "errors": len(errors),
                "created_at": _dt.now(_tz.utc).isoformat(),
            })
        except Exception:
            pass
        return {"created": created, "updated": updated, "skipped": skipped, "errors": errors}

    @router.post("/ocr/apply-event-points")
    async def apply_event_points(body: OcrApplyEventPointsBody, admin: dict = Depends(require_edit)):
        """Save OCR-parsed participant scores against a chosen event.

        Name matching strips leading `[ALLIANCE]` tags (e.g. `[GOW] PasHa` → `PasHa`)
        and falls back to a fuzzy (difflib) match if no exact hit. If still no match,
        auto-creates a new member (with alliance auto-resolution from the bracket tag)
        so the point row can always be saved.
        """
        import uuid as _uuid
        from datetime import datetime as _dt, timezone as _tz
        ev = await db.events.find_one({"id": body.event_id}, {"_id": 0, "id": 1, "name": 1})
        if not ev:
            raise HTTPException(404, "Etkinlik bulunamadı")
        members_all = await db.members.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(10000)
        by_name = {_norm_key(m.get("name") or ""): m for m in members_all}
        by_name_keys = list(by_name.keys())

        # Cache existing alliance names exactly (case-sensitive). GOW, GoW, GOw
        # are intentionally distinct alliances (main + academies) and must NOT
        # be merged. OCR must use the exact casing it read from the screenshot.
        existing_alliances = set(await db.members.distinct("alliance_name"))

        def _resolve_alliance(tag: Optional[str]) -> Optional[str]:
            if not tag:
                return None
            t = str(tag).replace("[", "").replace("]", "").strip()
            if not t:
                return None
            # Exact-case match keeps GOW/GoW/GOw as separate alliances.
            return t if t in existing_alliances else t

        created = 0
        overwritten = 0  # duplicates whose old point rows were deleted + replaced
        skipped_duplicates: list[dict] = []  # rows blocked because member already has points for this event
        new_members: list[str] = []
        errors: list[str] = []
        docs: list[dict] = []
        new_member_docs: list[dict] = []
        overwrite_member_ids: list[str] = []  # collect ids so we bulk-delete once
        now_iso_str = _dt.now(_tz.utc).isoformat()
        # Preflight: existing point rows for this event (by member_id) so we can
        # BLOCK duplicate submissions instead of silently double-counting.
        existing_point_member_ids = set(
            await db.points.distinct("member_id", {"event_id": body.event_id})
        )
        member_name_by_id = {m["id"]: m.get("name", "?") for m in members_all}
        for row in body.participants:
            raw_name = str(row.get("name") or "").strip()
            clean_name = _strip_alliance_tag(raw_name)
            pts = row.get("points") or 0
            if not clean_name:
                continue
            try:
                pts_int = int(pts)
            except Exception:
                errors.append(f"{clean_name}: geçersiz puan '{pts}'")
                continue
            # Event mode ONLY handles points + optional alliance for member matching
            # + explicit rank (user picks it in the preview dropdown; defaults to R1
            # client-side). castle_level / power are strictly out-of-scope here —
            # they live in members-mode OCR.
            row_alliance = row.get("alliance_name")
            row_rank = str(row.get("rank") or "R1").upper()
            if row_rank not in ("R1", "R2", "R3", "R4", "R5"):
                row_rank = "R1"
            key = _norm_key(clean_name)
            match_key = key if key in by_name else _fuzzy_match(key, by_name_keys)
            if match_key:
                target_member_id = by_name[match_key]["id"]
                target_name = by_name[match_key]["name"]
                # Duplicate guard — this member already has a point row for this
                # exact event. Skip and surface it in the response so the admin
                # can decide (edit the existing row via the manual Puan panel, or
                # deliberately delete the old row first).
                if target_member_id in existing_point_member_ids:
                    if body.overwrite_duplicates:
                        # Deliberate overwrite path — mark the existing rows
                        # for bulk deletion below, then let the fresh row fall
                        # through to the insert list.
                        overwrite_member_ids.append(target_member_id)
                        overwritten += 1
                    else:
                        skipped_duplicates.append({
                            "name": target_name,
                            "member_id": target_member_id,
                            "attempted_points": pts_int,
                        })
                        continue
                note = (
                    "OCR" if match_key == key
                    else f"OCR (fuzzy match: '{raw_name}' → '{target_name}')"
                )
            else:
                # Auto-create the missing member. Extract alliance tag from raw name
                # (e.g. "[GOW] PasHa" → alliance=GOW) or from explicit alliance_name field.
                tag_from_row = row_alliance
                tag_from_name = None
                m_tag = _ALLIANCE_TAG_RE.match(raw_name)
                if m_tag:
                    inner = m_tag.group(0).strip().strip("[]").strip()
                    tag_from_name = inner or None
                alliance_canonical = _resolve_alliance(tag_from_row or tag_from_name)
                if alliance_canonical and alliance_canonical not in existing_alliances:
                    existing_alliances.add(alliance_canonical)

                new_id = str(_uuid.uuid4())
                new_member_docs.append({
                    "id": new_id,
                    "name": clean_name,
                    "rank": row_rank,
                    "alliance_name": alliance_canonical or "",
                    "bireysel_guc": 0,
                    "castle_level": 0,
                })
                # Update the in-memory index so a repeat name in the same batch matches.
                by_name[key] = {"id": new_id, "name": clean_name}
                by_name_keys.append(key)
                new_members.append(clean_name)
                target_member_id = new_id
                target_name = clean_name
                note = f"OCR (auto-created member from '{raw_name}')"

            docs.append({
                "id": str(_uuid.uuid4()),
                "member_id": target_member_id,
                "event_id": body.event_id,
                "points": pts_int,
                "multiplier": float(body.multiplier or 1.0),
                "note": note,
                "created_at": now_iso_str,
                "date": now_iso_str,
            })
            created += 1

        if new_member_docs:
            await db.members.insert_many(new_member_docs)
        # Overwrite mode: wipe the previous point rows for the flagged members
        # BEFORE inserting the new ones so we don't briefly double-count.
        if overwrite_member_ids:
            await db.points.delete_many({
                "event_id": body.event_id,
                "member_id": {"$in": overwrite_member_ids},
            })
        if docs:
            await db.points.insert_many(docs)
        # Audit log — best-effort.
        try:
            from datetime import datetime as _dt, timezone as _tz
            await db.ocr_audit.insert_one({
                "id": str(_uuid.uuid4()),
                "mode": "event",
                "actor": (admin or {}).get("username") or (admin or {}).get("email") or "?",
                "event_name": ev.get("name"),
                "event_id": body.event_id,
                "created": created,
                "updated": 0,
                "new_members_created": len(new_member_docs),
                "errors": len(errors),
                "created_at": _dt.now(_tz.utc).isoformat(),
            })
        except Exception:
            pass
        return {
            "created": created,
            "overwritten": overwritten,
            "new_members_created": len(new_member_docs),
            "new_member_names": new_members,
            "skipped_duplicates": skipped_duplicates,
            "errors": errors,
            "event_name": ev.get("name"),
        }

    @router.get("/ocr/event-participants/{event_id}")
    async def event_existing_participants(event_id: str, _: dict = Depends(require_auth)):
        """Preflight lookup — for a given event, return every member who already
        has a point row (with the current points value). Used by the OCR event
        preview to render a "önceki → yeni" diff strip and block duplicates
        before the user hits Save.
        """
        docs = await db.points.find(
            {"event_id": event_id},
            {"_id": 0, "member_id": 1, "points": 1, "multiplier": 1},
        ).to_list(10000)
        if not docs:
            return {"event_id": event_id, "participants": []}
        member_ids = list({d.get("member_id") for d in docs if d.get("member_id")})
        members = await db.members.find(
            {"id": {"$in": member_ids}},
            {"_id": 0, "id": 1, "name": 1},
        ).to_list(len(member_ids))
        name_by_id = {m["id"]: m.get("name", "?") for m in members}
        # Aggregate — a member CAN in theory have multiple point rows for the
        # same event today; we sum them so the diff shows the effective total.
        totals: dict[str, int] = {}
        for d in docs:
            mid = d.get("member_id")
            if not mid:
                continue
            totals[mid] = totals.get(mid, 0) + int(round(int(d.get("points") or 0) * float(d.get("multiplier", 1.0))))
        return {
            "event_id": event_id,
            "participants": [
                {"member_id": mid, "name": name_by_id.get(mid, "?"), "existing_points": pts}
                for mid, pts in totals.items()
            ],
        }

    @router.post("/ocr/parse-multi")
    async def parse_multi(
        mode: str = Query(..., description="event | members"),
        files: list[UploadFile] = File(...),
        merge: str = Query("sum", description="sum | max | first (event only)"),
        _: dict = Depends(require_auth),
    ):
        """Parse multiple screenshots and merge results by normalised name.

        Supports `mode=event` (participant scores) and `mode=members` (roster rows).
        For members: dedupe by normalised name; the first non-empty value wins for
        power/castle/rank/alliance_name fields.
        """
        if mode not in ("event", "members"):
            raise HTTPException(400, "parse-multi sadece event/members modunu destekliyor")
        if not files:
            raise HTTPException(400, "En az bir dosya gerekli")
        if len(files) > 10:
            raise HTTPException(400, "En fazla 10 dosya yüklenebilir")
        if merge not in ("sum", "max", "first"):
            raise HTTPException(400, "merge: sum | max | first")

        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(500, "EMERGENT_LLM_KEY tanımlı değil")

        per_image: list[dict] = []
        merged: dict[str, dict] = {}
        event_hint: Optional[str] = None
        prompt_key = mode
        for idx, f in enumerate(files):
            contents = await f.read()
            if not contents or len(contents) > _MAX_IMAGE_BYTES:
                per_image.append({"index": idx, "filename": f.filename, "error": "boş/çok büyük"})
                continue
            mime = None
            if contents[:8].startswith(b"\x89PNG"):
                mime = "image/png"
            elif contents[:3] == b"\xff\xd8\xff":
                mime = "image/jpeg"
            elif contents[:4] == b"RIFF" and contents[8:12] == b"WEBP":
                mime = "image/webp"
            if not mime:
                per_image.append({"index": idx, "filename": f.filename, "error": "invalid MIME"})
                continue
            b64 = base64.b64encode(contents).decode()
            chat = LlmChat(
                api_key=api_key,
                session_id=f"ocr-multi-{uuid.uuid4().hex[:8]}",
                system_message="You are a precise OCR JSON extractor. Return only valid JSON.",
            ).with_model("openai", _LLM_MODEL)
            try:
                reply = await chat.send_message(
                    UserMessage(text=_PROMPTS[prompt_key], file_contents=[ImageContent(image_base64=b64)])
                )
                data = _extract_json(reply)
                data = _postprocess_rows(data, mode)
            except Exception as e:
                per_image.append({"index": idx, "filename": f.filename, "error": str(e)[:120]})
                continue

            if mode == "event":
                parts = data.get("participants") or []
                if not event_hint and data.get("event_hint"):
                    event_hint = data["event_hint"]
                per_image.append({"index": idx, "filename": f.filename, "count": len(parts)})
                for p in parts:
                    raw_name = str(p.get("name") or "").strip()
                    if not raw_name:
                        continue
                    try:
                        pts_int = int(p.get("points") or 0)
                    except Exception:
                        continue
                    key = _norm_key(raw_name)
                    if key not in merged:
                        merged[key] = {"name": raw_name, "points": pts_int, "sources": 1}
                    else:
                        merged[key]["sources"] += 1
                        if merge == "sum":
                            merged[key]["points"] += pts_int
                        elif merge == "max":
                            merged[key]["points"] = max(merged[key]["points"], pts_int)
            else:  # members
                rows = data.get("members") or []
                per_image.append({"index": idx, "filename": f.filename, "count": len(rows)})
                for r in rows:
                    raw_name = str(r.get("name") or "").strip()
                    if not raw_name:
                        continue
                    key = _norm_key(raw_name)
                    if key not in merged:
                        merged[key] = {**r, "name": raw_name, "sources": 1}
                    else:
                        merged[key]["sources"] += 1
                        # First-non-empty-wins for scalar fields
                        for fld in ("power", "castle_level", "rank", "alliance_name"):
                            if not merged[key].get(fld) and r.get(fld):
                                merged[key][fld] = r.get(fld)

        merged_list = (
            sorted(merged.values(), key=lambda x: -(x.get("points") or 0))
            if mode == "event"
            else sorted(merged.values(), key=lambda x: -(x.get("power") or 0))
        )
        payload_key = "participants" if mode == "event" else "members"
        return {
            "mode": mode,
            "merge_strategy": merge,
            "event_hint": event_hint,
            "data": {payload_key: merged_list, "event_hint": event_hint},
            "per_image": per_image,
        }

    @router.get("/ocr/history")
    async def ocr_history(limit: int = 100, _: dict = Depends(require_auth)):
        """Return the most recent OCR ingestions (members + event apply calls)."""
        docs = await db.ocr_audit.find({}, {"_id": 0}).sort("created_at", -1).limit(max(1, min(int(limit), 500))).to_list(500)
        return docs

    return router
