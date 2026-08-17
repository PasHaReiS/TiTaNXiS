from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import httpx
import logging
import io
import csv
import random
import mimetypes
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict, Union, Tuple, Any
import uuid
from datetime import datetime, timezone, timedelta
from collections import defaultdict
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Auth wiring
from auth import make_auth_router, make_auth_deps, seed_admin, ensure_indexes
_optional_auth, require_auth, require_edit, require_admin = make_auth_deps(db)

app = FastAPI(title="GOD OF WAR Yönetim API")
api_router = APIRouter(prefix="/api")


# ---------- Kubernetes health probe (no /api prefix) ----------
# The deployment platform hits `GET /health` (not `/api/health`) as its
# liveness/readiness check. Return 200 fast, without a DB round-trip, so the
# pod doesn't get killed on cold start when Mongo hasn't finished handshaking.
@app.get("/health")
async def _kube_health():
    return {"status": "ok"}


# ---------- Models ----------
def now_iso():
    return datetime.now(timezone.utc).isoformat()


class Member(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    member_id: Optional[str] = None
    alliance_name: Optional[str] = None
    rank: Optional[str] = "R1"  # R1-R5
    title: Optional[str] = None
    level: Optional[int] = 1
    castle_level: Optional[str] = None
    tetikci_f: Optional[str] = None
    tetikci_t: Optional[str] = None
    bombaci_f: Optional[str] = None
    bombaci_t: Optional[str] = None
    kalkanli_f: Optional[str] = None
    kalkanli_t: Optional[str] = None
    bireysel_guc: Optional[int] = 0
    note: Optional[str] = None
    note_position: Optional[str] = "inline"  # "inline" | "bottom"
    note_color: Optional[str] = "#DC2626"    # hex color for bottom-position notes
    country: Optional[str] = None            # ISO 3166-1 alpha-2 (uppercase), e.g. "TR", "US"
    telegram_username: Optional[str] = None  # Telegram @handle for username-based DM fallback (stored without @)
    created_at: str = Field(default_factory=now_iso)


class MemberCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    member_id: Optional[str] = None
    alliance_name: Optional[str] = None
    rank: Optional[str] = "R1"
    title: Optional[str] = None
    level: Optional[int] = 1
    castle_level: Optional[str] = None
    tetikci_f: Optional[str] = None
    tetikci_t: Optional[str] = None
    bombaci_f: Optional[str] = None
    bombaci_t: Optional[str] = None
    kalkanli_f: Optional[str] = None
    kalkanli_t: Optional[str] = None
    bireysel_guc: Optional[int] = 0
    note: Optional[str] = None
    note_position: Optional[str] = "inline"
    note_color: Optional[str] = "#DC2626"
    country: Optional[str] = None
    telegram_username: Optional[str] = None


class MemberUpdate(BaseModel):
    @field_validator("bireysel_guc", mode="before")
    @classmethod
    def _coerce_guc(cls, v):
        if v is None or isinstance(v, int):
            return v
        s = str(v).replace(".", "").replace(",", "").replace(" ", "").strip()
        if not s or not s.lstrip("-").isdigit():
            return None
        return int(s)

    name: Optional[str] = None
    member_id: Optional[str] = None
    alliance_name: Optional[str] = None
    rank: Optional[str] = None
    title: Optional[str] = None
    level: Optional[int] = None
    castle_level: Optional[str] = None
    tetikci_f: Optional[str] = None
    tetikci_t: Optional[str] = None
    bombaci_f: Optional[str] = None
    bombaci_t: Optional[str] = None
    kalkanli_f: Optional[str] = None
    kalkanli_t: Optional[str] = None
    bireysel_guc: Optional[int] = None
    note: Optional[str] = None
    note_position: Optional[str] = None
    note_color: Optional[str] = None
    country: Optional[str] = None
    telegram_username: Optional[str] = None


class Event(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    group_name: str = "SvS vs 10007"
    multiplier: float = 1.0
    date: str
    subtitle: Optional[str] = None
    banner_url: Optional[str] = None
    archived: bool = False
    reminder_enabled: bool = True
    # When True the event is hidden from every leaderboard / group aggregate.
    # Used for practice/test/hidden events so the ranking stays clean.
    hidden_from_leaderboard: bool = False
    result_screenshots: List[str] = Field(default_factory=list)  # post-hoc rank/reward screenshots
    created_at: str = Field(default_factory=now_iso)
    # When set, this event belongs to a recurring series generated by a
    # single admin action. Enables `/events/series/{id}` bulk edit/delete.
    series_id: Optional[str] = None


class EventCreate(BaseModel):
    name: str
    group_name: Optional[str] = "SvS vs 10007"
    multiplier: Optional[float] = 1.0
    date: str
    subtitle: Optional[str] = None
    banner_url: Optional[str] = None
    archived: Optional[bool] = False
    reminder_enabled: Optional[bool] = True
    hidden_from_leaderboard: Optional[bool] = False
    # Recurrence — when count > 1 the backend expands into that many events,
    # first at `date`, each subsequent one shifted by `interval`. `interval`
    # values: "none" (default, no expansion), "2days", "weekly", "2weekly",
    # "monthly". `count` is clamped to [1, 52].
    recurrence_interval: Optional[str] = "none"
    recurrence_count: Optional[int] = 1


class EventUpdate(BaseModel):
    name: Optional[str] = None
    group_name: Optional[str] = None
    multiplier: Optional[float] = None
    date: Optional[str] = None
    subtitle: Optional[str] = None
    banner_url: Optional[str] = None
    archived: Optional[bool] = None
    reminder_enabled: Optional[bool] = None
    hidden_from_leaderboard: Optional[bool] = None
    # Same fields as create — when supplied on PATCH the backend will spawn
    # additional future events after the current one (without touching the
    # current one) so admins can add a "Tekrarla" schedule to any existing
    # event.
    recurrence_interval: Optional[str] = None
    recurrence_count: Optional[int] = None


class Point(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    member_name: Optional[str] = None
    event_id: str
    event_name: Optional[str] = None
    points: int
    multiplier: float = 1.0
    note: Optional[str] = None
    date: str = Field(default_factory=now_iso)


class PointCreate(BaseModel):
    member_id: str
    event_id: str
    points: int
    multiplier: Optional[float] = 1.0
    note: Optional[str] = None


class PointUpdate(BaseModel):
    points: Optional[int] = None
    multiplier: Optional[float] = None
    note: Optional[str] = None
    event_id: Optional[str] = None


class BulkPointCreate(BaseModel):
    member_ids: List[str]
    event_id: str
    points: int
    multiplier: Optional[float] = 1.0
    note: Optional[str] = None


class Commander(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: str
    subcategory: Optional[str] = None
    rank: Optional[str] = None
    rarity: Optional[str] = None  # legendary | epic | common
    characters: List[str] = []
    image_url: Optional[str] = None
    images: List[str] = []
    description: Optional[str] = None
    is_kof: bool = False
    kof_pairs: List[str] = []
    team_slots: Optional[List[Dict[str, Optional[str]]]] = None
    created_at: str = Field(default_factory=now_iso)


class CommanderCreate(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = None
    rank: Optional[str] = None
    rarity: Optional[str] = None
    characters: Optional[List[str]] = []
    image_url: Optional[str] = None
    images: Optional[List[str]] = []
    description: Optional[str] = None
    is_kof: Optional[bool] = False
    kof_pairs: Optional[List[str]] = []
    team_slots: Optional[List[Dict[str, Optional[str]]]] = None


class CommanderUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    rank: Optional[str] = None
    rarity: Optional[str] = None
    characters: Optional[List[str]] = None
    image_url: Optional[str] = None
    images: Optional[List[str]] = None
    description: Optional[str] = None
    is_kof: Optional[bool] = None
    kof_pairs: Optional[List[str]] = None
    team_slots: Optional[List[Dict[str, Optional[str]]]] = None


# ---------- Helpers ----------
def strip_id(doc):
    if doc and "_id" in doc:
        doc.pop("_id", None)
    return doc


async def enrich_point(p):
    if not p.get("member_name"):
        m = await db.members.find_one({"id": p["member_id"]}, {"_id": 0})
        p["member_name"] = m["name"] if m else "Bilinmeyen"
    if not p.get("event_name"):
        e = await db.events.find_one({"id": p["event_id"]}, {"_id": 0})
        p["event_name"] = e["name"] if e else "Bilinmeyen"
    return p


async def enrich_points_batch(points):
    """Batch-load members and events to avoid N+1 queries."""
    member_ids = {p["member_id"] for p in points if not p.get("member_name")}
    event_ids = {p["event_id"] for p in points if not p.get("event_name")}
    member_map = {}
    event_map = {}
    if member_ids:
        members = await db.members.find({"id": {"$in": list(member_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(member_ids))
        member_map = {m["id"]: m["name"] for m in members}
    if event_ids:
        events = await db.events.find({"id": {"$in": list(event_ids)}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(event_ids))
        event_map = {e["id"]: e["name"] for e in events}
    for p in points:
        if not p.get("member_name"):
            p["member_name"] = member_map.get(p["member_id"], "Bilinmeyen")
        if not p.get("event_name"):
            p["event_name"] = event_map.get(p["event_id"], "Bilinmeyen")
    return points


# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"message": "GOD OF WAR API", "status": "ok"}


@api_router.get("/health")
async def health():
    """Lightweight liveness probe used post-deploy to confirm the API router is mounted."""
    try:
        await db.command("ping")
        db_ok = True
    except Exception:
        db_ok = False
    return {"status": "ok", "db": "up" if db_ok else "down"}


# ---------- Members ----------
@api_router.get("/members")
async def list_members(search: Optional[str] = None, country: Optional[str] = None):
    query = {}
    if search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"member_id": {"$regex": search, "$options": "i"}},
            {"alliance_name": {"$regex": search, "$options": "i"}}
        ]}
    if country:
        # Case-insensitive ISO2 filter; forced upper to match how we persist.
        query["country"] = (country or "").strip().upper()
    docs = await db.members.find(query, {"_id": 0}).to_list(1000)
    return docs


@api_router.get("/alliances")
async def list_alliances():
    """Return distinct alliance names for autocomplete."""
    names = await db.members.distinct("alliance_name")
    return sorted([n for n in names if n])


@api_router.get("/members/trend")
async def members_trend(ids: str = Query(...), days: int = 7):
    """Return daily weighted-points totals for each requested member_id over the last N days.

    Response: { member_id: [ {date: "YYYY-MM-DD", points: N}, ... days entries ordered oldest→newest ] }
    """
    days = max(1, min(int(days or 7), 30))
    id_list = [x.strip() for x in (ids or "").split(",") if x.strip()][:20]
    if not id_list:
        return {}
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    points = await db.points.find(
        {"member_id": {"$in": id_list}, "date": {"$gte": cutoff.isoformat()}},
        {"_id": 0, "member_id": 1, "points": 1, "multiplier": 1, "date": 1},
    ).to_list(20000)
    today = datetime.now(timezone.utc).date()
    day_keys = [(today - timedelta(days=(days - 1 - i))).isoformat() for i in range(days)]
    result = {mid: {d: 0 for d in day_keys} for mid in id_list}
    for p in points:
        d = str(p.get("date") or "")[:10]
        if d in result.get(p["member_id"], {}):
            result[p["member_id"]][d] += int(p["points"]) * float(p.get("multiplier", 1.0))
    return {mid: [{"date": d, "points": int(result[mid][d])} for d in day_keys] for mid in id_list}


@api_router.get("/members/castle-stats")
async def members_castle_stats():
    """Aggregate castle level statistics across all members.

    castle_level is stored as an Optional[str] (legacy CSV/OCR imports may
    include stray characters), so we defensively coerce to int and treat
    non-positive / non-numeric values as "missing". Returns totals,
    per-level distribution, avg/min/max, and the Top 10 members by level.
    """
    total = 0
    levels: list[int] = []
    ranked: list[dict] = []
    async for m in db.members.find(
        {}, {"_id": 0, "id": 1, "name": 1, "alliance_name": 1, "castle_level": 1},
    ):
        total += 1
        raw = m.get("castle_level")
        try:
            n = int(str(raw).strip()) if raw not in (None, "") else 0
        except (TypeError, ValueError):
            n = 0
        if n > 0:
            levels.append(n)
            ranked.append({
                "id": m.get("id"),
                "name": m.get("name") or "?",
                "alliance_name": m.get("alliance_name"),
                "castle_level": n,
            })
    ranked.sort(key=lambda x: (-x["castle_level"], x["name"].lower()))
    dist: dict[int, int] = {}
    for lvl in levels:
        dist[lvl] = dist.get(lvl, 0) + 1
    distribution = [{"level": lvl, "count": c} for lvl, c in sorted(dist.items())]
    return {
        "total_members": total,
        "with_castle_level": len(levels),
        "missing": total - len(levels),
        "avg_level": round(sum(levels) / len(levels), 1) if levels else 0.0,
        "max_level": max(levels) if levels else 0,
        "min_level": min(levels) if levels else 0,
        "distribution": distribution,
        "top": ranked[:10],
    }


@api_router.get("/members/{member_id}")
async def get_member(member_id: str):
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Üye bulunamadı")
    return doc


@api_router.get("/members/{member_id}/history")
async def member_history(member_id: str):
    m = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Üye bulunamadı")
    points = await db.points.find({"member_id": member_id}, {"_id": 0}).sort("date", -1).to_list(1000)
    await enrich_points_batch(points)
    total = sum(int(p["points"]) * float(p.get("multiplier", 1.0)) for p in points)
    return {"member": m, "points": points, "total": int(total), "event_count": len(set(p["event_id"] for p in points))}


import re as _re_alliance

_ALLIANCE_BRACKETS_RE = _re_alliance.compile(r"^\s*\[([^\]]+)\]\s*(.*)$")


async def find_or_create_alliance(raw_input: Optional[str]) -> Optional[str]:
    """Resolve a user-provided alliance tag/name to its canonical existing casing.

    - Strips `[TAG]` brackets and outer whitespace.
    - **Case-SENSITIVE** exact match against existing distinct
      `members.alliance_name` values — `GOW`, `GoW`, `GOw` are intentionally
      distinct alliances (main + academies) and must NOT be collapsed.
    - Returns the input string as-is if no exact match, so a new alliance
      is created the moment the member is saved (alliances live inside
      `members.alliance_name`, not a separate collection).
    """
    if not raw_input:
        return None
    s = str(raw_input).strip()
    if not s:
        return None
    # If wrapped in brackets, take the tag inside.
    m = _ALLIANCE_BRACKETS_RE.match(s)
    if m:
        s = m.group(1).strip()
    # Belt-and-braces: strip any stray brackets/whitespace so we never store
    # "[GOW]" or "GOW]" as an alliance name (e.g. malformed OCR outputs).
    s = s.replace("[", "").replace("]", "").strip()
    if not s:
        return None
    existing = await db.members.distinct("alliance_name")
    for e in existing:
        if e and str(e) == s:  # EXACT case-sensitive match
            return e
    return s  # new alliance — preserves original casing


def _split_alliance_from_name(raw: str) -> tuple[Optional[str], str]:
    """Given "[GOW] PasHa" return ("GOW", "PasHa"); given "PasHa" return (None, "PasHa")."""
    if not raw:
        return None, ""
    m = _ALLIANCE_BRACKETS_RE.match(str(raw))
    if m:
        tag = (m.group(1) or "").replace("[", "").replace("]", "").strip()
        return (tag or None), m.group(2).strip()
    return None, str(raw).strip()


class BatchCreateMemberInput(BaseModel):
    name: str
    alliance_tag: Optional[str] = None
    power: Optional[int] = None
    castle_level: Optional[int] = None
    rank: Optional[str] = None


class BatchCreateBody(BaseModel):
    members: list[BatchCreateMemberInput]


def _normalize_telegram_username(raw: Optional[str]) -> Optional[str]:
    """Strip leading @ and whitespace; empty → None. Case preserved for display."""
    if raw is None:
        return None
    s = str(raw).strip().lstrip("@").strip()
    return s or None


@api_router.post("/members")
async def create_member(body: MemberCreate, _: dict = Depends(require_edit)):
    payload = body.model_dump()
    # Auto-resolve/canonicalise alliance. Strip [TAG] wrappers and match existing casing.
    payload["alliance_name"] = await find_or_create_alliance(payload.get("alliance_name"))
    # If admin left alliance blank but the name has "[TAG] ...", extract it.
    if not payload["alliance_name"]:
        tag, clean = _split_alliance_from_name(payload.get("name") or "")
        if tag:
            payload["alliance_name"] = await find_or_create_alliance(tag)
            payload["name"] = clean
    payload["telegram_username"] = _normalize_telegram_username(payload.get("telegram_username"))
    m = Member(**payload)
    await db.members.insert_one(m.model_dump())
    return m.model_dump()


@api_router.post("/members/batch-create")
async def batch_create_members(body: BatchCreateBody, _: dict = Depends(require_edit)):
    """Bulk-create members with automatic alliance resolution / creation.

    For each entry: strip `[TAG]` from name, resolve alliance case-insensitively
    against existing members, upsert on normalised name (existing member with the
    same case-insensitive name → skip create, keep existing).
    Returns per-status counts + created alliance names.
    """
    existing_members = await db.members.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(20000)
    # Case-SENSITIVE member key: "Ecem" and "ecem" are treated as distinct members
    # (parallels the case-sensitive alliance policy: GOW vs GoW vs GOw).
    by_name = {(x.get("name") or "").strip(): x for x in existing_members}
    existing_alliances_lc = {
        str(a).lower() for a in await db.members.distinct("alliance_name") if a
    }

    created_members = 0
    existing_hits = 0
    new_alliances: list[str] = []
    docs_to_insert: list[dict] = []
    report: list[dict] = []

    for row in body.members:
        raw_name = (row.name or "").strip()
        if not raw_name:
            continue
        tag_from_bracket, clean_name = _split_alliance_from_name(raw_name)
        # Explicit alliance_tag prop wins over the one embedded in the name.
        alliance_tag = (row.alliance_tag or "").strip() or tag_from_bracket
        canonical_alliance = await find_or_create_alliance(alliance_tag) if alliance_tag else None
        # Track brand-new alliances for the response summary.
        if canonical_alliance and canonical_alliance.lower() not in existing_alliances_lc:
            if canonical_alliance not in new_alliances:
                new_alliances.append(canonical_alliance)
            existing_alliances_lc.add(canonical_alliance.lower())

        key = clean_name  # case-sensitive; see by_name construction above
        if key in by_name:
            existing_hits += 1
            report.append({"name": clean_name, "alliance": canonical_alliance, "status": "existing"})
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "name": clean_name,
            "rank": (row.rank if row.rank in ("R1", "R2", "R3", "R4", "R5") else "R1"),
            "alliance_name": canonical_alliance or "",
            "bireysel_guc": int(row.power) if row.power and row.power > 0 else 0,
            "castle_level": int(row.castle_level) if row.castle_level and row.castle_level > 0 else 0,
        }
        docs_to_insert.append(doc)
        by_name[key] = doc
        created_members += 1
        report.append({"name": clean_name, "alliance": canonical_alliance, "status": "new"})

    if docs_to_insert:
        await db.members.insert_many(docs_to_insert)
    return {
        "created": created_members,
        "existing": existing_hits,
        "new_alliances": new_alliances,
        "report": report,
    }


@api_router.patch("/members/{member_id}")
async def update_member(member_id: str, body: MemberUpdate, user: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    # Allow explicit clearing of telegram_username by passing empty string.
    raw = body.model_dump(exclude_unset=True)
    if "telegram_username" in raw:
        update["telegram_username"] = _normalize_telegram_username(raw["telegram_username"])
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    # Read the "before" doc so we can log field-level deltas — powers the
    # per-member audit trail visible in the profile dialog.
    before = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Üye bulunamadı")
    await db.members.update_one({"id": member_id}, {"$set": update})
    await _record_member_changes(member_id, before, update, user)
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


# Fields worth auditing. Note-related edits are noisy; skipped intentionally.
_AUDITED_MEMBER_FIELDS = {"rank", "alliance_name", "alliance_category", "country", "castle_level", "name", "telegram_username"}


async def _record_member_changes(member_id: str, before: dict, update: dict, user: dict):
    """Append per-field entries to ``member_changes`` for any audited field diff."""
    who = user.get("username") or user.get("id") or "?"
    now = now_iso()
    entries = []
    for k, new_v in update.items():
        if k not in _AUDITED_MEMBER_FIELDS:
            continue
        old_v = before.get(k)
        if old_v == new_v:
            continue
        entries.append({
            "id": str(uuid.uuid4()),
            "member_id": member_id,
            "field": k,
            "old_value": old_v,
            "new_value": new_v,
            "changed_at": now,
            "changed_by": who,
        })
    if entries:
        await db.member_changes.insert_many(entries)


@api_router.get("/members/{member_id}/changes")
async def list_member_changes(member_id: str, limit: int = 50):
    """Return chronological audit entries (newest first) for a member."""
    limit = max(1, min(int(limit or 50), 500))
    docs = await db.member_changes.find(
        {"member_id": member_id}, {"_id": 0}
    ).sort("changed_at", -1).to_list(limit)
    return docs


class BulkCountryBody(BaseModel):
    member_ids: List[str]
    country: Optional[str] = None  # ISO 3166-1 alpha-2 uppercase; null/empty = clear


@api_router.post("/members/bulk-country")
async def bulk_set_country(body: BulkCountryBody, user: dict = Depends(require_edit)):
    """Bulk-assign (or clear) the ``country`` field on many members at once.

    - Empty / null country clears the field on the selected members.
    - Any non-empty country is uppercased before persisting so ISO2 stays canonical.
    """
    ids = [i for i in (body.member_ids or []) if i]
    if not ids:
        raise HTTPException(400, "Üye seçilmedi")
    country = (body.country or "").strip().upper() or None
    if country and len(country) != 2:
        raise HTTPException(400, "country ISO 3166-1 alpha-2 (2 harfli) olmalı")
    # Snapshot for audit before bulk update.
    before_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "country": 1}).to_list(len(ids))
    before_map = {d["id"]: d for d in before_docs}
    update_op = {"$set": {"country": country}} if country else {"$unset": {"country": ""}}
    res = await db.members.update_many({"id": {"$in": ids}}, update_op)
    for mid in ids:
        await _record_member_changes(mid, before_map.get(mid, {}), {"country": country}, user)
    return {"matched": res.matched_count, "modified": res.modified_count, "country": country}


class BulkRankBody(BaseModel):
    member_ids: List[str]
    rank: str  # one of R1..R5


_VALID_RANKS = {"R1", "R2", "R3", "R4", "R5"}


@api_router.post("/members/bulk-rank")
async def bulk_set_rank(body: BulkRankBody, user: dict = Depends(require_edit)):
    """Bulk-assign a rank (R1..R5) to many members at once."""
    ids = [i for i in (body.member_ids or []) if i]
    if not ids:
        raise HTTPException(400, "Üye seçilmedi")
    rank = (body.rank or "").strip().upper()
    if rank not in _VALID_RANKS:
        raise HTTPException(400, f"rank must be one of {sorted(_VALID_RANKS)}")
    before_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "rank": 1}).to_list(len(ids))
    before_map = {d["id"]: d for d in before_docs}
    res = await db.members.update_many({"id": {"$in": ids}}, {"$set": {"rank": rank}})
    for mid in ids:
        await _record_member_changes(mid, before_map.get(mid, {}), {"rank": rank}, user)
    return {"matched": res.matched_count, "modified": res.modified_count, "rank": rank}


@api_router.delete("/members/{member_id}")
async def delete_member(member_id: str, _: dict = Depends(require_edit)):
    res = await db.members.delete_one({"id": member_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Üye bulunamadı")
    await db.points.delete_many({"member_id": member_id})
    return {"ok": True}


# ---------- Events ----------
@api_router.get("/events")
async def list_events(archived: Optional[bool] = None):
    query = {}
    if archived is not None:
        query["archived"] = archived
    docs = await db.events.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return docs


@api_router.post("/events")
async def create_event(body: EventCreate, _: dict = Depends(require_edit)):
    # If no group_name provided, fall back to the event name so the event
    # gets its own chip on the leaderboard instead of being pooled into
    # "Özel Zaman" with every other untitled event.
    payload = body.model_dump()
    gn = (payload.get("group_name") or "").strip()
    if not gn:
        payload["group_name"] = (payload.get("name") or "").strip() or "Özel Zaman"
    # Pop the recurrence knobs off before we turn the payload into an Event —
    # we generate concrete duplicates below rather than storing a rule.
    interval = (payload.pop("recurrence_interval", None) or "none")
    count = max(1, min(52, int(payload.pop("recurrence_count", 1) or 1)))
    # If we're spawning multiple events, stamp them with a shared series_id
    # so admins can later bulk-edit or delete the entire series in one call.
    series_id = str(uuid.uuid4()) if (interval != "none" and count > 1) else None
    if series_id:
        payload["series_id"] = series_id
    e = Event(**payload)
    created = [e]
    if interval != "none" and count > 1:
        from datetime import datetime as _dt, timedelta as _td
        try:
            base_dt = _dt.fromisoformat(str(payload.get("date")).replace("Z", "+00:00"))
        except Exception:
            base_dt = None
        step_days = {"2days": 2, "weekly": 7, "2weekly": 14}.get(interval)
        step_months = 1 if interval == "monthly" else 0
        if base_dt is not None and (step_days or step_months):
            for i in range(1, count):
                if step_days:
                    next_dt = base_dt + _td(days=step_days * i)
                else:  # monthly — simple month bump preserving day, clamped
                    y = base_dt.year + ((base_dt.month - 1 + i) // 12)
                    m = ((base_dt.month - 1 + i) % 12) + 1
                    from calendar import monthrange
                    d = min(base_dt.day, monthrange(y, m)[1])
                    next_dt = base_dt.replace(year=y, month=m, day=d)
                dup_payload = {**payload, "date": next_dt.isoformat()}
                created.append(Event(**dup_payload))
    docs = [ev.model_dump() for ev in created]
    if len(docs) == 1:
        await db.events.insert_one(docs[0])
    else:
        await db.events.insert_many(docs)
    # Activity feed log (parent only)
    try:
        await db.activity_log.insert_one({
            "id": uuid.uuid4().hex,
            "member_id": e.id,
            "member_name": e.name,
            "action_type": "event_join",
            "details": (
                f"'{e.name}' etkinliği oluşturuldu"
                if len(docs) == 1
                else f"'{e.name}' × {len(docs)} tekrar ({interval}) oluşturuldu"
            ),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "device": "desktop",
        })
    except Exception:
        pass
    # Fire-and-forget push notification (parent event only — burst suppressed)
    try:
        fn = globals().get("_broadcast_push")
        if fn:
            await fn(title="Yeni Etkinlik", body=e.name, url="/etkinlikler", tag=f"event-{e.id}", group_name=e.group_name)
    except Exception as ex:
        logger.warning(f"Push broadcast failed: {ex}")
    # Fire-and-forget Telegram channel broadcast (no-op if TELEGRAM_CHANNEL_ID unset)
    try:
        await send_event_notification(
            event_name=e.name,
            event_date=(e.date or ""),
            group_name=e.group_name or "",
            multiplier=e.multiplier or 1.0,
            event_id=e.id,
        )
    except Exception as ex:
        logger.warning(f"Telegram event broadcast failed: {ex}")
    return {**e.model_dump(), "recurrence_created": len(docs)}


@api_router.patch("/events/{event_id}")
async def update_event(event_id: str, body: EventUpdate, _: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    # Recurrence fields are handled separately below; strip before the $set.
    interval = update.pop("recurrence_interval", None) or "none"
    count = max(1, min(52, int(update.pop("recurrence_count", 1) or 1)))
    if update:
        res = await db.events.update_one({"id": event_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Etkinlik bulunamadı")
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Etkinlik bulunamadı")
    # If recurrence knobs were passed with count > 1, spawn N-1 future
    # copies starting AFTER the current event date. Existing points and
    # metadata on the current event stay untouched.
    spawned = 0
    if interval != "none" and count > 1:
        from datetime import datetime as _dt, timedelta as _td
        try:
            base_dt = _dt.fromisoformat(str(doc.get("date")).replace("Z", "+00:00"))
        except Exception:
            base_dt = None
        step_days = {"2days": 2, "weekly": 7, "2weekly": 14}.get(interval)
        step_months = 1 if interval == "monthly" else 0
        if base_dt is not None and (step_days or step_months):
            dup_payload_base = {k: doc.get(k) for k in (
                "name", "group_name", "multiplier", "subtitle",
                "banner_url", "archived", "reminder_enabled",
            )}
            new_docs = []
            for i in range(1, count):
                if step_days:
                    next_dt = base_dt + _td(days=step_days * i)
                else:
                    y = base_dt.year + ((base_dt.month - 1 + i) // 12)
                    m = ((base_dt.month - 1 + i) % 12) + 1
                    from calendar import monthrange
                    d = min(base_dt.day, monthrange(y, m)[1])
                    next_dt = base_dt.replace(year=y, month=m, day=d)
                new_docs.append(Event(**{**dup_payload_base, "date": next_dt.isoformat()}).model_dump())
            if new_docs:
                await db.events.insert_many(new_docs)
                spawned = len(new_docs)
    return {**doc, "recurrence_created": spawned}


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, _: dict = Depends(require_edit)):
    # Cascade: remove any point records tied to this event before deleting the event doc.
    # Prevents orphan points and matches the behaviour of /events/group/{name}.
    pts_res = await db.points.delete_many({"event_id": event_id})
    res = await db.events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Etkinlik bulunamadı")
    return {"ok": True, "points_deleted": pts_res.deleted_count}


class BulkVisibilityBody(BaseModel):
    ids: List[str]
    hidden: bool


class BulkArchiveBody(BaseModel):
    ids: List[str]
    archived: bool


@api_router.post("/events/bulk-visibility")
async def events_bulk_visibility(body: BulkVisibilityBody, _: dict = Depends(require_edit)):
    """Toggle `hidden_from_leaderboard` on many events at once. Used by the
    Events list bulk-selection toolbar so admins can hide a whole batch of
    practice / draft events without touching each one individually."""
    ids = [i for i in (body.ids or []) if i]
    if not ids:
        return {"modified": 0}
    res = await db.events.update_many(
        {"id": {"$in": ids}},
        {"$set": {"hidden_from_leaderboard": bool(body.hidden)}},
    )
    return {"modified": res.modified_count, "hidden": bool(body.hidden)}


@api_router.post("/events/bulk-archive")
async def events_bulk_archive(body: BulkArchiveBody, _: dict = Depends(require_edit)):
    """Toggle `archived` on many events in a single update_many call.
    Powers the "Arşive Al / Arşivden Çıkar" bulk actions in the Events
    selection toolbar so admins can retire an entire season / group with
    one click. Points remain untouched (they follow archive state via the
    leaderboard `scope` filter)."""
    ids = [i for i in (body.ids or []) if i]
    if not ids:
        return {"modified": 0}
    res = await db.events.update_many(
        {"id": {"$in": ids}},
        {"$set": {"archived": bool(body.archived)}},
    )
    return {"modified": res.modified_count, "archived": bool(body.archived)}


@api_router.post("/events/archive-group")
async def archive_group(group_name: str, _: dict = Depends(require_edit)):
    res = await db.events.update_many({"group_name": group_name, "archived": False}, {"$set": {"archived": True}})
    return {"modified": res.modified_count}


@api_router.post("/events/unarchive-group")
async def unarchive_group(group_name: str, _: dict = Depends(require_edit)):
    res = await db.events.update_many({"group_name": group_name, "archived": True}, {"$set": {"archived": False}})
    return {"modified": res.modified_count}


@api_router.post("/events/rename-group")
async def rename_group(old_name: str, new_name: str, _: dict = Depends(require_edit)):
    new_name = (new_name or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name cannot be empty")
    if new_name == old_name:
        return {"modified": 0}
    res = await db.events.update_many({"group_name": old_name}, {"$set": {"group_name": new_name}})
    return {"modified": res.modified_count, "new_name": new_name}


@api_router.delete("/events/group/{group_name}")
async def delete_group(group_name: str, _: dict = Depends(require_edit)):
    # Cascade: remove all points tied to any event in this group, then remove the events themselves.
    events = await db.events.find({"group_name": group_name}, {"_id": 0, "id": 1}).to_list(2000)
    event_ids = [e["id"] for e in events]
    points_deleted = 0
    if event_ids:
        pr = await db.points.delete_many({"event_id": {"$in": event_ids}})
        points_deleted = pr.deleted_count
    er = await db.events.delete_many({"group_name": group_name})
    return {"events_deleted": er.deleted_count, "points_deleted": points_deleted}


# ---------- Points ----------
@api_router.get("/points")
async def list_points(search: Optional[str] = None, limit: int = 1000):
    docs = await db.points.find({}, {"_id": 0}).sort("date", -1).to_list(limit)
    await enrich_points_batch(docs)
    if search:
        s = search.lower()
        docs = [d for d in docs if s in (d.get("member_name") or "").lower() or s in (d.get("event_name") or "").lower() or s in (d.get("note") or "").lower()]
    return docs


@api_router.post("/points")
async def create_point(body: PointCreate, _: dict = Depends(require_edit)):
    p = Point(**body.model_dump())
    doc = p.model_dump()
    await enrich_point(doc)
    await db.points.insert_one(doc)
    doc.pop("_id", None)
    # Activity feed log
    try:
        await db.activity_log.insert_one({
            "id": uuid.uuid4().hex,
            "member_id": doc.get("member_id"),
            "member_name": doc.get("member_name", "?"),
            "action_type": "score_update",
            "details": f"+{doc.get('points', 0)} puan aldı",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "device": "desktop",
        })
    except Exception:
        pass
    return doc


@api_router.post("/points/bulk")
async def bulk_points(body: BulkPointCreate, _: dict = Depends(require_edit)):
    docs_to_insert = []
    for mid in body.member_ids:
        p = Point(
            member_id=mid,
            event_id=body.event_id,
            points=body.points,
            multiplier=body.multiplier or 1.0,
            note=body.note,
        )
        docs_to_insert.append(p.model_dump())
    await enrich_points_batch(docs_to_insert)
    if docs_to_insert:
        await db.points.insert_many(docs_to_insert)
    for d in docs_to_insert:
        d.pop("_id", None)
    return {"created": len(docs_to_insert), "points": docs_to_insert}


@api_router.delete("/points/{point_id}")
async def delete_point(point_id: str, _: dict = Depends(require_edit)):
    res = await db.points.delete_one({"id": point_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Puan kaydı bulunamadı")
    return {"ok": True}


@api_router.patch("/points/{point_id}")
async def update_point(point_id: str, body: PointUpdate, _: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    # If event_id changed, refresh cached event_name
    if "event_id" in update:
        ev = await db.events.find_one({"id": update["event_id"]}, {"_id": 0, "name": 1})
        update["event_name"] = ev["name"] if ev else "Bilinmeyen"
    res = await db.points.update_one({"id": point_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Puan kaydı bulunamadı")
    doc = await db.points.find_one({"id": point_id}, {"_id": 0})
    return doc


@api_router.patch("/scores/{score_id}")
async def update_score(score_id: str, body: PointUpdate, _: dict = Depends(require_edit)):
    return await update_point(score_id, body, _)


# ---------- Scores (alias for Points - same underlying collection) ----------
@api_router.get("/scores")
async def list_scores(search: Optional[str] = None, limit: int = 1000):
    return await list_points(search=search, limit=limit)


@api_router.post("/scores")
async def create_score(body: PointCreate, _: dict = Depends(require_edit)):
    return await create_point(body, _)


@api_router.post("/scores/bulk")
async def bulk_scores(body: BulkPointCreate, _: dict = Depends(require_edit)):
    return await bulk_points(body, _)


@api_router.delete("/scores/{score_id}")
async def delete_score(score_id: str, _: dict = Depends(require_edit)):
    return await delete_point(score_id, _)


# ---------- Commanders ----------
@api_router.get("/commanders")
async def list_commanders(category: Optional[str] = None):
    query = {}
    if category:
        query["category"] = category
    docs = await db.commanders.find(query, {"_id": 0}).to_list(1000)
    return docs


@api_router.post("/commanders")
async def create_commander(body: CommanderCreate, _: dict = Depends(require_edit)):
    c = Commander(**body.model_dump())
    await db.commanders.insert_one(c.model_dump())
    return c.model_dump()


@api_router.patch("/commanders/{commander_id}")
async def update_commander(commander_id: str, body: CommanderUpdate, _: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    res = await db.commanders.update_one({"id": commander_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Komutan bulunamadı")
    doc = await db.commanders.find_one({"id": commander_id}, {"_id": 0})
    return doc


@api_router.delete("/commanders/{commander_id}")
async def delete_commander(commander_id: str, _: dict = Depends(require_edit)):
    res = await db.commanders.delete_one({"id": commander_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Komutan bulunamadı")
    return {"ok": True}


# ---------- Stats & Leaderboard ----------
@api_router.get("/stats")
async def get_stats():
    member_count = await db.members.count_documents({})
    event_count = await db.events.count_documents({"archived": False})
    pipeline = [
        {"$project": {"weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]}}},
        {"$group": {"_id": None, "total": {"$sum": "$weighted"}}},
    ]
    result = await db.points.aggregate(pipeline).to_list(1)
    total = int(result[0]["total"]) if result else 0
    avg = int(total / event_count) if event_count > 0 else 0
    power_pipe = [{"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$bireysel_guc", 0]}}}}]
    power_res = await db.members.aggregate(power_pipe).to_list(1)
    total_power = int(power_res[0]["total"]) if power_res else 0
    return {
        "member_count": member_count,
        "event_count": event_count,
        "total_points": total,
        "event_avg": avg,
        "total_power": total_power,
    }


@api_router.get("/leaderboard")
async def leaderboard(event_id: Optional[str] = None, group_name: Optional[str] = None, scope: Optional[str] = None):
    match_stage = {}
    if event_id:
        match_stage["event_id"] = event_id
    else:
        # `scope=hidden` inverts the normal filter — returns totals ONLY for
        # events explicitly flagged `hidden_from_leaderboard`. Powers the
        # "Gizli Etkinliklerdeki Puanlar" audit tab on the Leaderboard page.
        if scope == "hidden":
            event_query = {"hidden_from_leaderboard": True}
        else:
            # Default: exclude hidden events so ranked totals stay clean.
            event_query = {"hidden_from_leaderboard": {"$ne": True}}
        if group_name:
            event_query["group_name"] = group_name
        if scope in ("active", "archived"):
            event_query["archived"] = (scope == "archived")
        events = await db.events.find(event_query, {"_id": 0, "id": 1}).to_list(2000)
        match_stage["event_id"] = {"$in": [e["id"] for e in events]}
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$project": {"member_id": 1, "weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]}}},
        {"$group": {"_id": "$member_id", "total_points": {"$sum": "$weighted"}}},
        {"$sort": {"total_points": -1}},
        {"$limit": 500},
    ]
    agg = await db.points.aggregate(pipeline).to_list(500)
    member_ids = [r["_id"] for r in agg]
    members = await db.members.find({"id": {"$in": member_ids}}, {"_id": 0}).to_list(len(member_ids)) if member_ids else []
    m_by_id = {m["id"]: m for m in members}
    result = []
    for i, r in enumerate(agg):
        m = m_by_id.get(r["_id"])
        if not m:
            continue
        result.append({
            "member_id": r["_id"],
            "name": m["name"],
            "rank": m["rank"],
            "level": m.get("level", 1),
            "title": m.get("title"),
            "alliance_name": m.get("alliance_name"),
            "total_points": int(r["total_points"]),
            "position": i + 1,
        })
    return result


@api_router.get("/leaderboard/by-alliance")
async def leaderboard_by_alliance(event_id: Optional[str] = None, group_name: Optional[str] = None):
    """Return leaderboard entries grouped by alliance.
    - Alliance names are CASE-SENSITIVE (GOW, GoW, GOw are different groups).
    - Members with no alliance go into 'Gruplandırılamamış'.
    - Groups sorted: GOW → GoW → GOw → alphabetical → 'Gruplandırılamamış' last.
    """
    lb = await leaderboard(event_id=event_id, group_name=group_name)
    groups = {}
    for row in lb:
        raw = (row.get("alliance_name") or "").strip()
        key = raw if raw else "Gruplandırılamamış"
        row = {**row, "alliance_name": key}
        groups.setdefault(key, []).append(row)
    # Sort each group by points desc
    for arr in groups.values():
        arr.sort(key=lambda r: r["total_points"], reverse=True)
    # Sort groups: case-sensitive GOW → GoW → GOw priority, then alpha, Gruplandırılamamış last.
    ALLIANCE_PRIORITY = {"GOW": 0, "GoW": 1, "GOw": 2}
    def sort_key(name):
        if name == "Gruplandırılamamış":
            return (3, "")
        if name in ALLIANCE_PRIORITY:
            return (0, ALLIANCE_PRIORITY[name])
        return (2, name.lower())
    entries = [{"name": name, "members": groups[name], "total_points": sum(r["total_points"] for r in groups[name])}
               for name in sorted(groups.keys(), key=sort_key)]
    return entries


# ---------- Multiplier history ----------
@api_router.get("/multiplier-history")
async def multiplier_history():
    points = await db.points.find({}, {"_id": 0}).sort("date", -1).to_list(200)
    await enrich_points_batch(points)
    # Aggregate by multiplier
    by_mult = {}
    for p in points:
        m = str(p.get("multiplier", 1.0))
        by_mult.setdefault(m, []).append(p)
    return {"history": points, "grouped": by_mult}


# ---------- Export ----------
@api_router.get("/export/csv")
async def export_csv():
    lb = await leaderboard()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Sıra", "İsim", "Rütbe", "Seviye", "Ünvan", "Toplam Puan"])
    for r in lb:
        writer.writerow([r["position"], r["name"], r["rank"], r.get("level", ""), r.get("title", "") or "", r["total_points"]])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=siralama.csv"}
    )


@api_router.get("/export/xlsx")
async def export_xlsx():
    """Multi-sheet Excel report: Üye Listesi, Etkinlik Kayıtları, Sıralama Listesi, İttifak Sıralaması."""
    wb = openpyxl.Workbook()

    members = await db.members.find({}, {"_id": 0}).to_list(10000)
    points = await db.points.find({}, {"_id": 0}).sort("date", -1).to_list(100000)
    await enrich_points_batch(points)
    m_by_id = {m["id"]: m for m in members}

    # Alliance color map (from DB); fallback to deterministic palette so every alliance always has a color.
    color_docs = await db.alliance_colors.find({}, {"_id": 0}).to_list(500)
    custom_colors = {d["name"]: d["color"] for d in color_docs}

    PALETTE = ["2563EB", "16A34A", "7C3AED", "EA580C", "0891B2", "DB2777", "65A30D", "0D9488", "A16207", "4B5563"]
    GOW_HEX = "DC2626"

    def _norm(h):
        return (h or "").lstrip("#").upper()

    def hex_for(name):
        if not name or name == "-":
            return "6B7280"  # gray
        h = custom_colors.get(name)
        if h:
            return _norm(h)
        if name == "GOW":
            return GOW_HEX
        # deterministic hash → palette
        idx = 0
        for ch in name:
            idx = (idx * 31 + ord(ch)) & 0x7FFFFFFF
        return PALETTE[idx % len(PALETTE)]

    def blend_with_white(hex6, alpha):
        r = int(hex6[0:2], 16); g = int(hex6[2:4], 16); b = int(hex6[4:6], 16)
        rr = round(r + (255 - r) * (1 - alpha))
        gg = round(g + (255 - g) * (1 - alpha))
        bb = round(b + (255 - b) * (1 - alpha))
        return f"{rr:02X}{gg:02X}{bb:02X}"

    def contrast_text(hex6):
        r = int(hex6[0:2], 16); g = int(hex6[2:4], 16); b = int(hex6[4:6], 16)
        # perceived brightness
        y = (r * 299 + g * 587 + b * 114) / 1000
        return "000000" if y > 160 else "FFFFFF"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="DC2626")
    header_align = Alignment(horizontal="center", vertical="center")

    def make_sheet(name, columns):
        if wb.sheetnames == ["Sheet"]:
            ws = wb.active
            ws.title = name
        else:
            ws = wb.create_sheet(name)
        for i, c in enumerate(columns, 1):
            cell = ws.cell(row=1, column=i, value=c)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
        return ws

    def fmt_dual(f, t):
        f = f if f not in (None, "") else "-"
        t = t if t not in (None, "") else "-"
        return f"F{f} / T{t}"

    # Sheet 1: Üye Listesi — İttifak cell painted with full alliance color + contrasting text
    ws1 = make_sheet("Üye Listesi", ["İttifak", "Üye", "Rütbe", "ID", "Kale", "Tetikçi", "Bombacı", "Kalkanlı"])
    for i, m in enumerate(members, start=2):
        alliance = m.get("alliance_name") or ""
        ws1.cell(row=i, column=1, value=alliance)
        ws1.cell(row=i, column=2, value=m.get("name") or "")
        ws1.cell(row=i, column=3, value=m.get("rank") or "")
        ws1.cell(row=i, column=4, value=m.get("member_id") or "")
        ws1.cell(row=i, column=5, value=m.get("castle_level") or "")
        ws1.cell(row=i, column=6, value=fmt_dual(m.get("tetikci_f"), m.get("tetikci_t")))
        ws1.cell(row=i, column=7, value=fmt_dual(m.get("bombaci_f"), m.get("bombaci_t")))
        ws1.cell(row=i, column=8, value=fmt_dual(m.get("kalkanli_f"), m.get("kalkanli_t")))
        if alliance:
            c = hex_for(alliance)
            ac = ws1.cell(row=i, column=1)
            ac.fill = PatternFill("solid", fgColor=c)
            ac.font = Font(bold=True, color=contrast_text(c))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # Sheet 2: Etkinlik Kayıtları — soft alliance tint across the whole row
    ws2 = make_sheet("Etkinlik Kayıtları", ["Üye", "Rütbe", "Etkinlik", "Puan", "Not", "Tarih"])
    for i, p in enumerate(points, start=2):
        m = m_by_id.get(p["member_id"], {})
        ws2.cell(row=i, column=1, value=p.get("member_name") or m.get("name") or "")
        ws2.cell(row=i, column=2, value=m.get("rank") or "")
        ws2.cell(row=i, column=3, value=p.get("event_name") or "")
        pts = int(p["points"]) * float(p.get("multiplier", 1.0))
        ws2.cell(row=i, column=4, value=int(pts))
        ws2.cell(row=i, column=5, value=p.get("note") or "")
        try:
            dt = datetime.fromisoformat(str(p["date"]).replace("Z", "+00:00"))
            ws2.cell(row=i, column=6, value=dt.strftime("%d.%m.%Y %H:%M"))
        except Exception:
            ws2.cell(row=i, column=6, value=str(p.get("date") or ""))
        alliance = m.get("alliance_name")
        if alliance:
            soft = blend_with_white(hex_for(alliance), 0.22)
            row_fill = PatternFill("solid", fgColor=soft)
            for col in range(1, 7):
                ws2.cell(row=i, column=col).fill = row_fill

    # Sheet 3: Sıralama Listesi — soft alliance tint across the row, full color on Alliance cell.
    # Include ALL members (zero-point ones appended after scored) so col A always has a rank.
    lb = await leaderboard()
    scored_ids = {r["member_id"] for r in lb}
    full_lb = list(lb) + [
        {"member_id": m["id"], "name": m.get("name") or "", "rank": m.get("rank") or "", "total_points": 0}
        for m in members if m["id"] not in scored_ids
    ]
    ws3 = make_sheet("Sıralama Listesi", ["Sıra", "Üye", "Rütbe", "İttifak", "Puan"])
    for idx, r in enumerate(full_lb, start=1):
        i = idx + 1
        m = m_by_id.get(r["member_id"], {})
        alliance = m.get("alliance_name") or ""
        ws3.cell(row=i, column=1, value=idx)
        ws3.cell(row=i, column=2, value=r["name"])
        ws3.cell(row=i, column=3, value=r["rank"])
        ws3.cell(row=i, column=4, value=alliance)
        ws3.cell(row=i, column=5, value=r["total_points"])
        if alliance:
            full = hex_for(alliance)
            soft = blend_with_white(full, 0.22)
            row_fill = PatternFill("solid", fgColor=soft)
            for col in range(1, 6):
                ws3.cell(row=i, column=col).fill = row_fill
            ac = ws3.cell(row=i, column=4)
            ac.fill = PatternFill("solid", fgColor=full)
            ac.font = Font(bold=True, color=contrast_text(full))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # Sheet 4: İttifak Sıralaması — İttifak cell = full color, rest of row = soft tint
    alliance_stats = defaultdict(lambda: {"members": 0, "points": 0})
    for m in members:
        alliance = m.get("alliance_name") or "-"
        alliance_stats[alliance]["members"] += 1
    for r in lb:
        m = m_by_id.get(r["member_id"], {})
        alliance = m.get("alliance_name") or "-"
        alliance_stats[alliance]["points"] += r["total_points"]
    alliance_ranked = sorted(alliance_stats.items(), key=lambda x: x[1]["points"], reverse=True)
    ws4 = make_sheet("İttifak Sıralaması", ["Sıra", "İttifak", "Üye Sayısı", "Puan"])
    for i, (name, stats) in enumerate(alliance_ranked, start=2):
        ws4.cell(row=i, column=1, value=i - 1)
        ws4.cell(row=i, column=2, value=name)
        ws4.cell(row=i, column=3, value=stats["members"])
        ws4.cell(row=i, column=4, value=stats["points"])
        if name and name != "-":
            full = hex_for(name)
            soft = blend_with_white(full, 0.22)
            row_fill = PatternFill("solid", fgColor=soft)
            for col in range(1, 5):
                ws4.cell(row=i, column=col).fill = row_fill
            ac = ws4.cell(row=i, column=2)
            ac.fill = PatternFill("solid", fgColor=full)
            ac.font = Font(bold=True, color=contrast_text(full))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # AutoFilter on all sheets covering the full data range
    for ws in wb.worksheets:
        last_col = ws.max_column
        last_row = ws.max_row
        if last_col > 0 and last_row >= 1:
            ws.auto_filter.ref = f"A1:{ws.cell(row=last_row, column=last_col).coordinate}"
        # Freeze the header row
        ws.freeze_panes = "A2"

    # Auto-size columns
    for ws in wb.worksheets:
        for col in ws.columns:
            max_len = max((len(str(c.value or "")) for c in col), default=10)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    filename = f"detayli_rapor_{today}.xlsx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ---------- Groups (for filter chips) ----------
@api_router.get("/event-groups")
async def event_groups(active_only: bool = False):
    pipeline = [{"$group": {"_id": "$group_name", "count": {"$sum": 1}, "active": {"$sum": {"$cond": [{"$eq": ["$archived", False]}, 1, 0]}}}}]
    groups = await db.events.aggregate(pipeline).to_list(100)
    # Events without a group_name (None or "") are surfaced under the
    # "Özel Zaman" (Custom Time) label so the chip is never nameless.
    result = []
    for g in groups:
        name = g["_id"]
        if not name:  # None or empty string
            name = "Özel Zaman"
        result.append({"name": name, "count": g["count"], "active": g["active"]})
    if active_only:
        result = [g for g in result if g["active"] > 0]
    result.sort(key=lambda g: (g.get("name") or "").lower())
    return result


# ---------- Alliance Colors ----------
class AllianceColor(BaseModel):
    name: str
    color: str  # hex like "#DC2626"


@api_router.get("/alliance-colors")
async def list_alliance_colors():
    docs = await db.alliance_colors.find({}, {"_id": 0}).to_list(500)
    return {d["name"]: d["color"] for d in docs}


@api_router.put("/alliance-colors")
async def upsert_alliance_color(body: AllianceColor, _: dict = Depends(require_edit)):
    name = (body.name or "").strip()
    color = (body.color or "").strip()
    if not name:
        raise HTTPException(400, "Alliance name required")
    if not color.startswith("#") or len(color) not in (4, 7):
        raise HTTPException(400, "Color must be hex like #RRGGBB or #RGB")
    await db.alliance_colors.update_one(
        {"name": name},
        {"$set": {"name": name, "color": color, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"name": name, "color": color}


@api_router.delete("/alliance-colors/{name}")
async def delete_alliance_color(name: str, _: dict = Depends(require_edit)):
    await db.alliance_colors.delete_one({"name": name})
    return {"deleted": True}


# ---------- Seed ----------
ALLIANCES = ["SvS Loncası", "Kartallar", "Bozkurtlar", "Prestige", "Osmanlı Torunu", "Ejderha Klanı"]


TURKISH_NAMES = [
    "Selenay", "oOoHavan4oOo", "Grumpy Deanerys", "Vanya", "pasha", "Ayşe Han", "Mehmet Fatih",
    "Kral Aslan", "Kraliçe Melisa", "Barbaros", "Alparslan", "Timur", "Cengiz Han", "Attila",
    "Fatih Sultan", "Yavuz Selim", "Kanuni", "Osman Bey", "Orhan Gazi", "Murat Han",
    "Bayezid", "Süleyman", "İskender", "Selahattin", "Kılıçarslan", "Tuğrul Bey", "Alp Er Tunga",
    "Bilge Kağan", "Mete Han", "Oğuz Kağan", "Şah Melik", "Hun Han", "Göktürk", "Uygur",
    "Karakhan", "Selçuk", "Sinan Paşa", "Hızır Reis", "Turgut Reis", "Piri Reis", "Kemal Reis",
    "Barbaros Hayrettin", "Uluç Ali", "Salih Reis", "Kaptan Paşa", "Yaman", "Ejder", "Şahin",
    "Kartal", "Bozkurt", "Aslan Han", "Kaplan Bey", "Pars", "Doğan", "Atmaca", "Zümrüd",
    "Semerkand", "Buhara", "Taşkent", "Kaşgar", "Turfan", "Kabil", "Bağdat", "Şam",
    "Kudüs", "Kahire", "İstanbul", "Bursa", "Edirne", "Konya", "Sivas", "Erzurum",
    "Van", "Diyarbakır", "Trabzon", "Antep", "Urfa", "Adana", "Mersin", "Antalya",
    "İzmir", "Manisa", "Muğla", "Ankara", "Kayseri", "Malatya", "Elazığ", "Bitlis",
    "Kars", "Ardahan", "Iğdır", "Ağrı", "Muş", "Bingöl", "Tunceli", "Erzincan",
    "Gümüşhane", "Bayburt", "Rize", "Artvin", "Ordu", "Giresun", "Samsun", "Sinop",
    "Kastamonu", "Bartın", "Zonguldak", "Karabük", "Çankırı", "Çorum", "Amasya", "Tokat",
    "Yozgat", "Kırşehir", "Kırıkkale", "Aksaray", "Niğde", "Nevşehir", "Karaman", "Isparta",
    "Burdur", "Denizli", "Aydın", "Uşak", "Afyon", "Kütahya", "Bilecik", "Bolu",
    "Düzce", "Sakarya", "Kocaeli", "Yalova", "Tekirdağ", "Edirne2", "Kırklareli", "Balıkesir",
    "Çanakkale", "Batman", "Şırnak", "Hakkari", "Mardin", "Siirt", "Bitlis2", "Kilis",
    "Osmaniye", "Hatay", "K.Maraş", "Gaziantep", "Adıyaman", "Şanlıurfa", "Diyarbakır2", "Ercan",
    "Volkan", "Emre", "Kaan", "Berk", "Baran", "Ege", "Deniz",
]


@api_router.post("/seed")
async def seed_data(force: bool = False, _: dict = Depends(require_admin)):
    """Populate DB with initial data. If force=True, wipes existing."""
    if force:
        await db.members.delete_many({})
        await db.events.delete_many({})
        await db.points.delete_many({})
        await db.commanders.delete_many({})

    existing = await db.members.count_documents({})
    if existing > 0 and not force:
        return {"status": "already_seeded", "members": existing}

    # --- Members: 156 total, split by rank ---
    rank_distribution = [
        ("GOW", 94, ["Kral", "Kraliçe", "Efsane", "Sultan", "Han"]),
        ("R5", 1, ["Baş Komutan"]),
        ("R4", 8, ["General", "Paşa"]),
        ("R3", 20, ["Kaptan", "Binbaşı"]),
        ("R2", 18, ["Yüzbaşı", "Onbaşı"]),
        ("R1", 15, ["Er", "Yeni Üye"]),
    ]

    members_by_id = {}
    idx = 0
    for rank, count, titles in rank_distribution:
        for i in range(count):
            name = TURKISH_NAMES[idx % len(TURKISH_NAMES)]
            if idx >= len(TURKISH_NAMES):
                name = f"{name}{idx}"
            m = Member(
                name=name,
                member_id=str(random.randint(100000000, 999999999)),
                rank=rank,
                title=random.choice(titles) if random.random() > 0.4 else None,
                level=random.randint(25, 60),
            )
            await db.members.insert_one(m.model_dump())
            members_by_id[m.id] = m
            idx += 1

    # --- Events: 6 active + 8 archived ---
    active_events = [
        ("Pre 1.Gün", "1. Gün Lütfen Katılın", 1.0),
        ("Pre 2.Gün", "2. Gün Radar Etkinliği", 1.0),
        ("Pre 3.Gün", "3. Gün Kaynak Toplama", 1.5),
        ("Pre 4.Gün", "4. Gün Hero Etkinliği", 2.0),
        ("Pre 5.Gün", "5. Gün Kalkanlı Savaş", 2.0),
        ("Pre 6.Gün", "6. Gün Final Savaşı", 3.0),
    ]
    archived_events = [
        ("SvS 1.Gün", "Geçmiş SvS 1", 1.0),
        ("SvS 2.Gün", "Geçmiş SvS 2", 1.0),
        ("SvS 3.Gün", "Geçmiş SvS 3", 1.5),
        ("SvS 4.Gün", "Geçmiş SvS 4", 2.0),
        ("SvS 5.Gün", "Geçmiş SvS 5", 2.0),
        ("SvS 6.Gün", "Geçmiş SvS 6", 3.0),
        ("KE Etkinliği", "Kafes Etkinliği", 1.5),
        ("Garnizon Savunma", "Garnizon Etkinliği", 1.0),
    ]

    events = []
    base_date = datetime(2026, 2, 20, tzinfo=timezone.utc)
    for i, (name, sub, mult) in enumerate(active_events):
        e = Event(
            name=name,
            group_name="SvS vs 10007",
            multiplier=mult,
            date=(base_date + timedelta(days=i)).isoformat(),
            subtitle=sub,
            archived=False,
        )
        await db.events.insert_one(e.model_dump())
        events.append(e)
    for i, (name, sub, mult) in enumerate(archived_events):
        e = Event(
            name=name,
            group_name="SvS vs 10007",
            multiplier=mult,
            date=(base_date - timedelta(days=30 + i)).isoformat(),
            subtitle=sub,
            archived=True,
        )
        await db.events.insert_one(e.model_dump())
        events.append(e)

    # --- Points: seed realistic distribution ---
    members_list = list(members_by_id.values())
    active_events_list = [e for e in events if not e.archived]

    for event in events:
        # Top members get more points
        sorted_members = sorted(members_list, key=lambda m: (0 if m.rank == "GOW" else 1, random.random()))
        for i, m in enumerate(sorted_members[:80]):  # Not everyone plays every event
            base = random.randint(50_000_000, 500_000_000) if m.rank == "GOW" else random.randint(1_000_000, 100_000_000)
            # Give top 3 huge boosts
            if event.archived:
                base = base // 2
            pts = base
            p = Point(
                member_id=m.id,
                member_name=m.name,
                event_id=event.id,
                event_name=event.name,
                points=pts,
                multiplier=event.multiplier,
                note=f"{event.name} kayıt",
                date=(datetime.fromisoformat(event.date) + timedelta(hours=random.randint(0, 20))).isoformat(),
            )
            await db.points.insert_one(p.model_dump())

    # --- Commanders ---
    commanders_seed = [
        {"name": "Mai Shiranui", "category": "tetikci", "characters": ["Mai Shiranui"], "description": "Uzak menzil hasar komutanı", "image_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&h=400&fit=crop"},
        {"name": "Omega Rugal", "category": "tetikci", "characters": ["Omega Rugal"], "description": "Elite saldırı komutanı", "image_url": "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400&h=400&fit=crop"},
        {"name": "Terry Bogard", "category": "bombaci", "characters": ["Terry Bogard"], "description": "Patlayıcı hasar uzmanı", "image_url": "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400&h=400&fit=crop"},
        {"name": "Kyo Kusanagi", "category": "bombaci", "characters": ["Kyo Kusanagi"], "description": "Ateş patlaması komutanı", "image_url": "https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?w=400&h=400&fit=crop"},
        {"name": "Iori Yagami", "category": "kalkanli", "characters": ["Iori Yagami"], "description": "Savunma odaklı komutan", "image_url": "https://images.unsplash.com/photo-1580327344181-c1163234e5a0?w=400&h=400&fit=crop"},
        {"name": "K' Dash", "category": "robotlar", "characters": ["K' Dash"], "description": "Robot desteği komutanı", "image_url": "https://images.unsplash.com/photo-1535223289827-42f1e9919769?w=400&h=400&fit=crop"},
        {"name": "Ana Ralli Lideri", "category": "kafes_ana_ralli", "characters": ["Selenay"], "description": "Ana ralli ekip lideri", "image_url": "https://images.unsplash.com/photo-1519669556878-63bdad8a1a49?w=400&h=400&fit=crop"},
        {"name": "İkinci Ralli", "category": "kafes_diger_ralli", "characters": ["Havan"], "description": "İkincil ralli ekibi", "image_url": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400&h=400&fit=crop"},
        {"name": "Garnizon 1", "category": "garnizon", "characters": ["Grumpy"], "description": "Ana garnizon komutanı", "image_url": "https://images.unsplash.com/photo-1548484352-ea579e5233a8?w=400&h=400&fit=crop"},
        {"name": "Solo Saldırı Alfa", "category": "savas_solo", "characters": ["Vanya"], "description": "Solo saldırı ekibi lideri", "image_url": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&h=400&fit=crop"},
        {"name": "Ralli Bravo", "category": "savas_ralli", "characters": ["Ercan", "Volkan"], "description": "Ralli savaş ekibi", "image_url": "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400&h=400&fit=crop"},
        {"name": "Ana Kale Komutanı", "category": "svs_ana_kale", "characters": ["Selenay"], "description": "Supreme Kale komutanı", "image_url": "https://images.unsplash.com/photo-1560253023-3ec5085ef0a3?w=400&h=400&fit=crop"},
        {"name": "Taret 1", "category": "svs_taret", "characters": ["Kaan"], "description": "Taret ekibi 1", "image_url": "https://images.unsplash.com/photo-1601987177651-8edfe6c20009?w=400&h=400&fit=crop"},
        {"name": "Genel Bilgi", "category": "bilgilendirme", "characters": [], "description": "SvS kuralları ve genel bilgilendirme dokümanı"},
    ]

    for c in commanders_seed:
        commander = Commander(**c)
        await db.commanders.insert_one(commander.model_dump())

    stats = {
        "members": await db.members.count_documents({}),
        "events": await db.events.count_documents({}),
        "points": await db.points.count_documents({}),
        "commanders": await db.commanders.count_documents({}),
    }
    return {"status": "seeded", **stats}


# ---------- Uploads ----------
UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB


@api_router.post("/upload")
async def upload_image(file: UploadFile = File(...), _: dict = Depends(require_edit)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMG_EXT:
        # try infer from content type
        guessed = mimetypes.guess_extension((file.content_type or "").split(";")[0]) or ""
        ext = guessed.lower() if guessed.lower() in ALLOWED_IMG_EXT else ""
        if not ext:
            raise HTTPException(400, f"Unsupported image type: {file.content_type or file.filename}")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)}MB)")
    if not contents:
        raise HTTPException(400, "Empty file")
    fname = f"{uuid.uuid4().hex}{ext}"
    dest = UPLOADS_DIR / fname
    with dest.open("wb") as f:
        f.write(contents)
    return {"url": f"/api/uploads/{fname}", "filename": fname, "size": len(contents)}


# ---------- Full DB export (3-sheet .xlsx) ----------
@api_router.get("/export/all")
async def export_all(_: dict = Depends(require_edit)):
    """Return an .xlsx with 3 sheets: Üyeler, Etkinlikler, Puanlar. Includes every field on each record."""
    from openpyxl import Workbook
    from io import BytesIO

    members = await db.members.find({}, {"_id": 0}).to_list(10000)
    events = await db.events.find({}, {"_id": 0}).to_list(2000)
    points = await db.points.find({}, {"_id": 0}).to_list(30000)
    alliance_colors_docs = await db.alliance_colors.find({}, {"_id": 0}).to_list(1000)
    await enrich_points_batch(points)

    # Compute per-member weighted total for a rollup column
    member_totals: Dict[str, float] = {}
    for p in points:
        mid = p.get("member_id")
        mult = float(p.get("multiplier") or 1.0)
        pts = float(p.get("points") or 0)
        if mid:
            member_totals[mid] = member_totals.get(mid, 0) + pts * mult

    alliance_color_map: Dict[str, str] = {}
    for ac in alliance_colors_docs:
        name = ac.get("name") or ac.get("alliance_name")
        color = ac.get("color") or ac.get("hex") or ac.get("value")
        if name and color:
            alliance_color_map[name] = color

    # Collect every unique key across all member docs so nothing is skipped
    m_base_cols = [
        "id", "name", "member_id", "alliance_name", "alliance_color",
        "rank", "title", "level", "castle_level",
        "tetikci_f", "tetikci_t", "bombaci_f", "bombaci_t", "kalkanli_f", "kalkanli_t",
        "bireysel_guc", "total_points",
        "note", "note_position", "note_color",
        "import_batch_id", "created_at",
    ]
    extra_m = sorted({k for m in members for k in m.keys()} - set(m_base_cols))
    m_cols = m_base_cols + extra_m

    e_base_cols = ["id", "name", "group_name", "subtitle", "multiplier", "date", "archived", "import_batch_id"]
    extra_e = sorted({k for e in events for k in e.keys()} - set(e_base_cols))
    e_cols = e_base_cols + extra_e

    p_base_cols = [
        "id", "member_id", "member_name", "member_rank",
        "event_id", "event_name", "event_multiplier",
        "points", "multiplier", "note", "date",
        "import_batch_id",
    ]
    extra_p = sorted({k for p in points for k in p.keys()} - set(p_base_cols))
    p_cols = p_base_cols + extra_p

    def cell(v):
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            import json as _json
            return _json.dumps(v, ensure_ascii=False)
        return v

    wb = Workbook()

    ws1 = wb.active
    ws1.title = "Üyeler"
    ws1.append(m_cols)
    for m in members:
        m_enriched = {**m}
        m_enriched.setdefault("alliance_color", alliance_color_map.get(m.get("alliance_name") or "", ""))
        m_enriched.setdefault("total_points", int(member_totals.get(m.get("id"), 0)))
        ws1.append([cell(m_enriched.get(c, "")) for c in m_cols])
    ws1.auto_filter.ref = ws1.dimensions

    ws2 = wb.create_sheet("Etkinlikler")
    ws2.append(e_cols)
    for e in events:
        ws2.append([cell(e.get(c, "")) for c in e_cols])
    ws2.auto_filter.ref = ws2.dimensions

    ws3 = wb.create_sheet("Puanlar")
    ws3.append(p_cols)
    for p in points:
        ws3.append([cell(p.get(c, "")) for c in p_cols])
    ws3.auto_filter.ref = ws3.dimensions

    # Sheet 4 (chart): Top 10 ittifaklar bar chart
    from openpyxl.chart import BarChart, Reference
    from openpyxl.chart.label import DataLabelList
    from openpyxl.styles import Font as _Font, PatternFill as _PatternFill, Alignment as _Alignment
    alliance_agg: Dict[str, float] = {}
    for m in members:
        a = m.get("alliance_name") or "-"
        tp = float(member_totals.get(m.get("id"), 0))
        alliance_agg[a] = alliance_agg.get(a, 0) + tp
    top10 = sorted(alliance_agg.items(), key=lambda x: x[1], reverse=True)[:10]
    ws4 = wb.create_sheet("İttifak Grafiği")
    ws4.append(["İttifak", "Toplam Puan"])
    ws4.cell(row=1, column=1).font = _Font(bold=True, color="FFFFFF")
    ws4.cell(row=1, column=2).font = _Font(bold=True, color="FFFFFF")
    header_fill = _PatternFill("solid", fgColor="E74C1A")
    ws4.cell(row=1, column=1).fill = header_fill
    ws4.cell(row=1, column=2).fill = header_fill
    for i, (a, pts) in enumerate(top10, start=2):
        ws4.cell(row=i, column=1, value=a)
        ws4.cell(row=i, column=2, value=int(pts))
    if top10:
        chart = BarChart()
        chart.type = "bar"
        chart.style = 11
        chart.title = "Top 10 İttifak — Toplam Puan"
        chart.y_axis.title = "İttifak"
        chart.x_axis.title = "Puan"
        data = Reference(ws4, min_col=2, min_row=1, max_row=1 + len(top10), max_col=2)
        cats = Reference(ws4, min_col=1, min_row=2, max_row=1 + len(top10))
        chart.add_data(data, titles_from_data=True)
        chart.set_categories(cats)
        chart.height = max(10, len(top10) * 1.2)
        chart.width = 22
        chart.dataLabels = DataLabelList(showVal=True)
        ws4.add_chart(chart, "D2")
    ws4.column_dimensions["A"].width = 24
    ws4.column_dimensions["B"].width = 16

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    from datetime import datetime as _dt
    fname = f"gow-export-{_dt.now().strftime('%Y%m%d-%H%M%S')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ---------- Full-DB Excel/CSV import (Üyeler / Etkinlikler / Puanlar) ----------
def _norm_sheet_name(s: str) -> str:
    tr = str(s or "").lower()
    tr = tr.replace("ı", "i").replace("ç", "c").replace("ş", "s").replace("ğ", "g").replace("ö", "o").replace("ü", "u")
    return tr.strip()


def _parse_int(v) -> int:
    if v is None:
        return 0
    s = str(v).replace(".", "").replace(",", "").replace(" ", "").strip()
    if not s or not s.lstrip("-").isdigit():
        return 0
    return int(s)


def _norm_key(s: str) -> str:
    """Normalize header names for alias matching: lowercase, strip Turkish accents,
    collapse whitespace/underscores/dashes to a single underscore."""
    if s is None:
        return ""
    tr = str(s).strip().lower()
    tr = (tr.replace("ı", "i").replace("İ", "i").replace("ç", "c").replace("Ç", "c")
             .replace("ş", "s").replace("Ş", "s").replace("ğ", "g").replace("Ğ", "g")
             .replace("ö", "o").replace("Ö", "o").replace("ü", "u").replace("Ü", "u"))
    import re as _re
    tr = _re.sub(r"[\s\-]+", "_", tr)
    tr = _re.sub(r"[^a-z0-9_]", "", tr)
    tr = _re.sub(r"_+", "_", tr).strip("_")
    return tr


def _normalize_row(row: dict) -> dict:
    return {_norm_key(k): v for k, v in row.items()}


def _pick(nrow: dict, *aliases, default=None):
    """Return first non-empty value across normalized alias keys."""
    for a in aliases:
        na = _norm_key(a)
        if na in nrow:
            v = nrow[na]
            if v is not None and str(v).strip() != "":
                return v
    return default


@api_router.post("/import/bulk")
async def import_bulk(
    file: UploadFile = File(...),
    dry_run: bool = Form(False),
    duplicate_mode: str = Form("skip"),
    _: dict = Depends(require_edit),
):
    """Import members/events/points from an .xlsx (3 sheets) or a single-purpose .csv."""
    from openpyxl import load_workbook
    from io import BytesIO
    import csv as csv_mod

    contents = await file.read()
    if not contents:
        raise HTTPException(400, "Boş dosya")
    ext = (file.filename or "").lower().rsplit(".", 1)[-1]

    sheets: Dict[str, List[dict]] = {}
    if ext == "xlsx":
        wb = load_workbook(BytesIO(contents), read_only=True, data_only=True)
        for sn in wb.sheetnames:
            ws = wb[sn]
            rows_iter = list(ws.iter_rows(values_only=True))
            if not rows_iter:
                continue
            headers = [str(h).strip() if h is not None else "" for h in rows_iter[0]]
            data = []
            for r in rows_iter[1:]:
                if all(c is None or c == "" for c in r):
                    continue
                data.append({headers[i]: r[i] for i in range(min(len(headers), len(r)))})
            sheets[sn.strip()] = data
    elif ext == "csv":
        text = contents.decode("utf-8-sig", errors="ignore")
        reader = csv_mod.DictReader(text.splitlines())
        rows = [dict(row) for row in reader]
        header_norm = {(h or "").lower() for h in (reader.fieldnames or [])}
        if any(h in header_norm for h in ("points", "puan", "score")):
            sheets["Puanlar"] = rows
        elif any(h in header_norm for h in ("multiplier", "çarpan", "carpan")):
            sheets["Etkinlikler"] = rows
        else:
            sheets["Üyeler"] = rows
    else:
        raise HTTPException(400, "Yalnızca .xlsx veya .csv desteklenir")

    member_rows, event_rows, point_rows = [], [], []
    for sn, rows in sheets.items():
        n = _norm_sheet_name(sn)
        if n in ("uyeler", "members", "uye"):
            member_rows = rows
        elif n in ("etkinlikler", "events", "etkinlik"):
            event_rows = rows
        elif n in ("puanlar", "puan ekle", "points", "puan"):
            point_rows = rows

    summary = {
        "members_found": len(member_rows),
        "events_found": len(event_rows),
        "points_found": len(point_rows),
    }

    if dry_run:
        return {"dry_run": True, **summary}

    # Assign a fresh batch id for this import so we can undo it later
    batch_id = str(uuid.uuid4())
    batch_ts = now_iso()

    result = {
        "members": {"added": 0, "updated": 0, "skipped": 0, "errors": 0},
        "events": {"added": 0, "updated": 0, "skipped": 0, "errors": 0},
        "points": {"added": 0, "updated": 0, "skipped": 0, "errors": 0},
    }

    existing_members_by_name = {}
    existing_members_by_mid = {}
    for m in await db.members.find({}, {"_id": 0}).to_list(10000):
        if m.get("name"):
            # Case-sensitive: "Ecem" and "ecem" stay as distinct members.
            existing_members_by_name[m["name"]] = m
        if m.get("member_id"):
            existing_members_by_mid[str(m["member_id"]).strip()] = m
    existing_events = {}
    for e in await db.events.find({}, {"_id": 0}).to_list(2000):
        if e.get("name"):
            existing_events[e["name"].lower()] = e

    for row in member_rows:
        try:
            r = _normalize_row(row)
            name = str(_pick(r, "name", "İsim", "Ad", "Oyuncu İsmi", "Oyuncu", "Player") or "").strip()
            if not name:
                result["members"]["errors"] += 1
                continue
            excel_member_id = (str(_pick(r, "member_id", "id_optional", "game_id", "Oyun ID", "ID") or "").strip() or None)
            payload = {
                "name": name,
                "member_id": excel_member_id,
                "alliance_name": (str(_pick(r, "alliance_name", "İttifak Adı", "İttifak", "Alliance") or "").strip() or None),
                "rank": (str(_pick(r, "rank", "rütbe", "rutbe", "Rank") or "").strip() or "R1"),
                "title": (str(_pick(r, "title", "unvan", "Unvan") or "").strip() or None),
                "level": _parse_int(_pick(r, "level", "seviye", "Level")) or None,
                "castle_level": (str(_pick(r, "castle_level", "kale_seviyesi", "Kale Seviyesi", "Castle") or "").strip() or None),
                "tetikci_f": (str(_pick(r, "tetikci_f", "Tetikçi F", "tetikci f") or "").strip() or None),
                "tetikci_t": (str(_pick(r, "tetikci_t", "Tetikçi T", "tetikci t") or "").strip() or None),
                "bombaci_f": (str(_pick(r, "bombaci_f", "Bombacı F", "bombaci f") or "").strip() or None),
                "bombaci_t": (str(_pick(r, "bombaci_t", "Bombacı T", "bombaci t") or "").strip() or None),
                "kalkanli_f": (str(_pick(r, "kalkanli_f", "Kalkanlı F", "kalkanli f") or "").strip() or None),
                "kalkanli_t": (str(_pick(r, "kalkanli_t", "Kalkanlı T", "kalkanli t") or "").strip() or None),
                "bireysel_guc": _parse_int(_pick(r, "bireysel_guc", "Bireysel Güç", "individual_power", "Bireysel Guc", "Guc", "Power")),
                "note": (str(_pick(r, "note", "not", "Not", "Note") or "").strip() or None),
            }

            # Prefer matching by member_id, fall back to name (CASE-SENSITIVE)
            existing = None
            if excel_member_id and excel_member_id in existing_members_by_mid:
                existing = existing_members_by_mid[excel_member_id]
            elif name in existing_members_by_name:
                existing = existing_members_by_name[name]

            if existing:
                if duplicate_mode == "update":
                    # bireysel_guc: always write when column was present, even if 0.
                    # Other fields: only write when non-empty so blanks don't wipe existing data.
                    set_fields = {}
                    for k, v in payload.items():
                        if k == "bireysel_guc":
                            # bireysel_guc is only set when the column actually exists in the row
                            if any(nk in r for nk in ("bireysel_guc", "individual_power", "power", "guc")):
                                set_fields[k] = v
                        elif v not in (None, ""):
                            set_fields[k] = v
                    if set_fields:
                        await db.members.update_one({"id": existing["id"]}, {"$set": set_fields})
                    result["members"]["updated"] += 1
                else:
                    result["members"]["skipped"] += 1
            else:
                new_m = Member(**payload).model_dump()
                new_m["import_batch_id"] = batch_id
                await db.members.insert_one(new_m)
                existing_members_by_name[name] = new_m
                if new_m.get("member_id"):
                    existing_members_by_mid[str(new_m["member_id"])] = new_m
                result["members"]["added"] += 1
        except Exception:
            result["members"]["errors"] += 1

    for row in event_rows:
        try:
            r = _normalize_row(row)
            name = str(_pick(r, "name", "İsim", "Ad") or "").strip()
            if not name:
                result["events"]["errors"] += 1
                continue
            mult_v = _pick(r, "multiplier", "carpan", "Çarpan")
            date_v = _pick(r, "date", "tarih", "Tarih")
            archived_v = _pick(r, "archived", "Arşiv", "arsiv")
            payload = {
                "name": name,
                "group_name": str(_pick(r, "group_name", "grup", "Grup") or "SvS vs 10007").strip(),
                "multiplier": float(mult_v or 1.0),
                "date": str(date_v) if date_v else now_iso(),
                "subtitle": (str(_pick(r, "subtitle", "alt_baslik", "Alt Başlık") or "").strip() or None),
                "archived": bool(archived_v) and str(archived_v).lower() not in ("0", "false", ""),
            }
            key = name.lower()
            if key in existing_events:
                if duplicate_mode == "update":
                    await db.events.update_one({"id": existing_events[key]["id"]}, {"$set": payload})
                    result["events"]["updated"] += 1
                else:
                    result["events"]["skipped"] += 1
            else:
                new_e = Event(**payload).model_dump()
                new_e["import_batch_id"] = batch_id
                await db.events.insert_one(new_e)
                existing_events[key] = new_e
                result["events"]["added"] += 1
        except Exception:
            result["events"]["errors"] += 1

    # Case-sensitive member lookup for points import (Ecem ≠ ecem).
    members_by_name = {m["name"]: m for m in await db.members.find({}, {"_id": 0}).to_list(10000) if m.get("name")}
    events_by_name = {e["name"].lower(): e for e in await db.events.find({}, {"_id": 0}).to_list(2000) if e.get("name")}
    existing_points = {}
    for p in await db.points.find({}, {"_id": 0}).to_list(30000):
        existing_points[(p.get("member_id"), p.get("event_id"))] = p

    for row in point_rows:
        try:
            r = _normalize_row(row)
            member_id = str(_pick(r, "member_id") or "").strip()
            event_id = str(_pick(r, "event_id") or "").strip()
            if not member_id:
                mn = _pick(r, "member_name", "üye", "uye", "Oyuncu")
                if mn:
                    m = members_by_name.get(str(mn).strip())
                    if m:
                        member_id = m["id"]
            if not event_id:
                en = _pick(r, "event_name", "etkinlik", "Etkinlik")
                if en:
                    e = events_by_name.get(str(en).lower().strip())
                    if e:
                        event_id = e["id"]
            if not member_id or not event_id:
                result["points"]["errors"] += 1
                continue
            pts = _parse_int(_pick(r, "points", "puan", "score"))
            mult = float(_pick(r, "multiplier", "carpan", "Çarpan") or 1.0)
            note = (str(_pick(r, "note", "not", "Not") or "").strip() or None)
            key = (member_id, event_id)
            if key in existing_points:
                if duplicate_mode == "update":
                    await db.points.update_one(
                        {"id": existing_points[key]["id"]},
                        {"$set": {"points": pts, "multiplier": mult, "note": note}},
                    )
                    result["points"]["updated"] += 1
                else:
                    result["points"]["skipped"] += 1
            else:
                new_p = Point(member_id=member_id, event_id=event_id, points=pts, multiplier=mult, note=note).model_dump()
                new_p["import_batch_id"] = batch_id
                await enrich_point(new_p)
                await db.points.insert_one(new_p)
                existing_points[key] = new_p
                result["points"]["added"] += 1
        except Exception:
            result["points"]["errors"] += 1

    total_added = result["members"]["added"] + result["events"]["added"] + result["points"]["added"]
    if total_added > 0:
        await db.import_logs.insert_one({
            "id": batch_id,
            "timestamp": batch_ts,
            "filename": file.filename or "",
            "duplicate_mode": duplicate_mode,
            "result": result,
            "undone": False,
        })

    return {"dry_run": False, "batch_id": batch_id if total_added > 0 else None, **summary, "result": result}


@api_router.post("/import/undo-last")
async def undo_last_import(_: dict = Depends(require_edit)):
    """Convenience: undo the most recent non-undone import batch."""
    last = await db.import_logs.find_one({"undone": {"$ne": True}}, sort=[("timestamp", -1)])
    if not last:
        raise HTTPException(404, "Geri alınacak import bulunamadı")
    batch_id = last["id"]
    deleted = {"members": 0, "events": 0, "points": 0}
    m_res = await db.members.delete_many({"import_batch_id": batch_id})
    deleted["members"] = m_res.deleted_count
    e_res = await db.events.delete_many({"import_batch_id": batch_id})
    deleted["events"] = e_res.deleted_count
    p_res = await db.points.delete_many({"import_batch_id": batch_id})
    deleted["points"] = p_res.deleted_count
    await db.import_logs.update_one({"id": batch_id}, {"$set": {"undone": True, "undone_at": now_iso(), "deleted": deleted}})
    return {"ok": True, "batch_id": batch_id, "deleted": deleted}


@api_router.get("/import/logs")
async def list_import_logs(_: dict = Depends(require_edit)):
    """List past import batches (newest first)."""
    docs = await db.import_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(50)
    return docs


@api_router.post("/import/undo/{batch_id}")
async def undo_import(batch_id: str, _: dict = Depends(require_edit)):
    """Delete ONLY records that were newly inserted by the given import batch.
    Never touches pre-existing records (they never had the import_batch_id tag)."""
    log = await db.import_logs.find_one({"id": batch_id})
    if not log:
        raise HTTPException(404, "Import log bulunamadı")
    if log.get("undone"):
        raise HTTPException(400, "Bu import zaten geri alınmış")

    deleted = {"members": 0, "events": 0, "points": 0}
    m_res = await db.members.delete_many({"import_batch_id": batch_id})
    deleted["members"] = m_res.deleted_count
    e_res = await db.events.delete_many({"import_batch_id": batch_id})
    deleted["events"] = e_res.deleted_count
    p_res = await db.points.delete_many({"import_batch_id": batch_id})
    deleted["points"] = p_res.deleted_count

    await db.import_logs.update_one({"id": batch_id}, {"$set": {"undone": True, "undone_at": now_iso(), "deleted": deleted}})
    return {"ok": True, "batch_id": batch_id, "deleted": deleted}


# ---------- Setup ----------
# ---------- Unit Costs & Calculations (used by Asker Eğitim calculator) ----------
class UnitCostBody(BaseModel):
    yemek: float = 0
    odun: float = 0
    celik: float = 0
    benzin: float = 0
    sure_saniye: float = 0
    forticlad: float = 0
    gelismis_forticlad: float = 0


class CalculationBody(BaseModel):
    category: str
    soldier_count: float
    yemek: float
    odun: float
    celik: float
    benzin: float
    sure_saniye: float


@api_router.get("/unit-costs/{category}")
async def get_unit_costs(category: str):
    doc = await db.unit_costs.find_one({"category": category})
    if not doc:
        return {"category": category, "yemek": 0, "odun": 0, "celik": 0, "benzin": 0, "sure_saniye": 0, "forticlad": 0, "gelismis_forticlad": 0}
    return {
        "category": doc.get("category", category),
        "yemek": doc.get("yemek", 0),
        "odun": doc.get("odun", 0),
        "celik": doc.get("celik", 0),
        "benzin": doc.get("benzin", 0),
        "sure_saniye": doc.get("sure_saniye", 0),
        "forticlad": doc.get("forticlad", 0),
        "gelismis_forticlad": doc.get("gelismis_forticlad", 0),
    }


@api_router.put("/unit-costs/{category}")
async def put_unit_costs(category: str, body: UnitCostBody, _: dict = Depends(require_admin)):
    doc = {"category": category, **body.model_dump(), "updated_at": now_iso()}
    await db.unit_costs.update_one({"category": category}, {"$set": doc}, upsert=True)
    return doc


@api_router.get("/calculations")
async def list_calculations(category: str = Query(...), limit: int = 50):
    cursor = db.calculations.find({"category": category}).sort("created_at", -1).limit(min(200, max(1, limit)))
    out = []
    async for d in cursor:
        d.pop("_id", None)
        out.append(d)
    return out


@api_router.post("/calculations")
async def create_calculation(body: CalculationBody, _: dict = Depends(require_edit)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": now_iso()}
    await db.calculations.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.delete("/calculations/{calc_id}")
async def delete_calculation(calc_id: str, _: dict = Depends(require_edit)):
    r = await db.calculations.delete_one({"id": calc_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "not found")
    return {"deleted": True}


# ---------- Point Calculator (Puan Hesaplama) ----------
class PCMultiplier(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    value: float = 0


class PCMaterial(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    amount: str = ""


class PCUnitLabels(BaseModel):
    yemek: str = "Yemek"
    odun: str = "Odun"
    celik: str = "Çelik"
    benzin: str = "Benzin"
    forticlad: str = "Forticlad"
    gelismis_forticlad: str = "Gelişmiş Forticlad"


class PCTable(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""
    miktar: float = 0
    multipliers: List[PCMultiplier] = []
    materials: List[PCMaterial] = []


class PCDayCreate(BaseModel):
    kind: str
    name: str
    order: int = 0
    title: str = ""
    miktar: float = 0
    multipliers: List[PCMultiplier] = []
    unit_labels: Optional[PCUnitLabels] = None
    materials: List[PCMaterial] = []
    tables: List[PCTable] = []


class PCDayUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    title: Optional[str] = None
    miktar: Optional[float] = None
    multipliers: Optional[List[PCMultiplier]] = None
    unit_labels: Optional[PCUnitLabels] = None
    materials: Optional[List[PCMaterial]] = None
    tables: Optional[List[PCTable]] = None
    translations: Optional[Dict[str, Dict[str, str]]] = None


async def _seed_default_pc_days(kind: str):
    if kind not in ("pre", "diger"):
        return
    existing = await db.point_calc_days.count_documents({"kind": kind})
    if existing > 0:
        return
    defaults = [f"{i+1}. Gün" for i in range(6)]
    docs = []
    for idx, name in enumerate(defaults):
        docs.append({
            "id": str(uuid.uuid4()),
            "kind": kind,
            "name": name,
            "order": idx,
            "title": "",
            "miktar": 0,
            "multipliers": [],
            "unit_labels": PCUnitLabels().model_dump(),
            "materials": [],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
    await db.point_calc_days.insert_many(docs)


@api_router.get("/point-calc")
async def list_point_calc(kind: str = Query(...)):
    if kind not in ("pre", "diger"):
        raise HTTPException(400, "invalid kind")
    await _seed_default_pc_days(kind)
    cursor = db.point_calc_days.find({"kind": kind}).sort([("order", 1), ("created_at", 1)])
    out = []
    async for d in cursor:
        d.pop("_id", None)
        out.append(d)
    return out


@api_router.post("/point-calc")
async def create_point_calc(body: PCDayCreate, _: dict = Depends(require_edit)):
    if body.kind not in ("pre", "diger"):
        raise HTTPException(400, "invalid kind")
    doc = body.model_dump()
    if doc.get("unit_labels") is None:
        doc["unit_labels"] = PCUnitLabels().model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = now_iso()
    doc["updated_at"] = now_iso()
    await db.point_calc_days.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.patch("/point-calc/{day_id}")
async def update_point_calc(day_id: str, body: PCDayUpdate, _: dict = Depends(require_edit)):
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not upd:
        raise HTTPException(400, "no fields")
    # Snapshot the current doc BEFORE mutation, so admins can revert.
    current = await db.point_calc_days.find_one({"id": day_id})
    if not current:
        raise HTTPException(404, "not found")
    current.pop("_id", None)
    await db.point_calc_history.insert_one({
        "version_id": str(uuid.uuid4()),
        "day_id": day_id,
        "saved_at": now_iso(),
        "changed_fields": list(upd.keys()),
        "snapshot": current,
    })
    upd["updated_at"] = now_iso()
    r = await db.point_calc_days.update_one({"id": day_id}, {"$set": upd})
    if r.matched_count == 0:
        raise HTTPException(404, "not found")
    d = await db.point_calc_days.find_one({"id": day_id})
    d.pop("_id", None)
    return d


@api_router.delete("/point-calc/{day_id}")
async def delete_point_calc(day_id: str, _: dict = Depends(require_edit)):
    r = await db.point_calc_days.delete_one({"id": day_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "not found")
    return {"deleted": True}


# ---------- Public share link (HMAC-signed, read-only) ----------
import hmac as _hmac
import hashlib as _hashlib

def _pc_sign(day_id: str) -> str:
    secret = os.environ.get("JWT_SECRET", "dev-secret").encode()
    return _hmac.new(secret, day_id.encode(), _hashlib.sha256).hexdigest()[:32]


@api_router.get("/point-calc/{day_id}/share")
async def make_share_link(day_id: str, _: dict = Depends(require_edit)):
    doc = await db.point_calc_days.find_one({"id": day_id})
    if not doc:
        raise HTTPException(404, "not found")
    return {"id": day_id, "sig": _pc_sign(day_id)}


@api_router.get("/public/point-calc/{day_id}")
async def public_point_calc(day_id: str, sig: str = Query(...)):
    expected = _pc_sign(day_id)
    if not _hmac.compare_digest(expected, sig):
        raise HTTPException(403, "invalid signature")
    doc = await db.point_calc_days.find_one({"id": day_id})
    if not doc:
        raise HTTPException(404, "not found")
    doc.pop("_id", None)
    return doc


# ---------- Version history ----------
@api_router.get("/point-calc/{day_id}/history")
async def list_history(day_id: str, _: dict = Depends(require_auth)):
    cursor = db.point_calc_history.find({"day_id": day_id}).sort("saved_at", -1).limit(20)
    out = []
    async for h in cursor:
        h.pop("_id", None)
        out.append({
            "version_id": h.get("version_id"),
            "saved_at": h.get("saved_at"),
            "changed_fields": h.get("changed_fields", []),
        })
    return out


@api_router.post("/point-calc/{day_id}/revert/{version_id}")
async def revert_history(day_id: str, version_id: str, _: dict = Depends(require_edit)):
    snap = await db.point_calc_history.find_one({"day_id": day_id, "version_id": version_id})
    if not snap:
        raise HTTPException(404, "version not found")
    prev = snap.get("snapshot") or {}
    # Save current as new snapshot before reverting.
    current = await db.point_calc_days.find_one({"id": day_id})
    if current:
        current.pop("_id", None)
        await db.point_calc_history.insert_one({
            "version_id": str(uuid.uuid4()),
            "day_id": day_id,
            "saved_at": now_iso(),
            "changed_fields": ["revert"],
            "snapshot": current,
        })
    prev.pop("id", None)
    prev["updated_at"] = now_iso()
    await db.point_calc_days.update_one({"id": day_id}, {"$set": prev})
    doc = await db.point_calc_days.find_one({"id": day_id})
    doc.pop("_id", None)
    return doc


# ---------- DeepL Translation ----------
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "").strip()
DEEPL_LANG_MAP = {
    # i18n code -> DeepL code
    "en": "EN-GB", "ru": "RU", "de": "DE", "fr": "FR", "es": "ES", "ko": "KO",
    "bg": "BG", "cs": "CS", "da": "DA", "el": "EL", "et": "ET", "fi": "FI", "hu": "HU",
    "id": "ID", "it": "IT", "ja": "JA", "lt": "LT", "lv": "LV", "nb": "NB", "nl": "NL",
    "pl": "PL", "pt": "PT-PT", "pt-br": "PT-BR", "ro": "RO", "sk": "SK", "sl": "SL",
    "sv": "SV", "uk": "UK", "zh": "ZH",
}


class TranslateBody(BaseModel):
    text: Union[str, List[str]]
    targetLangs: List[str]
    sourceLang: Optional[str] = "TR"


@api_router.post("/translate")
async def translate(body: TranslateBody):
    if not DEEPL_API_KEY:
        raise HTTPException(503, "DEEPL_API_KEY not configured on server")
    base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
    texts = body.text if isinstance(body.text, list) else [body.text]
    if not texts:
        return {"translations": {}}
    src_raw = (body.sourceLang or "").strip().upper()
    # sourceLang="" | None | "AUTO" → let DeepL auto-detect (skip source_lang param).
    src = None if src_raw in ("", "AUTO", "AUTO_DETECT") else src_raw
    results: dict = {}
    detected_sources: dict = {}
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}", "Content-Type": "application/json"}
    total_chars = sum(len(t or "") for t in texts)
    async with httpx.AsyncClient(timeout=25) as client:
        for lang in body.targetLangs:
            deepl_lang = DEEPL_LANG_MAP.get(lang.lower(), lang.upper())
            payload = {"text": texts, "target_lang": deepl_lang}
            if src:
                payload["source_lang"] = src
            try:
                r = await client.post(f"{base}/translate", headers=headers, json=payload)
                r.raise_for_status()
                data = r.json()
                translations = data.get("translations", [])
                translated = [t.get("text", "") for t in translations]
                results[lang] = translated if isinstance(body.text, list) else (translated[0] if translated else "")
                if translations and translations[0].get("detected_source_language"):
                    detected_sources[lang] = translations[0]["detected_source_language"]
            except httpx.HTTPStatusError as e:
                results[lang] = {"error": f"DeepL {e.response.status_code}: {e.response.text[:200]}"}
            except Exception as e:
                results[lang] = {"error": str(e)[:200]}
    # Fire-and-forget usage log for the weekly digest. Truncate texts to 80 chars.
    try:
        successful_langs = [l for l, v in results.items() if not isinstance(v, dict)]
        if successful_langs:
            await db.deepl_translate_log.insert_one({
                "ts": now_iso(),
                "chars": total_chars,
                "targets": successful_langs,
                "source": src or (list(detected_sources.values())[0] if detected_sources else "AUTO"),
                "texts": [(t or "")[:80] for t in texts[:20]],
            })
    except Exception:
        pass
    out = {"translations": results}
    if src is None and detected_sources:
        out["detected_source_langs"] = detected_sources
    return out


@api_router.get("/translate/digest")
async def deepl_digest(days: int = 7, _: dict = Depends(require_admin)):
    """Weekly / N-day digest of DeepL usage: character totals, per-language counts,
    detected source distribution, and the top most-translated source strings."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    days = max(1, min(90, int(days or 7)))
    cutoff = (_dt.now(_tz.utc) - _td(days=days)).isoformat()
    logs = await db.deepl_translate_log.find({"ts": {"$gte": cutoff}}, {"_id": 0}).to_list(50000)
    total_chars = 0
    total_requests = len(logs)
    lang_counts: dict = {}
    src_counts: dict = {}
    text_counts: dict = {}
    # Build a per-day bucket keyed by YYYY-MM-DD so the frontend can render a bar chart.
    daily_map: dict = {}
    for row in logs:
        total_chars += int(row.get("chars", 0) or 0)
        for l in row.get("targets", []) or []:
            lang_counts[l] = lang_counts.get(l, 0) + 1
        src = row.get("source") or "?"
        src_counts[src] = src_counts.get(src, 0) + 1
        for tx in row.get("texts", []) or []:
            if tx:
                text_counts[tx] = text_counts.get(tx, 0) + 1
        day_key = (row.get("ts") or "")[:10]
        if day_key:
            entry = daily_map.setdefault(day_key, {"date": day_key, "chars": 0, "requests": 0})
            entry["chars"] += int(row.get("chars", 0) or 0)
            entry["requests"] += 1
    # Emit a zero-filled window so the chart always has `days` bars in chronological order.
    today = _dt.now(_tz.utc).date()
    daily: list = []
    for i in range(days - 1, -1, -1):
        d = today - _td(days=i)
        k = d.isoformat()
        daily.append(daily_map.get(k) or {"date": k, "chars": 0, "requests": 0})
    langs = sorted(
        [{"code": k, "count": v} for k, v in lang_counts.items()],
        key=lambda x: -x["count"],
    )
    sources = sorted(
        [{"code": k, "count": v} for k, v in src_counts.items()],
        key=lambda x: -x["count"],
    )
    top_keys = sorted(
        [{"text": k, "count": v} for k, v in text_counts.items()],
        key=lambda x: -x["count"],
    )[:15]
    return {
        "days": days,
        "total_chars": total_chars,
        "total_requests": total_requests,
        "langs": langs,
        "sources": sources,
        "top_keys": top_keys,
        "daily": daily,
    }


@api_router.get("/translate/digest/day")
async def deepl_digest_day(date: str, _: dict = Depends(require_admin)):
    """Top-5 translated source strings for a single UTC day (YYYY-MM-DD)."""
    from datetime import datetime as _dt
    try:
        _dt.strptime(date, "%Y-%m-%d")
    except Exception:
        raise HTTPException(400, "invalid date; expected YYYY-MM-DD")
    lo = f"{date}T00:00:00+00:00"
    hi = f"{date}T23:59:59.999999+00:00"
    logs = await db.deepl_translate_log.find({"ts": {"$gte": lo, "$lte": hi}}, {"_id": 0}).to_list(20000)
    total_chars = 0
    total_requests = len(logs)
    text_counts: dict = {}
    lang_counts: dict = {}
    for row in logs:
        total_chars += int(row.get("chars", 0) or 0)
        for l in row.get("targets", []) or []:
            lang_counts[l] = lang_counts.get(l, 0) + 1
        for tx in row.get("texts", []) or []:
            if tx:
                text_counts[tx] = text_counts.get(tx, 0) + 1
    top_keys = sorted(
        [{"text": k, "count": v} for k, v in text_counts.items()],
        key=lambda x: -x["count"],
    )[:5]
    langs = sorted(
        [{"code": k, "count": v} for k, v in lang_counts.items()],
        key=lambda x: -x["count"],
    )
    return {
        "date": date,
        "total_chars": total_chars,
        "total_requests": total_requests,
        "top_keys": top_keys,
        "langs": langs,
    }


# --- Cron: nightly cleanup of DeepL translate log --------------------------
import hmac as _hmac_cron
import asyncio as _asyncio_cron

WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "").strip()


async def _prune_deepl_log_task():
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    try:
        cutoff = (_dt.now(_tz.utc) - _td(days=90)).isoformat()
        await db.deepl_translate_log.delete_many({"ts": {"$lt": cutoff}})
    except Exception:
        pass


@api_router.post("/cron/prune-deepl-log")
async def cron_prune_deepl_log(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {WEBHOOK_CRON_SECRET}"
    if not WEBHOOK_CRON_SECRET or not _hmac_cron.compare_digest(auth, expected):
        raise HTTPException(401, "unauthorized")
    _asyncio_cron.create_task(_prune_deepl_log_task())
    return {"accepted": True}


async def _weekly_digest_task():
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    admin_email = os.environ.get("DIGEST_ADMIN_EMAIL", "").strip()
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
    if not resend_key or not admin_email:
        return
    try:
        import resend as _resend
        _resend.api_key = resend_key
        cutoff = (_dt.now(_tz.utc) - _td(days=7)).isoformat()
        logs = await db.deepl_translate_log.find({"ts": {"$gte": cutoff}}, {"_id": 0}).to_list(20000)
        chars = sum(int(r.get("chars", 0) or 0) for r in logs)
        reqs = len(logs)
        lang_counts: dict = {}
        text_counts: dict = {}
        for r in logs:
            for l in r.get("targets", []) or []:
                lang_counts[l] = lang_counts.get(l, 0) + 1
            for tx in r.get("texts", []) or []:
                if tx: text_counts[tx] = text_counts.get(tx, 0) + 1
        top_langs = sorted(lang_counts.items(), key=lambda x: -x[1])[:5]
        top_keys = sorted(text_counts.items(), key=lambda x: -x[1])[:10]
        lang_rows = "".join(f"<tr><td style='padding:4px 8px;color:#F5A623'>{l}</td><td style='padding:4px 8px;color:#F5F0E8;text-align:right'>{c}</td></tr>" for l, c in top_langs) or "<tr><td colspan='2' style='padding:8px;color:#888'>—</td></tr>"
        key_rows = "".join(f"<tr><td style='padding:4px 8px;color:#E74C1A;font-family:monospace'>×{c}</td><td style='padding:4px 8px;color:#F5F0E8'>{(tx[:80]).replace('<','&lt;')}</td></tr>" for tx, c in top_keys) or "<tr><td colspan='2' style='padding:8px;color:#888'>—</td></tr>"
        html = (
            "<div style='background:#0F0806;color:#F5F0E8;font-family:Arial,sans-serif;padding:24px'>"
            "<h2 style='color:#C4B5FD;margin:0 0 4px 0;font-family:Georgia,serif'>TiTaNXiS · Haftalık DeepL Raporu</h2>"
            f"<div style='color:#888;font-size:12px;margin-bottom:20px'>Son 7 gün · {_dt.now(_tz.utc).strftime('%Y-%m-%d')}</div>"
            "<table style='width:100%;margin-bottom:20px'><tr>"
            f"<td style='background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);padding:12px;border-radius:8px'><div style='color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.14em'>Karakter</div><div style='color:#C4B5FD;font-size:20px;font-weight:bold;font-family:monospace'>{chars:,}</div></td>"
            f"<td style='width:12px'></td>"
            f"<td style='background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);padding:12px;border-radius:8px'><div style='color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.14em'>İstek</div><div style='color:#C4B5FD;font-size:20px;font-weight:bold;font-family:monospace'>{reqs}</div></td>"
            "</tr></table>"
            "<div style='color:#F5A623;font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:8px 0'>Hedef Diller</div>"
            f"<table style='width:100%;border-collapse:collapse'>{lang_rows}</table>"
            "<div style='color:#E74C1A;font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:20px 0 8px'>En Çok Çevrilenler</div>"
            f"<table style='width:100%;border-collapse:collapse'>{key_rows}</table>"
            "</div>"
        )
        params = {"from": sender, "to": [admin_email], "subject": f"TiTaNXiS Haftalık DeepL Raporu · {chars:,} char / {reqs} req", "html": html}
        result = await _asyncio_cron.to_thread(_resend.Emails.send, params)
        logger.info(f"[weekly-digest] Resend send OK id={result.get('id') if isinstance(result, dict) else result}")
    except Exception as e:
        logger.error(f"[weekly-digest] send failed: {e}")


@api_router.post("/cron/weekly-digest-email")
async def cron_weekly_digest_email(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {WEBHOOK_CRON_SECRET}"
    if not WEBHOOK_CRON_SECRET or not _hmac_cron.compare_digest(auth, expected):
        raise HTTPException(401, "unauthorized")
    _asyncio_cron.create_task(_weekly_digest_task())
    return {"accepted": True}


@api_router.get("/translate/usage")
async def deepl_usage():
    from datetime import datetime as _dt, timezone as _tz
    from calendar import monthrange as _mr
    # Compute days until next monthly reset. DeepL Free quota resets on the 1st
    # of each calendar month (UTC) — this is a common convention and matches how
    # DeepL displays the reset day on their dashboard for Free-tier accounts.
    now = _dt.now(_tz.utc)
    last_day = _mr(now.year, now.month)[1]
    days_to_reset = (last_day - now.day) + 1
    reset_at = f"{now.year:04d}-{(now.month % 12 + 1):02d}-01"
    if not DEEPL_API_KEY:
        return {"configured": False, "character_count": 0, "character_limit": 0,
                "plan": None, "days_to_reset": days_to_reset, "reset_at": reset_at}
    base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{base}/usage", headers=headers)
            r.raise_for_status()
            data = r.json()
        return {
            "configured": True,
            "character_count": data.get("character_count", 0),
            "character_limit": data.get("character_limit", 0),
            "plan": "free" if DEEPL_API_KEY.endswith(":fx") else "pro",
            "days_to_reset": days_to_reset,
            "reset_at": reset_at,
        }
    except Exception as e:
        return {"configured": True, "error": str(e)[:200], "character_count": 0, "character_limit": 0,
                "plan": "free" if DEEPL_API_KEY.endswith(":fx") else "pro",
                "days_to_reset": days_to_reset, "reset_at": reset_at}


ENABLED_LANGS = ["en", "ru", "de", "fr", "es", "ko", "bg", "cs", "da", "el", "et", "fi",
                 "hu", "id", "it", "ja", "lt", "lv", "nb", "nl", "pl", "pt", "ro", "sk", "sl", "sv", "uk", "zh"]


async def _deepl_translate_one(text: str, target_langs=None):
    if not DEEPL_API_KEY or not text:
        return {}
    base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}", "Content-Type": "application/json"}
    langs = target_langs or ENABLED_LANGS
    out: dict = {}
    async with httpx.AsyncClient(timeout=25) as client:
        for lang in langs:
            deepl_lang = DEEPL_LANG_MAP.get(lang, lang.upper())
            try:
                r = await client.post(f"{base}/translate", headers=headers,
                                      json={"text": [text], "target_lang": deepl_lang, "source_lang": "TR"})
                r.raise_for_status()
                tr_list = r.json().get("translations", [])
                if tr_list:
                    out[lang] = tr_list[0].get("text", "")
            except Exception:
                pass
    return out


class DeeplBulkBody(BaseModel):
    texts: List[str]
    target_langs: Optional[List[str]] = None


@api_router.post("/deepl/bulk-translate")
async def deepl_bulk_translate(body: DeeplBulkBody, _: dict = Depends(require_admin)):
    """Bulk TR → multi-language translation for ad-hoc content. Powers the
    'Toplu Çeviri' button in the DeepL admin panel — admin pastes N lines,
    receives a {text: {lang: translation}} map for the enabled languages.
    Skips empty/whitespace-only lines. Deduplicates identical inputs."""
    if not DEEPL_API_KEY:
        raise HTTPException(503, "DEEPL_API_KEY not configured")
    cleaned = []
    seen: set = set()
    for t in (body.texts or []):
        s = (t or "").strip()
        if s and s not in seen:
            seen.add(s)
            cleaned.append(s)
    if not cleaned:
        raise HTTPException(400, "texts required")
    if len(cleaned) > 100:
        raise HTTPException(400, "max 100 metin per çağrı")
    result: Dict[str, Dict[str, str]] = {}
    for text in cleaned:
        result[text] = await _deepl_translate_one(text, target_langs=body.target_langs)
    return {"count": len(result), "translations": result}


@api_router.post("/point-calc/translate-all")
async def translate_all_pc(kind: str = Query(...), _: dict = Depends(require_admin)):
    if kind not in ("pre", "diger"):
        raise HTTPException(400, "invalid kind")
    if not DEEPL_API_KEY:
        raise HTTPException(503, "DEEPL_API_KEY not configured")
    days = []
    async for d in db.point_calc_days.find({"kind": kind}):
        d.pop("_id", None)
        days.append(d)

    translated_strings = 0
    for day in days:
        current = day.get("translations") or {}
        strings = set()
        if day.get("name"): strings.add(day["name"])
        for tb in day.get("tables") or []:
            if tb.get("title"): strings.add(tb["title"])
            for m in tb.get("multipliers") or []:
                if m.get("name"): strings.add(m["name"])
            for mat in tb.get("materials") or []:
                if mat.get("name"): strings.add(mat["name"])
        # Skip strings that already have full translations.
        missing = [s for s in strings if not current.get(s) or len(current.get(s, {})) < len(ENABLED_LANGS)]
        if not missing:
            continue
        for src in missing:
            tr_map = await _deepl_translate_one(src)
            if tr_map:
                current[src] = {**(current.get(src) or {}), **tr_map}
                translated_strings += 1
        await db.point_calc_days.update_one(
            {"id": day["id"]},
            {"$set": {"translations": current, "updated_at": now_iso()}},
        )
    return {"days_processed": len(days), "strings_translated": translated_strings}


@api_router.get("/point-calc/export")
async def export_point_calc(kind: str = Query(...), _: dict = Depends(require_auth)):
    if kind not in ("pre", "diger"):
        raise HTTPException(400, "invalid kind")
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from fastapi.responses import StreamingResponse
    import io

    wb = Workbook()
    wb.remove(wb.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="E74C1A", end_color="E74C1A", fill_type="solid")

    def apply_header(ws, cols):
        for i, col in enumerate(cols, 1):
            c = ws.cell(row=1, column=i, value=col)
            c.font = header_font
            c.fill = header_fill
            c.alignment = Alignment(horizontal="center", vertical="center")
            ws.column_dimensions[c.column_letter].width = max(16, min(40, len(str(col)) + 4))

    days_cursor = db.point_calc_days.find({"kind": kind}).sort([("order", 1), ("created_at", 1)])
    async for day in days_cursor:
        day.pop("_id", None)
        sheet_name = (day.get("name") or "Etkinlik")[:28].replace("/", "-").replace("\\", "-").replace(":", "-").replace("*", "-").replace("?", "-").replace("[", "").replace("]", "")
        ws = wb.create_sheet(title=sheet_name or "Etkinlik")
        apply_header(ws, ["Tablo Başlığı", "Çarpan Adı", "Çarpan Miktarı", "Miktar", "Toplam Puan", "Birim İsmi", "Birim Miktarı", "Birim Toplam"])
        row = 2
        for tb in day.get("tables") or []:
            title = tb.get("title", "")
            miktar = float(tb.get("miktar") or 0)
            mults = tb.get("multipliers") or []
            mult_name = mults[0].get("name", "") if mults else ""
            mult_val = float(mults[0].get("value") or 0) if mults else 0
            total_points = miktar * mult_val
            mats = tb.get("materials") or []
            if not mats:
                ws.append([title, mult_name, mult_val, miktar, total_points, "", "", ""])
                row += 1
                continue
            for mat in mats:
                amt = 0
                try: amt = float(mat.get("amount") or 0)
                except Exception: amt = 0
                ws.append([title, mult_name, mult_val, miktar, total_points, mat.get("name", ""), amt, miktar * amt])
                row += 1
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions

    # Translations sheet
    trs = wb.create_sheet(title="_Ceviriler")
    apply_header(trs, ["Etkinlik", "Kaynak (TR)"] + [l.upper() for l in ENABLED_LANGS])
    days_cursor2 = db.point_calc_days.find({"kind": kind}).sort([("order", 1)])
    async for day in days_cursor2:
        day.pop("_id", None)
        for src, tr_map in (day.get("translations") or {}).items():
            row_vals = [day.get("name", ""), src] + [tr_map.get(l, "") for l in ENABLED_LANGS]
            trs.append(row_vals)
    trs.freeze_panes = "A2"
    if trs.max_row > 1:
        trs.auto_filter.ref = trs.dimensions

    if len(wb.worksheets) == 0:
        wb.create_sheet(title="Bos")

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    fname = f"puan_hesaplama_{kind}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.post("/point-calc/import")
async def import_point_calc(
    kind: str = Query(...),
    file: UploadFile = File(...),
    _: dict = Depends(require_admin),
):
    """Round-trip import of an edited Puan Hesaplama Excel export.
    Each sheet (except _Ceviriler / Bos) is a day; sheet name must match an
    existing day's name (truncated to 28 chars). Rows are grouped into tables
    by (title, mult_name, mult_val, miktar). Existing day is updated (a snapshot
    is written to point_calc_history before the mutation for undo).
    """
    if kind not in ("pre", "diger"):
        raise HTTPException(400, "invalid kind")
    from openpyxl import load_workbook
    import io as _io

    raw = await file.read()
    try:
        wb = load_workbook(filename=_io.BytesIO(raw), data_only=True)
    except Exception as e:
        raise HTTPException(400, f"Excel açılamadı: {e}")

    days_cursor = db.point_calc_days.find({"kind": kind}).sort([("order", 1), ("created_at", 1)])
    all_days = []
    async for d in days_cursor:
        d.pop("_id", None)
        all_days.append(d)

    def _norm(s: str) -> str:
        return (s or "").strip().lower()

    # Build lookup by truncated name (matches export sheet-name rule)
    name_to_day = {}
    for d in all_days:
        n = (d.get("name") or "")[:28]
        name_to_day[_norm(n)] = d

    updated, skipped, errors = 0, 0, []

    for sheet_name in wb.sheetnames:
        if sheet_name in ("_Ceviriler", "Bos"):
            continue
        day = name_to_day.get(_norm(sheet_name))
        if not day:
            skipped += 1
            errors.append(f"Sayfa '{sheet_name}' için eşleşen etkinlik bulunamadı")
            continue
        ws = wb[sheet_name]
        rows = list(ws.iter_rows(min_row=2, values_only=True))
        # Group rows by (title, mult_name, mult_val, miktar) — preserves order of appearance
        groups = []
        group_index = {}
        for row in rows:
            if not row or all((c is None or str(c).strip() == "") for c in row):
                continue
            title = (str(row[0]) if row[0] is not None else "").strip()
            mult_name = (str(row[1]) if len(row) > 1 and row[1] is not None else "").strip()
            try:
                mult_val = float(row[2]) if len(row) > 2 and row[2] is not None and str(row[2]).strip() != "" else 0.0
            except Exception:
                mult_val = 0.0
            try:
                miktar = float(row[3]) if len(row) > 3 and row[3] is not None and str(row[3]).strip() != "" else 0.0
            except Exception:
                miktar = 0.0
            mat_name = (str(row[5]) if len(row) > 5 and row[5] is not None else "").strip()
            try:
                mat_amt = row[6] if len(row) > 6 and row[6] is not None and str(row[6]).strip() != "" else ""
            except Exception:
                mat_amt = ""

            key = (title, mult_name, mult_val, miktar)
            if key not in group_index:
                group_index[key] = len(groups)
                groups.append({"title": title, "mult_name": mult_name, "mult_val": mult_val, "miktar": miktar, "mats": []})
            if mat_name or (mat_amt not in ("", None)):
                groups[group_index[key]]["mats"].append({"name": mat_name, "amount": str(mat_amt) if mat_amt != "" else ""})

        tables = []
        for g in groups:
            tables.append({
                "id": str(uuid.uuid4()),
                "title": g["title"],
                "miktar": g["miktar"],
                "multipliers": (
                    [{"id": str(uuid.uuid4()), "name": g["mult_name"], "value": g["mult_val"]}]
                    if (g["mult_name"] or g["mult_val"]) else []
                ),
                "materials": [
                    {"id": str(uuid.uuid4()), "name": m["name"], "amount": m["amount"]}
                    for m in g["mats"]
                ],
            })

        # Snapshot before mutating
        current = await db.point_calc_days.find_one({"id": day["id"]})
        if current:
            current.pop("_id", None)
            await db.point_calc_history.insert_one({
                "version_id": str(uuid.uuid4()),
                "day_id": day["id"],
                "saved_at": now_iso(),
                "changed_fields": ["tables"],
                "snapshot": current,
                "source": "excel_import",
            })
        await db.point_calc_days.update_one(
            {"id": day["id"]},
            {"$set": {"tables": tables, "updated_at": now_iso()}},
        )
        updated += 1

    return {"updated": updated, "skipped": skipped, "errors": errors}


# ---------- Web Push (VAPID) ----------
from py_vapid import Vapid
from pywebpush import webpush, WebPushException
from cryptography.hazmat.primitives.serialization import load_pem_private_key, Encoding, PublicFormat, PrivateFormat, NoEncryption
from cryptography.hazmat.primitives.asymmetric import ec
import base64 as _base64


async def _get_or_create_vapid():
    # Prefer env-injected keys (production / deployment). Private key is raw
    # 32-byte base64 (urlsafe, no padding) — the format pywebpush accepts directly.
    env_priv = os.environ.get("VAPID_PRIVATE_KEY", "").strip()
    env_pub = os.environ.get("VAPID_PUBLIC_KEY", "").strip()
    if env_priv and env_pub:
        return env_priv, env_pub
    # Fallback: read from DB. If a legacy PKCS8 PEM is stored, convert it to
    # raw base64 on the fly (pywebpush cannot parse PKCS8 PEMs directly).
    doc = await db.push_config.find_one({"id": "vapid"})
    if doc and doc.get("public_b64") and (doc.get("private_pem") or doc.get("private_b64")):
        pub_b64 = doc["public_b64"]
        if doc.get("private_b64"):
            return doc["private_b64"], pub_b64
        try:
            key = load_pem_private_key(doc["private_pem"].encode(), password=None)
            n = key.private_numbers().private_value
            priv_b64 = _base64.urlsafe_b64encode(n.to_bytes(32, "big")).decode().rstrip("=")
            # Cache converted form for subsequent calls
            await db.push_config.update_one(
                {"id": "vapid"}, {"$set": {"private_b64": priv_b64}}
            )
            return priv_b64, pub_b64
        except Exception:
            pass
    # Generate a fresh P-256 keypair
    priv = ec.generate_private_key(ec.SECP256R1())
    priv_num = priv.private_numbers().private_value
    priv_b64 = _base64.urlsafe_b64encode(priv_num.to_bytes(32, "big")).decode().rstrip("=")
    private_pem = priv.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    pub_bytes = priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    public_b64 = _base64.urlsafe_b64encode(pub_bytes).decode().rstrip("=")
    await db.push_config.update_one(
        {"id": "vapid"},
        {"$set": {"id": "vapid", "private_pem": private_pem, "private_b64": priv_b64, "public_b64": public_b64}},
        upsert=True,
    )
    return priv_b64, public_b64


@api_router.get("/push/vapid-public-key")
async def push_vapid_public_key():
    _, public_b64 = await _get_or_create_vapid()
    return {"key": public_b64}


class PushSubscribeBody(BaseModel):
    endpoint: str
    keys: Dict[str, str]


@api_router.post("/push/subscribe")
async def push_subscribe(body: PushSubscribeBody, user: dict = Depends(require_auth)):
    doc = {
        "id": str(uuid.uuid4()),
        "endpoint": body.endpoint,
        "keys": body.keys,
        "user_id": user.get("id"),
        "username": user.get("username"),
        "created_at": now_iso(),
    }
    await db.push_subscriptions.update_one(
        {"endpoint": body.endpoint},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/push/unsubscribe")
async def push_unsubscribe(body: PushSubscribeBody, _: dict = Depends(require_auth)):
    await db.push_subscriptions.delete_one({"endpoint": body.endpoint})
    return {"ok": True}


async def _broadcast_push(title: str, body: str, url: str = "/", tag: str = "titanxis", group_name: Optional[str] = None, alliance_name: Optional[str] = None, country_iso2: Optional[str] = None, event_id: Optional[str] = None, sound: Optional[str] = None):
    """Broadcast a push. When group_name is provided, only send to users whose prefs include this group
    (users without any saved prefs receive everything by default). When alliance_name is provided,
    only send to subscribers whose linked member document has the matching alliance.
    country_iso2 narrows to members with matching country. event_id narrows to users linked to
    members currently marked as attending that event (attendance-based reminders)."""
    private_pem, _ = await _get_or_create_vapid()
    subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(1000)
    # Global opt-out — skip subscribers whose user set notification_enabled=False.
    opted_out_users = {
        u["id"] async for u in db.users.find(
            {"notification_enabled": False}, {"_id": 0, "id": 1}
        )
    }
    allowed_users: Optional[set] = None
    if group_name:
        prefs = await db.push_prefs.find({}, {"_id": 0}).to_list(2000)
        prefs_by_user = {p["user_id"]: (p.get("groups") or []) for p in prefs}
        allowed_users = set()
        for uid, grps in prefs_by_user.items():
            if not grps or group_name in grps:
                allowed_users.add(uid)
    if alliance_name:
        # Build the set of user_ids whose linked members include this alliance.
        member_docs = await db.members.find({"alliance_name": alliance_name}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)
        member_ids = {m["id"] for m in member_docs if m.get("id")}
        alliance_user_ids: set = set()
        # A user may be linked via users.member_ids list, legacy users.member_id, or member.user_id
        user_docs = await db.users.find({}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "notification_member_ids": 1}).to_list(5000)
        for u in user_docs:
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            notif_opt = list(u.get("notification_member_ids") or [])
            effective = notif_opt if notif_opt else linked
            if any(mid in member_ids for mid in effective):
                alliance_user_ids.add(u["id"])
        for m in member_docs:
            if m.get("user_id"):
                alliance_user_ids.add(m["user_id"])
        allowed_users = alliance_user_ids if allowed_users is None else (allowed_users & alliance_user_ids)
    # Country-based targeting.
    country_norm = (country_iso2 or "").strip().upper() or None
    if country_norm and len(country_norm) == 2:
        c_member_docs = await db.members.find(
            {"country": country_norm}, {"_id": 0, "id": 1, "user_id": 1}
        ).to_list(5000)
        c_member_ids = {m["id"] for m in c_member_docs if m.get("id")}
        c_user_ids: set = set()
        c_user_docs = await db.users.find(
            {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "notification_member_ids": 1}
        ).to_list(5000)
        for u in c_user_docs:
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            notif_opt = list(u.get("notification_member_ids") or [])
            effective = notif_opt if notif_opt else linked
            if any(mid in c_member_ids for mid in effective):
                c_user_ids.add(u["id"])
        for m in c_member_docs:
            if m.get("user_id"):
                c_user_ids.add(m["user_id"])
        allowed_users = c_user_ids if allowed_users is None else (allowed_users & c_user_ids)
    # Event attendance filter — only DM users linked to members marked attending this event.
    if event_id:
        att = await db.event_attendance.find_one({"event_id": event_id}, {"_id": 0, "member_ids": 1})
        att_member_ids = set(att.get("member_ids") or []) if att else set()
        att_user_ids: set = set()
        if att_member_ids:
            a_user_docs = await db.users.find(
                {}, {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "notification_member_ids": 1}
            ).to_list(5000)
            for u in a_user_docs:
                linked = list(u.get("member_ids") or [])
                if u.get("member_id"):
                    linked.append(u["member_id"])
                notif_opt = list(u.get("notification_member_ids") or [])
                effective = notif_opt if notif_opt else linked
                if any(mid in att_member_ids for mid in effective):
                    att_user_ids.add(u["id"])
            # Also include members with direct user_id back-link.
            for mid in att_member_ids:
                mdoc = await db.members.find_one({"id": mid}, {"_id": 0, "user_id": 1})
                if mdoc and mdoc.get("user_id"):
                    att_user_ids.add(mdoc["user_id"])
        allowed_users = att_user_ids if allowed_users is None else (allowed_users & att_user_ids)
    # Reserve history id up-front so notifications can ping open-tracking with it
    hid = str(uuid.uuid4())
    if not subs:
        await db.push_history.insert_one({
            "id": hid, "title": title, "body": body, "url": url, "tag": tag,
            "sent": 0, "removed": 0, "opened": 0, "clicked": 0,
            "created_at": now_iso(),
        })
        return {"sent": 0, "removed": 0}
    payload_obj = {"title": title, "body": body, "url": url, "tag": tag, "hid": hid}
    if sound:
        payload_obj["sound"] = sound
    payload = json.dumps(payload_obj, ensure_ascii=False)
    sent = 0
    removed = 0
    for s in subs:
        uid = s.get("user_id")
        if uid and uid in opted_out_users:
            continue
        if allowed_users is not None:
            if uid and uid not in allowed_users:
                pref_doc = await db.push_prefs.find_one({"user_id": uid}, {"_id": 0})
                if pref_doc and pref_doc.get("groups") and group_name not in pref_doc["groups"]:
                    continue
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=private_pem,
                vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
            )
            sent += 1
        except WebPushException as ex:
            code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
            if code in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                removed += 1
        except Exception:
            pass
    await db.push_history.insert_one({
        "id": hid, "title": title, "body": body, "url": url, "tag": tag,
        "sent": sent, "removed": removed, "opened": 0, "clicked": 0,
        "created_at": now_iso(),
    })
    return {"sent": sent, "removed": removed}


@api_router.post("/push/history/{hid}/opened")
async def push_history_opened(hid: str):
    await db.push_history.update_one({"id": hid}, {"$inc": {"opened": 1}})
    return {"ok": True}


@api_router.post("/push/history/{hid}/clicked")
async def push_history_clicked(hid: str):
    await db.push_history.update_one({"id": hid}, {"$inc": {"clicked": 1}})
    return {"ok": True}


@api_router.get("/push/history")
async def push_history(_: dict = Depends(require_admin)):
    cursor = db.push_history.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
    return await cursor.to_list(50)


class PushTemplateBody(BaseModel):
    name: str
    title: str
    body: str
    url: Optional[str] = "/"
    sound: Optional[str] = "rally"


@api_router.get("/push/templates")
async def push_templates_list(_: dict = Depends(require_admin)):
    cursor = db.push_templates.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
    return await cursor.to_list(50)


@api_router.post("/push/templates")
async def push_template_create(body: PushTemplateBody, _: dict = Depends(require_admin)):
    sound = (body.sound or "rally").strip().lower()
    if sound not in {"rally", "victory", "dungeon", "alarm"}:
        sound = "rally"
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "title": body.title.strip(),
        "body": body.body.strip(),
        "url": (body.url or "/").strip(),
        "sound": sound,
        "created_at": now_iso(),
    }
    await db.push_templates.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/push/templates/{tpl_id}")
async def push_template_delete(tpl_id: str, _: dict = Depends(require_admin)):
    r = await db.push_templates.delete_one({"id": tpl_id})
    return {"deleted": r.deleted_count}


class PushTemplateSoundBody(BaseModel):
    sound: str


@api_router.patch("/push/templates/{tpl_id}/sound")
async def push_template_update_sound(tpl_id: str, body: PushTemplateSoundBody, _: dict = Depends(require_admin)):
    sound = (body.sound or "").strip().lower()
    if sound not in {"rally", "victory", "dungeon", "alarm"}:
        raise HTTPException(status_code=400, detail="invalid sound")
    r = await db.push_templates.update_one({"id": tpl_id}, {"$set": {"sound": sound}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="template not found")
    return {"id": tpl_id, "sound": sound}


class PushScheduledBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    scheduled_at: str
    repeat: Optional[str] = None  # 'daily' | 'weekly' | None
    group_name: Optional[str] = None  # optional event group tag for filtering
    alliance_name: Optional[str] = None  # optional alliance filter
    country_iso2: Optional[str] = None  # optional ISO2 country filter
    event_id: Optional[str] = None      # optional attendance filter (only members marked attending this event)
    sound: Optional[str] = "rally"  # rally | victory | dungeon | alarm
    send_channel: Optional[bool] = True    # ALSO broadcast to TELEGRAM_CHANNEL_ID when firing (default on)
    send_dm: Optional[bool] = True         # ALSO DM attending members via linked telegram_chat_id / telegram_username fallback


@api_router.get("/push/scheduled")
async def push_scheduled_list(include_sent: bool = False, _: dict = Depends(require_admin)):
    """List scheduled push reminders. When `include_sent=true`, also return
    already-fired items (last 100) so admins can audit past delivery.
    Each item is merged with its `push_history` counterpart (matched by
    `tag=scheduled-{id}`) so the UI can render a fan-out badge:
    Web-Push `sent`, `telegram_channel_sent`, `telegram_dm_sent`.
    """
    query = {} if include_sent else {"sent": False}
    docs = await db.push_scheduled.find(query, {"_id": 0}).sort("scheduled_at", -1 if include_sent else 1).limit(200).to_list(200)
    if not docs:
        return []
    # Merge push_history metrics for any doc that has fired.
    fired_ids = [d["id"] for d in docs if d.get("sent")]
    hist_by_tag: Dict[str, dict] = {}
    if fired_ids:
        tags = [f"scheduled-{i}" for i in fired_ids]
        async for h in db.push_history.find(
            {"tag": {"$in": tags}},
            {"_id": 0, "tag": 1, "sent": 1, "removed": 1,
             "telegram_channel_sent": 1, "telegram_dm_sent": 1,
             "telegram_dm_translated": 1, "telegram_dm_langs": 1}
        ):
            hist_by_tag[h["tag"]] = h
    for d in docs:
        h = hist_by_tag.get(f"scheduled-{d['id']}")
        if h:
            d["push_sent"] = int(h.get("sent") or 0)
            d["push_removed"] = int(h.get("removed") or 0)
            d["telegram_channel_sent"] = bool(h.get("telegram_channel_sent") or False)
            d["telegram_dm_sent"] = int(h.get("telegram_dm_sent") or 0)
            d["telegram_dm_translated"] = int(h.get("telegram_dm_translated") or 0)
            d["telegram_dm_langs"] = h.get("telegram_dm_langs") or {}
    return docs


@api_router.post("/push/scheduled")
async def push_scheduled_create(body: PushScheduledBody, _: dict = Depends(require_admin)):
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    try:
        when = _dt.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "invalid scheduled_at (must be ISO8601)")
    # Guard: no scheduling in the past (allow a 60s grace window for clock drift).
    now = _dt.now(_tz.utc)
    if when < now - _td(seconds=60):
        raise HTTPException(400, "scheduled_at is in the past")
    valid_sounds = {"rally", "victory", "dungeon", "alarm"}
    sound = (body.sound or "rally").lower()
    if sound not in valid_sounds:
        sound = "rally"
    doc = {
        "id": str(uuid.uuid4()),
        "title": body.title.strip(),
        "body": body.body.strip(),
        "url": (body.url or "/").strip(),
        "scheduled_at": body.scheduled_at,
        "repeat": (body.repeat or None),
        "group_name": (body.group_name or None),
        "alliance_name": (body.alliance_name or None),
        "country_iso2": (body.country_iso2 or None),
        "event_id": (body.event_id or None),
        "sound": sound,
        "send_channel": bool(body.send_channel) if body.send_channel is not None else True,
        "send_dm": bool(body.send_dm) if body.send_dm is not None else True,
        "sent": False,
        "created_at": now_iso(),
    }
    await db.push_scheduled.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/push/scheduled/{sch_id}")
async def push_scheduled_delete(sch_id: str, _: dict = Depends(require_admin)):
    r = await db.push_scheduled.delete_one({"id": sch_id})
    return {"deleted": r.deleted_count}


class PushTestBody(BaseModel):
    title: Optional[str] = "🧪 Test Bildirimi"
    body: Optional[str] = "Bu bir test mesajıdır — kurulumun çalıştığını doğruluyoruz."
    send_channel: Optional[bool] = True
    send_dm: Optional[bool] = True
    send_push: Optional[bool] = True
    fan_out: Optional[bool] = False


# Country ISO 3166-1 alpha-2 → DeepL i18n target language code (matches
# DEEPL_LANG_MAP keys so `_deepl_translate_one` routes to the correct DeepL
# language). Extend as new member countries appear. Countries mapped to "tr"
# are the source language — no translation is attempted. Countries missing
# from this map fall through to TR (safe default).
COUNTRY_TO_LANG = {
    # Russian (RU + CIS neighbours that primarily read Russian)
    "RU": "ru", "BY": "ru", "KZ": "ru", "KG": "ru", "TJ": "ru", "UZ": "ru",
    # German
    "DE": "de", "AT": "de", "CH": "de", "LI": "de",
    # English (US + Commonwealth + other English-primary markets)
    "US": "en", "GB": "en", "UK": "en", "CA": "en", "AU": "en", "NZ": "en",
    "IE": "en", "IN": "en", "ZA": "en", "SG": "en", "PH": "en",
    # French
    "FR": "fr", "BE": "fr", "LU": "fr", "MC": "fr",
    # Spanish (Spain + LATAM)
    "ES": "es", "MX": "es", "AR": "es", "CO": "es", "CL": "es", "PE": "es",
    "VE": "es", "UY": "es", "PY": "es", "EC": "es", "BO": "es", "DO": "es",
    "CR": "es", "GT": "es", "HN": "es", "NI": "es", "PA": "es", "SV": "es",
    # Italian
    "IT": "it", "SM": "it", "VA": "it",
    # Portuguese — European (PT/AO/MZ) uses "pt"→PT-PT, Brazilian (BR) uses
    # "pt-br"→PT-BR. DeepL supports both variants natively.
    "PT": "pt", "AO": "pt", "MZ": "pt",
    "BR": "pt-br",
    # Dutch
    "NL": "nl",
    # Polish
    "PL": "pl",
    # Ukrainian
    "UA": "uk",
    # Turkish — source language, no translation attempted
    "TR": "tr",
    # East Asia
    "JP": "ja",
    "KR": "ko",
    "CN": "zh", "TW": "zh", "HK": "zh", "MO": "zh",
    # Scandinavian
    "SE": "sv", "DK": "da", "NO": "nb", "FI": "fi",
    # Central/Eastern Europe
    "CZ": "cs", "SK": "sk", "SI": "sl", "HU": "hu",
    "RO": "ro", "MD": "ro", "BG": "bg",
    "GR": "el", "CY": "el",
    # Baltic
    "EE": "et", "LV": "lv", "LT": "lt",
    # SE Asia
    "ID": "id",
}


async def _resolve_dm_lang_for_chat(chat_id: str) -> Tuple[Optional[str], Optional[str]]:
    """Resolve a Telegram chat_id → (deepl_lang_code, country_iso2) based on
    the LINKED MEMBER's country field in the Members table. Country-based
    routing overrides any user-profile language preference; a member marked
    country="RU" always receives Russian DMs regardless of their UI settings.

    Walks 3 paths, first match wins:
      A) users.telegram_chat_id (Widget) → users.member_ids → members.country
      B) chat_map.username_lc → members.telegram_username → members.country
      C) chat_map.username_lc → users.telegram_username → users.member_ids → members.country

    Returns (None, None) when the chat_id resolves to no member, no country
    field, or a country whose mapped language is TR (source). The country is
    still returned when known so callers can log 'country=X → source lang'.
    """
    if not chat_id:
        return (None, None)
    cid_str = str(chat_id)
    try:
        cid_or = [cid_str, int(cid_str)]
    except Exception:
        cid_or = [cid_str]

    async def _country_from_member_ids(ids) -> Optional[str]:
        if not ids:
            return None
        async for m in db.members.find(
            {"id": {"$in": list(ids)}, "country": {"$exists": True, "$ne": None}},
            {"_id": 0, "country": 1}
        ):
            c = (m.get("country") or "").strip().upper()
            if c:
                return c
        return None

    country: Optional[str] = None
    # (A) Widget-linked user → member_ids → country
    u = await db.users.find_one(
        {"telegram_chat_id": {"$in": cid_or},
         "notification_enabled": {"$ne": False}},
        {"_id": 0, "member_ids": 1, "member_id": 1}
    )
    if u:
        ids = list(u.get("member_ids") or [])
        if u.get("member_id"):
            ids.append(u["member_id"])
        country = await _country_from_member_ids(ids)
    # (B/C) chat_map fallback → member (direct) or user (via handle)
    if not country:
        m = await db.telegram_chat_map.find_one(
            {"chat_id": {"$in": cid_or}}, {"_id": 0, "username_lc": 1}
        )
        if m and m.get("username_lc"):
            handle = m["username_lc"].strip()
            # (B) direct match via members.telegram_username
            mem = await db.members.find_one(
                {"telegram_username": {"$regex": f"^{handle}$", "$options": "i"}},
                {"_id": 0, "country": 1}
            )
            if mem:
                c = (mem.get("country") or "").strip().upper()
                if c:
                    country = c
            # (C) users.telegram_username → member_ids → country
            if not country:
                u3 = await db.users.find_one(
                    {"telegram_username": {"$regex": f"^{handle}$", "$options": "i"},
                     "notification_enabled": {"$ne": False}},
                    {"_id": 0, "member_ids": 1, "member_id": 1}
                )
                if u3:
                    ids = list(u3.get("member_ids") or [])
                    if u3.get("member_id"):
                        ids.append(u3["member_id"])
                    country = await _country_from_member_ids(ids)

    if not country:
        return (None, None)
    lang = COUNTRY_TO_LANG.get(country)
    if not lang or lang == "tr":
        return (None, country)
    return (lang, country)


async def _lookup_chat_owner_hint(chat_id: str) -> str:
    """Return a short human-readable owner hint for a chat_id used only in
    log lines (e.g. "user=pasha via widget" or "handle=@benselim via chat_map").
    Never raises — falls back to "unknown" on any DB error."""
    try:
        cid = str(chat_id)
        try:
            cid_or = [cid, int(cid)]
        except Exception:
            cid_or = [cid]
        u = await db.users.find_one(
            {"telegram_chat_id": {"$in": cid_or}},
            {"_id": 0, "username": 1}
        )
        if u and u.get("username"):
            return f"user={u['username']} via widget"
        m = await db.telegram_chat_map.find_one(
            {"chat_id": {"$in": cid_or}}, {"_id": 0, "username_lc": 1}
        )
        if m and m.get("username_lc"):
            return f"handle=@{m['username_lc']} via chat_map"
    except Exception:
        pass
    return "unknown"


async def _dm_translate_and_send(chat_id: str, text: str,
                                  reply_markup: Optional[dict] = None,
                                  cache: Optional[Dict[str, str]] = None,
                                  *, precomputed_lang: Optional[str] = None,
                                  precomputed_country: Optional[str] = None,
                                  image_url: Optional[str] = None) -> tuple:
    """Central helper: resolve recipient's DM language from the linked
    Member's COUNTRY field, translate the body via DeepL if the mapped
    target language differs from the source, then dispatch via Telegram
    send_message.

    Country-based routing: `members.country` = "RU" → Russian DM regardless
    of the user's UI language preference. See `COUNTRY_TO_LANG` above.

    Returns (ok: bool, translated: bool, lang: Optional[str]). Every branch
    is traced via the `telegram` logger so prod issues can be diagnosed from
    backend.err.log — search for `dm_translate` to see the resolution path.

    Log grammar (all prefixed `dm_translate`):
      • enter    — every DM attempt (chat_id + payload length)
      • resolved — country+lang resolution outcome + owner hint
      • call     — RIGHT BEFORE hitting DeepL (proves we tried to translate)
      • ok       — DeepL succeeded, source/output length
      • cache_hit — served from per-broadcast cache
      • empty    — DeepL responded but returned no text (rare)
      • skip     — DeepL threw (network / quota / auth)
      • none     — recipient's member has no country / country maps to source
      • sent     — Telegram sendMessage HTTP outcome

    `cache` is a per-broadcast dict {lang → translated_text} so fan-outs to
    multiple recipients sharing the same language hit DeepL only once.

    `precomputed_lang` / `precomputed_country` let batch callers skip the
    per-chat DB round-trip when they've already resolved everything upstream.
    """
    from telegram_bot import send_message as _tg_send, send_photo as _tg_photo
    _tglog = logging.getLogger("telegram")
    if not chat_id:
        _tglog.warning("dm_translate enter — empty chat_id, aborting")
        return (False, False, None)
    _tglog.info(f"dm_translate enter chat={chat_id} text_len={len(text)}")
    if precomputed_lang is not None or precomputed_country is not None:
        target_lang, country = precomputed_lang, precomputed_country
    else:
        target_lang, country = await _resolve_dm_lang_for_chat(chat_id)
    owner_hint = await _lookup_chat_owner_hint(chat_id)
    country_str = country or "unknown"
    out_text = text
    translated = False
    if target_lang:
        _tglog.info(
            f"dm_translate resolved chat={chat_id} {owner_hint} "
            f"country={country_str} → lang={target_lang}"
        )
        if cache is not None and target_lang in cache:
            out_text = cache[target_lang]
            translated = True
            _tglog.info(f"dm_translate cache_hit chat={chat_id} lang={target_lang}")
        else:
            _tglog.info(
                f"dm_translate call chat={chat_id} {owner_hint} country={country_str} "
                f"lang={target_lang} src_len={len(text)} → calling DeepL"
            )
            try:
                tr_map = await _deepl_translate_one(text, target_langs=[target_lang])
                got = tr_map.get(target_lang)
                if got:
                    out_text = got
                    translated = True
                    if cache is not None:
                        cache[target_lang] = got
                    _tglog.info(f"dm_translate ok chat={chat_id} lang={target_lang} src_len={len(text)} out_len={len(got)}")
                else:
                    _tglog.warning(
                        f"dm_translate empty chat={chat_id} lang={target_lang} — "
                        f"DeepL API error: no translation returned (check DEEPL_API_KEY + quota + supported lang)"
                    )
            except Exception as _e:
                _tglog.warning(
                    f"dm_translate skip chat={chat_id} lang={target_lang} — "
                    f"DeepL API error: {type(_e).__name__}: {_e}"
                )
    else:
        reason = (
            f"country={country} maps to source language (TR) → sending original text"
            if country else
            "no linked member OR member has no country set → sending original text"
        )
        _tglog.info(f"dm_translate none chat={chat_id} {owner_hint} — {reason}")
    if image_url:
        ok = await _tg_photo(chat_id, image_url, caption=out_text, reply_markup=reply_markup)
    else:
        ok = await _tg_send(chat_id, out_text, reply_markup=reply_markup)
    _tglog.info(
        f"dm_translate sent chat={chat_id} country={country_str} lang={target_lang or 'src'} "
        f"translated={translated} telegram_ok={ok} out_len={len(out_text)}"
    )
    return (bool(ok), translated, target_lang)


@api_router.post("/push/test")
async def push_test(body: PushTestBody, user: dict = Depends(require_admin)):
    """Sanity test. When ``fan_out=True`` DMs every linked user (Widget or
    /start capture); otherwise only the caller. Returns per-user delivery
    details so admins see exactly who received the message."""
    from telegram_bot import send_message as _tg_send
    title = (body.title or "🧪 Test Bildirimi").strip()
    msg = (body.body or "Test").strip()
    result: dict = {"push_sent": 0, "telegram_channel_sent": False}
    # 1) Web Push
    if body.send_push:
        try:
            push_res = await _broadcast_push(
                title, msg, "/etkinlik-bildirimleri", tag=f"test-{uuid.uuid4()}",
                sound="alarm",
            )
            if isinstance(push_res, dict):
                result["push_sent"] = int(push_res.get("sent") or 0)
        except Exception as e:
            result["push_error"] = str(e)
    # 2) Telegram channel
    if body.send_channel and os.environ.get("TELEGRAM_CHANNEL_ID", "").strip():
        try:
            result["telegram_channel_sent"] = await _tg_send(
                os.environ["TELEGRAM_CHANNEL_ID"].strip(),
                f"🧪 *{title}*\n\n{msg}"
            )
        except Exception as e:
            result["telegram_channel_error"] = str(e)
    # 3) Telegram DM(s) — fan-out when requested
    result["telegram_dm_sent"] = 0
    result["telegram_dm_failed"] = 0
    result["telegram_dm_translated"] = 0
    result["telegram_dm_langs"] = {}
    result["dm_details"] = []
    if body.send_dm:
        targets: List[Dict[str, str]] = []
        seen: set = set()
        if body.fan_out:
            async for u in db.users.find(
                {"telegram_chat_id": {"$exists": True, "$ne": None},
                 "notification_enabled": {"$ne": False}},
                {"_id": 0, "username": 1, "telegram_chat_id": 1}
            ):
                cid = str(u.get("telegram_chat_id") or "")
                if cid and cid not in seen:
                    seen.add(cid)
                    targets.append({"username": u.get("username") or "?", "chat_id": cid, "source": "widget"})
            async for m in db.telegram_chat_map.find({}, {"_id": 0, "username": 1, "chat_id": 1}):
                cid = str(m.get("chat_id") or "")
                if cid and cid not in seen:
                    seen.add(cid)
                    targets.append({"username": f"@{m.get('username') or '?'}", "chat_id": cid, "source": "chat_map"})
        else:
            udoc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "username": 1, "telegram_chat_id": 1, "telegram_username": 1})
            cid = (udoc or {}).get("telegram_chat_id")
            if cid:
                targets.append({"username": udoc.get("username") or "?", "chat_id": str(cid), "source": "widget"})
            else:
                uh = (udoc or {}).get("telegram_username")
                if uh:
                    e = await db.telegram_chat_map.find_one({"username_lc": uh.lower().lstrip("@")}, {"_id": 0, "chat_id": 1})
                    if e and e.get("chat_id"):
                        targets.append({"username": udoc.get("username") or "?", "chat_id": str(e["chat_id"]), "source": "chat_map"})
        # DM fan-out with per-recipient DeepL translation. Same shared helper
        # (`_dm_translate_and_send`) as scheduled/attendance/country broadcast
        # so a test push behaves identically to a real one.
        _tr_cache: Dict[str, str] = {}
        for tgt in targets:
            try:
                ok, translated, lang = await _dm_translate_and_send(
                    tgt["chat_id"], f"🧪 *{title}*\n\n{msg}", cache=_tr_cache,
                )
            except Exception as e:
                ok = False
                translated = False
                lang = None
                tgt["error"] = str(e)[:80]
            tgt["sent"] = bool(ok)
            if translated:
                tgt["translated"] = lang
            if ok:
                result["telegram_dm_sent"] += 1
                lang_key = lang if lang else "src"
                result["telegram_dm_langs"][lang_key] = result["telegram_dm_langs"].get(lang_key, 0) + 1
                if translated:
                    result["telegram_dm_translated"] += 1
            else:
                result["telegram_dm_failed"] += 1
            result["dm_details"].append(tgt)
        result["dm_targets_total"] = len(targets)
    return result


@api_router.get("/telegram/dm-status")
async def telegram_dm_status(user: dict = Depends(require_auth)):
    """Diagnostic: returns exactly WHY the current admin's Telegram DM may or
    may not work. Powers the "Telegram Kurulum" card so the user can self-fix
    without waiting on support.

    Returns:
      bot_configured        — TELEGRAM_BOT_TOKEN set on server
      bot_username          — human handle for the /start deep-link
      user_chat_id          — chat_id linked via Login Widget on user profile
      user_telegram_username — @handle stored on user profile
      chat_map_hit          — chat_id captured via /start webhook fallback
      linked_member_ids     — members attached to this user
      ready_for_dm          — final overall verdict
      next_step             — human-readable action to unlock DM
    """
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    bot_username = os.environ.get("TELEGRAM_BOT_USERNAME", "TiTaNXiS_BoT").strip()
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()

    udoc = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "username": 1, "telegram_chat_id": 1, "telegram_username": 1,
         "telegram_id": 1, "member_ids": 1, "member_id": 1}
    ) or {}
    chat_id = udoc.get("telegram_chat_id")
    handle = (udoc.get("telegram_username") or "").strip().lstrip("@").strip()
    chat_map_hit = None
    if handle:
        entry = await db.telegram_chat_map.find_one(
            {"username_lc": handle.lower()}, {"_id": 0, "chat_id": 1, "updated_at": 1}
        )
        if entry and entry.get("chat_id"):
            chat_map_hit = entry["chat_id"]
    linked = list(udoc.get("member_ids") or [])
    if udoc.get("member_id"):
        linked.append(udoc["member_id"])
    ready = bool(bot_token and (chat_id or chat_map_hit))
    if not bot_token:
        step = "Sunucuda TELEGRAM_BOT_TOKEN yapılandırılmamış — admine bildir"
    elif chat_id:
        step = "Hazır — DM'ler Telegram Login Widget aracılığıyla gidiyor"
    elif chat_map_hit:
        step = "Hazır — DM'ler @kullanıcı adı üzerinden gidiyor"
    elif handle:
        step = f"Son adım: @{bot_username}'a Telegram'dan bir kere /start gönder"
    else:
        step = "Profil sayfandan Telegram Login Widget'ı ile bağlan VEYA profil sayfasına Telegram @kullanıcı adını yaz ve @{bot} bota /start at".format(bot=bot_username)
    return {
        "bot_configured": bool(bot_token),
        "channel_configured": bool(channel),
        "bot_username": bot_username,
        "bot_start_url": f"https://t.me/{bot_username}",
        "user_chat_id": chat_id,
        "user_telegram_username": handle or None,
        "chat_map_hit": chat_map_hit,
        "chat_map_count_global": await db.telegram_chat_map.count_documents({}),
        "linked_member_ids": linked,
        "ready_for_dm": ready,
        "next_step": step,
    }


class PushSnoozeBody(BaseModel):
    minutes: int = 15


@api_router.post("/push/scheduled/{sch_id}/snooze")
async def push_scheduled_snooze(sch_id: str, body: PushSnoozeBody, _: dict = Depends(require_admin)):
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    minutes = int(body.minutes if body.minutes is not None else 15)
    if minutes < 1 or minutes > 24 * 60:
        raise HTTPException(400, "minutes must be between 1 and 1440")
    doc = await db.push_scheduled.find_one({"id": sch_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "scheduled push not found")
    # Push the scheduled_at forward by N minutes. If the item is already in the past
    # (a rare race with the 60s scheduler tick), snooze from now instead.
    try:
        when = _dt.fromisoformat(doc["scheduled_at"].replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "corrupt scheduled_at")
    base = max(when, _dt.now(_tz.utc))
    new_when = base + _td(minutes=minutes)
    await db.push_scheduled.update_one(
        {"id": sch_id},
        {"$set": {"scheduled_at": new_when.isoformat(), "snoozed_at": now_iso(), "snoozed_by_minutes": minutes}},
    )
    updated = await db.push_scheduled.find_one({"id": sch_id}, {"_id": 0})
    return updated


async def _send_tg_channel(doc: dict) -> dict:
    """Broadcast the scheduled push to the Telegram GROUP channel only.
    Isolated from DM fan-out so the scheduler can run both concurrently via
    `asyncio.gather` — a slow/failing channel call no longer delays DMs.

    When `doc.image_url` is provided we use `sendPhoto` (caption up to 1024
    chars) so announcements render as a rich card in the group; otherwise
    fall back to plain `sendMessage`."""
    from telegram_bot import send_message as _tg_send, send_photo as _tg_photo
    out = {"channel_sent": False}
    if not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        return out
    if not doc.get("send_channel", True):
        return out
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if not channel:
        return out
    title = (doc.get("title") or "").strip()
    body_txt = (doc.get("body") or "").strip()
    text_lines = [f"🔔 *{title}*"] if title else []
    if body_txt:
        text_lines.append("")
        text_lines.append(body_txt)
    text = "\n".join(text_lines) or "🔔 Etkinlik hatırlatması"
    img = (doc.get("image_url") or "").strip()
    if img:
        out["channel_sent"] = await _tg_photo(channel, img, caption=text)
    else:
        out["channel_sent"] = await _tg_send(channel, text)
    return out


async def _send_tg_dms(doc: dict) -> dict:
    """DM fan-out to every linked user (Widget + chat_map fallback). Sits
    behind the same country-based DeepL translation helper as before but is
    now callable independently of the channel broadcast so the scheduler can
    run both in parallel via `asyncio.gather`."""
    _tglog = logging.getLogger("telegram")
    stats = {"dm_sent": 0, "dm_username_hits": 0,
             "dm_translated": 0, "dm_lang_breakdown": {}}
    if not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        return stats
    if not doc.get("send_dm", True):
        return stats
    title = (doc.get("title") or "").strip()
    body_txt = (doc.get("body") or "").strip()
    text_lines = [f"🔔 *{title}*"] if title else []
    if body_txt:
        text_lines.append("")
        text_lines.append(body_txt)
    text = "\n".join(text_lines) or "🔔 Etkinlik hatırlatması"
    event_id = doc.get("event_id")
    att_ids: set = set()
    if event_id:
        att = await db.event_attendance.find_one(
            {"event_id": event_id}, {"_id": 0, "member_ids": 1}
        )
        att_ids = set(att.get("member_ids") or []) if att else set()
    chat_ids: Dict[str, bool] = {}
    async for u in db.users.find(
        {"telegram_chat_id": {"$exists": True, "$ne": None},
         "notification_enabled": {"$ne": False}},
        {"_id": 0, "telegram_chat_id": 1, "member_ids": 1, "member_id": 1}
    ):
        cid = str(u.get("telegram_chat_id") or "")
        if not cid:
            continue
        linked = list(u.get("member_ids") or [])
        if u.get("member_id"):
            linked.append(u["member_id"])
        is_att = bool(att_ids and any(mid in att_ids for mid in linked))
        chat_ids[cid] = chat_ids.get(cid, False) or is_att
    async for m in db.telegram_chat_map.find({}, {"_id": 0, "username_lc": 1, "chat_id": 1}):
        cid = str(m.get("chat_id") or "")
        if not cid or cid in chat_ids:
            continue
        username_lc = (m.get("username_lc") or "").strip()
        is_att = False
        if username_lc and att_ids:
            mem = await db.members.find_one(
                {"telegram_username": {"$regex": f"^{username_lc}$", "$options": "i"},
                 "id": {"$in": list(att_ids)}},
                {"_id": 0, "id": 1}
            )
            if mem:
                is_att = True
                stats["dm_username_hits"] += 1
        chat_ids[cid] = is_att
    _tglog.info(f"send_tg_dms sched_id={doc.get('id')} chat_ids={len(chat_ids)} (country-based translation)")
    tr_cache: Dict[str, str] = {}
    for cid, is_att in chat_ids.items():
        markup = None
        if event_id and is_att:
            markup = {
                "inline_keyboard": [[
                    {"text": "✅ Katılıyorum", "callback_data": f"att:yes:{event_id}"},
                    {"text": "❌ Katılamam", "callback_data": f"att:no:{event_id}"},
                ]]
            }
        ok, translated, _lang = await _dm_translate_and_send(
            cid, text, reply_markup=markup, cache=tr_cache,
            image_url=doc.get("image_url"),
        )
        if ok:
            stats["dm_sent"] += 1
            lang_key = _lang if _lang else "src"
            stats["dm_lang_breakdown"][lang_key] = (
                stats["dm_lang_breakdown"].get(lang_key, 0) + 1
            )
            if translated:
                stats["dm_translated"] += 1
    return stats


# In-memory SSE pubsub for real-time notification push. One queue per open
# EventSource connection, indexed by user_id. Publisher (`_publish_notif`)
# fans out from `_broadcast_in_app` right after the DB insert so subscribers
# see the row within milliseconds instead of waiting for the 30s poll.
SSE_NOTIF_SUBSCRIBERS: Dict[str, List[Any]] = {}


def _publish_notif(user_id: str, payload: dict) -> None:
    """Fire-and-forget: push a notification payload to every open SSE queue
    for this user. Dead queues (full/closed) are silently dropped."""
    queues = SSE_NOTIF_SUBSCRIBERS.get(user_id) or []
    for q in list(queues):
        try:
            q.put_nowait(payload)
        except Exception:
            try:
                queues.remove(q)
            except ValueError:
                pass


async def _broadcast_in_app(doc: dict) -> dict:
    """Fan-out to the in-app notification centre. Inserts one document per
    linked user into `in_app_notifications` — the header bell icon polls
    this collection and renders unread rows with a red badge. Independent
    of every other channel so a Telegram outage never blocks users who
    have the app open."""
    stats = {"app_notif_sent": 0}
    if not doc.get("send_app", True):
        return stats
    title = (doc.get("title") or "").strip() or "🔔 Bildirim"
    body_txt = (doc.get("body") or "").strip()
    url = doc.get("url") or "/etkinlik-bildirimleri"
    event_id = doc.get("event_id")
    # Target set: attending users if event_id given, else every user with
    # notification_enabled != False. Editors + admins always receive so ops
    # get feedback that the notification actually fired.
    target_user_ids: set = set()
    if event_id:
        att = await db.event_attendance.find_one(
            {"event_id": event_id}, {"_id": 0, "member_ids": 1}
        )
        att_member_ids = set(att.get("member_ids") or []) if att else set()
        async for u in db.users.find(
            {"notification_enabled": {"$ne": False}},
            {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1, "role": 1}
        ):
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            if (u.get("role") in ("admin", "editor") or
                any(mid in att_member_ids for mid in linked)):
                target_user_ids.add(u["id"])
    else:
        async for u in db.users.find(
            {"notification_enabled": {"$ne": False}}, {"_id": 0, "id": 1}
        ):
            target_user_ids.add(u["id"])
    if not target_user_ids:
        return stats
    now = now_iso()
    rows = [{
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "title": title,
        "body": body_txt,
        "url": url,
        "event_id": event_id,
        "sched_id": doc.get("id"),
        "created_at": now,
        "read": False,
    } for uid in target_user_ids]
    try:
        await db.in_app_notifications.insert_many(rows)
        stats["app_notif_sent"] = len(rows)
        # Real-time push: notify every open SSE subscriber for these users so
        # the header bell badge updates within milliseconds rather than at the
        # next 30s poll interval. Skipped users (no active SSE) simply pick it
        # up on their next poll — the SWR cache reconciles either way.
        for r in rows:
            _publish_notif(r["user_id"], {
                "id": r["id"], "title": r["title"], "body": r["body"],
                "url": r["url"], "event_id": r.get("event_id"),
                "sched_id": r.get("sched_id"), "created_at": r["created_at"],
                "read": False,
            })
    except Exception as _e:
        logger.warning(f"in-app notif insert failed for sched {doc.get('id')}: {_e}")
    return stats


async def _telegram_forward_scheduled(doc: dict) -> dict:
    """When a scheduled push fires, mirror it to Telegram: channel broadcast +
    DM to every attending member (via linked telegram_chat_id, then username→chat
    map fallback). Runs alongside the Web Push fan-out so users on any channel
    (Web Push, Telegram channel follower, or DM-linked) get the notification.
    Controlled by `send_channel` / `send_dm` flags stored on the scheduled doc
    (both default True). Silently no-ops when TELEGRAM_BOT_TOKEN is unset.
    """
    from telegram_bot import send_message as _tg_send
    _tglog = logging.getLogger("telegram")
    stats = {"channel_sent": False, "dm_sent": 0, "dm_username_hits": 0,
             "dm_translated": 0, "dm_lang_breakdown": {}}
    if not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        return stats
    title = (doc.get("title") or "").strip()
    body_txt = (doc.get("body") or "").strip()
    text_lines = [f"🔔 *{title}*"] if title else []
    if body_txt:
        text_lines.append("")
        text_lines.append(body_txt)
    text = "\n".join(text_lines) or "🔔 Etkinlik hatırlatması"
    # 1) Channel broadcast
    if doc.get("send_channel", True):
        channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        if channel:
            stats["channel_sent"] = await _tg_send(channel, text)
    # 2) DM fan-out — reach every linked user, not just attending members.
    #    Previous logic gated on `event_attendance` which meant reminders never
    #    fired for events without prior attendance marks. Now we fan out to
    #    (a) EVERY user with a telegram_chat_id (Widget/manual), plus
    #    (b) EVERY chat_map entry (users that /start-ed the bot), and skip
    #    global opt-out users. Attendance-linked members still receive the
    #    inline ✅/❌ buttons; unlinked users receive the plain reminder text.
    if doc.get("send_dm", True):
        event_id = doc.get("event_id")
        att_ids: set = set()
        if event_id:
            att = await db.event_attendance.find_one(
                {"event_id": event_id}, {"_id": 0, "member_ids": 1}
            )
            att_ids = set(att.get("member_ids") or []) if att else set()
        # Collect (chat_id, is_attending) targets. Language resolution is now
        # 100% country-driven (members.country → COUNTRY_TO_LANG map) so we
        # no longer need to walk preferred_language during target collection —
        # the shared helper handles it per-recipient with its own logging.
        chat_ids: Dict[str, bool] = {}
        # 2a) Users with telegram_chat_id (Login Widget or manual link)
        async for u in db.users.find(
            {"telegram_chat_id": {"$exists": True, "$ne": None},
             "notification_enabled": {"$ne": False}},
            {"_id": 0, "telegram_chat_id": 1, "member_ids": 1, "member_id": 1}
        ):
            cid = str(u.get("telegram_chat_id") or "")
            if not cid:
                continue
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            is_att = bool(att_ids and any(mid in att_ids for mid in linked))
            chat_ids[cid] = chat_ids.get(cid, False) or is_att
        # 2b) chat_map fallback — attendance check via members.telegram_username
        async for m in db.telegram_chat_map.find({}, {"_id": 0, "username_lc": 1, "chat_id": 1}):
            cid = str(m.get("chat_id") or "")
            if not cid or cid in chat_ids:
                continue
            username_lc = (m.get("username_lc") or "").strip()
            is_att = False
            if username_lc and att_ids:
                mem = await db.members.find_one(
                    {"telegram_username": {"$regex": f"^{username_lc}$", "$options": "i"},
                     "id": {"$in": list(att_ids)}},
                    {"_id": 0, "id": 1}
                )
                if mem:
                    is_att = True
                    stats["dm_username_hits"] += 1
            chat_ids[cid] = is_att
        _tglog.info(f"forward_scheduled sched_id={doc.get('id')} chat_ids={len(chat_ids)} (country-based DM translation)")
        # 2c) send with per-recipient country-based translation via the shared
        # helper. tr_cache dedupes DeepL calls across recipients sharing a lang.
        tr_cache: Dict[str, str] = {}
        for cid, is_att in chat_ids.items():
            markup = None
            if event_id and is_att:
                markup = {
                    "inline_keyboard": [[
                        {"text": "✅ Katılıyorum", "callback_data": f"att:yes:{event_id}"},
                        {"text": "❌ Katılamam", "callback_data": f"att:no:{event_id}"},
                    ]]
                }
            ok, translated, _lang = await _dm_translate_and_send(
                cid, text, reply_markup=markup, cache=tr_cache,
            )
            if ok:
                stats["dm_sent"] += 1
                # Track per-language counts so the admin panel can render
                # "ru:3 · pt-br:2 · en:5" chips proving the translation layer
                # is doing its job. Recipients on the source language (TR) get
                # bucketed under "src" so the total stays honest.
                lang_key = _lang if _lang else "src"
                stats["dm_lang_breakdown"][lang_key] = (
                    stats["dm_lang_breakdown"].get(lang_key, 0) + 1
                )
                if translated:
                    stats["dm_translated"] += 1
    return stats


@api_router.get("/notifications/stream")
async def notifications_stream(token: str = Query(...)):
    """Server-Sent Events stream that pushes new notifications the moment
    they're inserted by `_broadcast_in_app`. The client sends its JWT via
    the `token` query param (EventSource doesn't allow custom headers).

    Emits keep-alive comments every 25s to keep the connection open through
    proxies. Auto-cleans the subscriber queue on disconnect.
    """
    from auth import decode_token as _decode
    try:
        payload = _decode(token)
        user_id = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid token")

    import asyncio as _asyncio_sse
    q: "_asyncio_sse.Queue" = _asyncio_sse.Queue(maxsize=100)
    SSE_NOTIF_SUBSCRIBERS.setdefault(user_id, []).append(q)

    async def _gen():
        try:
            # Initial hello — tells the client the stream is live so it can
            # clear any "reconnecting" UI state.
            yield f"event: hello\ndata: {{\"ok\":true}}\n\n"
            while True:
                try:
                    payload = await _asyncio_sse.wait_for(q.get(), timeout=25.0)
                    import json as _json
                    yield f"event: notification\ndata: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                except _asyncio_sse.TimeoutError:
                    yield ": keep-alive\n\n"  # SSE comment ping
        finally:
            try:
                SSE_NOTIF_SUBSCRIBERS.get(user_id, []).remove(q)
            except ValueError:
                pass

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@api_router.get("/notifications")
async def notifications_list(user: dict = Depends(require_auth), limit: int = 30):
    """List the current user's in-app notifications, newest first. The bell
    icon in the header polls this every 30s. Rows include the `read` flag
    so the client can show an unread badge."""
    cursor = db.in_app_notifications.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).limit(max(1, min(limit, 100)))
    rows = [r async for r in cursor]
    unread = sum(1 for r in rows if not r.get("read"))
    return {"items": rows, "unread": unread, "total": len(rows)}


@api_router.post("/notifications/{nid}/read")
async def notifications_mark_read(nid: str, user: dict = Depends(require_auth)):
    """Mark one in-app notification as read. Idempotent."""
    await db.in_app_notifications.update_one(
        {"id": nid, "user_id": user["id"]}, {"$set": {"read": True}}
    )
    return {"ok": True}


@api_router.post("/notifications/read-all")
async def notifications_mark_all_read(user: dict = Depends(require_auth)):
    """Mark every notification for the current user as read."""
    r = await db.in_app_notifications.update_many(
        {"user_id": user["id"], "read": False}, {"$set": {"read": True}}
    )
    return {"updated": r.modified_count}


async def _push_scheduler_loop():
    """Background loop: every 60s, dispatch any due scheduled push broadcasts.
    Recurring items (repeat='daily'/'weekly') are re-armed with a new scheduled_at instead of marked sent.
    """
    import asyncio
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    while True:
        try:
            now = _dt.now(_tz.utc)
            cursor = db.push_scheduled.find({"sent": False})
            async for doc in cursor:
                try:
                    when = _dt.fromisoformat(doc["scheduled_at"].replace("Z", "+00:00"))
                except Exception:
                    continue
                if when <= now:
                    # Dispatch all 4 channels concurrently so no single slow
                    # backend (DeepL, Telegram API, WebPush endpoint) can stall
                    # the others. `return_exceptions=True` guarantees a failure
                    # in one channel never aborts the rest.
                    push_task = _broadcast_push(
                        doc["title"], doc["body"], doc.get("url", "/"),
                        tag=f"scheduled-{doc['id']}",
                        group_name=doc.get("group_name"),
                        alliance_name=doc.get("alliance_name"),
                        country_iso2=doc.get("country_iso2"),
                        event_id=doc.get("event_id"),
                        sound=doc.get("sound") or "rally",
                    )
                    channel_task = _send_tg_channel(doc)
                    dm_task = _send_tg_dms(doc)
                    app_task = _broadcast_in_app(doc)
                    results = await asyncio.gather(
                        push_task, channel_task, dm_task, app_task,
                        return_exceptions=True,
                    )
                    push_result, channel_stats, dm_stats, app_stats = results
                    # Coalesce exceptions into safe defaults so later code can
                    # index into the stats dicts without a crash.
                    if isinstance(push_result, Exception):
                        logger.warning(f"web push failed for {doc.get('id')}: {push_result}")
                        push_result = None
                    if isinstance(channel_stats, Exception):
                        logger.warning(f"telegram channel failed for {doc.get('id')}: {channel_stats}")
                        channel_stats = {"channel_sent": False}
                    if isinstance(dm_stats, Exception):
                        logger.warning(f"telegram dm failed for {doc.get('id')}: {dm_stats}")
                        dm_stats = {"dm_sent": 0, "dm_translated": 0, "dm_lang_breakdown": {}}
                    if isinstance(app_stats, Exception):
                        logger.warning(f"in-app broadcast failed for {doc.get('id')}: {app_stats}")
                        app_stats = {"app_notif_sent": 0}
                    tg_stats = {
                        "channel_sent": channel_stats.get("channel_sent", False),
                        "dm_sent": dm_stats.get("dm_sent", 0),
                        "dm_translated": dm_stats.get("dm_translated", 0),
                        "dm_lang_breakdown": dm_stats.get("dm_lang_breakdown") or {},
                    }
                    logger.info(
                        f"scheduler fired {doc.get('id')} → push={getattr(push_result,'get',lambda k,d:d)('sent',0) if push_result else 0} "
                        f"channel={tg_stats['channel_sent']} dm={tg_stats['dm_sent']} "
                        f"app={app_stats.get('app_notif_sent', 0)}"
                    )
                    # Attach fan-out metrics to push_history for admin visibility.
                    try:
                        if push_result and isinstance(push_result, dict):
                            hist = await db.push_history.find_one({"tag": f"scheduled-{doc['id']}"}, sort=[("created_at", -1)])
                            if hist:
                                await db.push_history.update_one(
                                    {"id": hist["id"]},
                                    {"$set": {"telegram_channel_sent": tg_stats.get("channel_sent", False),
                                              "telegram_dm_sent": tg_stats.get("dm_sent", 0),
                                              "telegram_dm_translated": tg_stats.get("dm_translated", 0),
                                              "telegram_dm_langs": tg_stats.get("dm_lang_breakdown") or {},
                                              "app_notif_sent": app_stats.get("app_notif_sent", 0)}}
                                )
                    except Exception:
                        pass
                    repeat = doc.get("repeat")
                    if repeat == "daily":
                        next_at = when + _td(days=1)
                        while next_at <= now:
                            next_at += _td(days=1)
                        await db.push_scheduled.update_one({"id": doc["id"]}, {"$set": {"scheduled_at": next_at.isoformat(), "last_sent_at": now_iso()}})
                    elif repeat == "weekly":
                        next_at = when + _td(days=7)
                        while next_at <= now:
                            next_at += _td(days=7)
                        await db.push_scheduled.update_one({"id": doc["id"]}, {"$set": {"scheduled_at": next_at.isoformat(), "last_sent_at": now_iso()}})
                    else:
                        await db.push_scheduled.update_one({"id": doc["id"]}, {"$set": {"sent": True, "sent_at": now_iso()}})
        except Exception as ex:
            logger.warning(f"scheduler loop error: {ex}")
        await asyncio.sleep(60)


@app.on_event("startup")
async def _start_push_scheduler():
    import asyncio
    asyncio.create_task(_push_scheduler_loop())
    asyncio.create_task(_announcement_scheduler_loop())
    asyncio.create_task(_trend_alert_loop())


async def _announcement_scheduler_loop():
    """Fire scheduled announcements: every 60s scan for docs where
    `pending_broadcast=True` and `scheduled_at <= now`, then run the same
    4-channel fan-out that `announcements_create` uses for instant sends."""
    import asyncio
    from datetime import datetime as _dt_a, timezone as _tz_a
    while True:
        try:
            now = _dt_a.now(_tz_a.utc)
            cursor = db.announcements.find({"pending_broadcast": True})
            async for doc in cursor:
                try:
                    when = _dt_a.fromisoformat((doc.get("scheduled_at") or "").replace("Z", "+00:00"))
                except Exception:
                    continue
                if when.tzinfo is None:
                    when = when.replace(tzinfo=_tz_a.utc)
                if when > now:
                    continue
                push_doc = {"id": doc["id"], "title": doc["title"], "body": doc["body"],
                            "url": doc.get("url") or "/duyurular",
                            "image_url": doc.get("image_url"),
                            "send_channel": True, "send_dm": True,
                            "send_app": True, "event_id": None}
                push_task = _broadcast_push(
                    doc["title"], doc["body"], doc.get("url") or "/duyurular",
                    tag=f"announcement-{doc['id']}", sound="rally",
                )
                channel_task = _send_tg_channel(push_doc)
                dm_task = _send_tg_dms(push_doc)
                app_task = _broadcast_in_app(push_doc)
                results = await asyncio.gather(
                    push_task, channel_task, dm_task, app_task,
                    return_exceptions=True,
                )
                push_r, ch_r, dm_r, app_r = [
                    (r if not isinstance(r, Exception) else {}) for r in results
                ]
                fanout = {
                    "push_sent": (push_r or {}).get("sent", 0) if isinstance(push_r, dict) else 0,
                    "telegram_channel_sent": (ch_r or {}).get("channel_sent", False),
                    "telegram_dm_sent": (dm_r or {}).get("dm_sent", 0),
                    "telegram_dm_translated": (dm_r or {}).get("dm_translated", 0),
                    "telegram_dm_langs": (dm_r or {}).get("dm_lang_breakdown", {}),
                    "app_notif_sent": (app_r or {}).get("app_notif_sent", 0),
                }
                await db.announcements.update_one(
                    {"id": doc["id"]},
                    {"$set": {
                        "active": True,
                        "pending_broadcast": False,
                        "broadcast_fired_at": now_iso(),
                        "fanout": fanout,
                    }},
                )
                logger.info(f"announcement_scheduler fired {doc['id']} → {fanout}")
        except Exception as ex:
            logger.warning(f"announcement scheduler loop error: {ex}")
        await asyncio.sleep(60)


class PushBroadcastBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    tag: Optional[str] = "titanxis"


class PushTestBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/"
    target: str = "me"  # "me" | "admins" | "user"
    user_id: Optional[str] = None


class PushPrefsBody(BaseModel):
    groups: List[str] = Field(default_factory=list)


@api_router.get("/push/prefs")
async def push_prefs_get(user: dict = Depends(require_auth)):
    doc = await db.push_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
    return doc or {"user_id": user["id"], "groups": []}


@api_router.post("/push/prefs")
async def push_prefs_set(body: PushPrefsBody, user: dict = Depends(require_auth)):
    doc = {"user_id": user["id"], "username": user.get("username"), "groups": body.groups, "updated_at": now_iso()}
    await db.push_prefs.update_one({"user_id": user["id"]}, {"$set": doc}, upsert=True)
    return doc


@api_router.get("/push/event-groups")
async def push_event_groups(_: dict = Depends(require_auth)):
    """Distinct event group names (used by Push Preferences UI)."""
    groups = await db.events.distinct("group_name")
    return sorted([g for g in groups if g])


@api_router.post("/push/broadcast")
async def push_broadcast(body: PushBroadcastBody, _: dict = Depends(require_admin)):
    return await _broadcast_push(body.title, body.body, body.url or "/", body.tag or "titanxis")


@api_router.post("/push/broadcast/test")
async def push_broadcast_test(body: PushTestBody, user: dict = Depends(require_admin)):
    """Send a targeted test push to a small audience so admins can preview a template
    without spamming the whole guild. `target` selects the audience:
      - "me"      → only the calling admin's own subscriptions
      - "admins"  → every subscription whose user is an admin
      - "user"    → a single member (body.user_id)
    """
    target = (body.target or "me").lower()
    user_ids: list[str] = []
    if target == "me":
        user_ids = [user["id"]]
    elif target == "admins":
        admins = await db.users.find({"role": "admin"}, {"_id": 0, "id": 1}).to_list(200)
        user_ids = [a["id"] for a in admins if a.get("id")]
    elif target == "user":
        if not body.user_id:
            raise HTTPException(status_code=400, detail="user_id required for target=user")
        user_ids = [body.user_id]
    else:
        raise HTTPException(status_code=400, detail="invalid target")
    if not user_ids:
        return {"sent": 0, "removed": 0, "target": target, "matched_users": 0}
    subs = await db.push_subscriptions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
    if not subs:
        return {"sent": 0, "removed": 0, "target": target, "matched_users": len(user_ids), "note": "no subscriptions for target users"}
    private_pem, _pub = await _get_or_create_vapid()
    hid = str(uuid.uuid4())
    payload = json.dumps({
        "title": body.title, "body": body.body, "url": body.url or "/",
        "tag": f"test-{hid[:8]}", "hid": hid,
    }, ensure_ascii=False)
    sent = 0
    removed = 0
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                data=payload,
                vapid_private_key=private_pem,
                vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
            )
            sent += 1
        except WebPushException as ex:
            code = getattr(ex.response, "status_code", None)
            if code in (404, 410):
                await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                removed += 1
    return {"sent": sent, "removed": removed, "target": target, "matched_users": len(user_ids)}


import json  # used by push payload

# VIP Destek routes (kept in /app/backend/routes/vip.py — self-contained)
from routes.vip import register_vip  # noqa: E402
register_vip(api_router, db, require_auth, require_admin, logging.getLogger("vip"))

# Premium Dashboard routes (admin + editor only)
from routes.dashboard import register_dashboard  # noqa: E402
register_dashboard(api_router, db, require_edit=require_edit, require_admin=require_admin)

from routes.uploads import register_uploads, init_storage  # noqa: E402
register_uploads(api_router, db, require_auth=require_auth, require_admin=require_admin)
try:
    init_storage()
except Exception as _e:
    logging.getLogger("uploads").warning(f"init_storage at import: {_e}")

# ---------------- Telegram bot webhook -------------------------------------
from telegram_bot import init_bot, setup_webhook, process_update, send_event_notification, send_daily_briefing, send_weekly_summary, send_message  # noqa: E402
init_bot(db)


@api_router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Receives updates from Telegram. Always returns 200 to avoid retry
    storms — errors are logged server-side."""
    try:
        body = await request.json()
        # Capture chat_id ↔ Telegram @username mapping for username-based DM
        # fallback. Runs on ANY inbound message (not just /start) so members who
        # already opened a bot chat once are recognised as soon as they text
        # anything. Handled at the FastAPI layer (not the PTB command handler)
        # because it's simpler and doesn't depend on PTB's async lifecycle.
        try:
            msg = (body or {}).get("message") or {}
            frm = msg.get("from") or {}
            chat = msg.get("chat") or {}
            uname = (frm.get("username") or chat.get("username") or "").strip()
            cid = chat.get("id") or frm.get("id")
            if uname and cid is not None:
                await db.telegram_chat_map.update_one(
                    {"username_lc": uname.lower()},
                    {"$set": {
                        "username_lc": uname.lower(),
                        "username": uname,
                        "chat_id": str(cid),
                        "first_name": frm.get("first_name") or chat.get("first_name"),
                        "updated_at": now_iso(),
                    }},
                    upsert=True,
                )
        except Exception as _e:
            logging.getLogger("telegram").debug(f"chat_map upsert skipped: {_e}")
        # Handle inline attendance button taps ("✅ Katılıyorum" / "❌ Katılamam").
        # We resolve the tapping user's Telegram chat_id → linked member(s) via
        # users.telegram_chat_id or (fallback) telegram_chat_map → member
        # whose telegram_username matches. Then insert/delete an
        # event_attendance row. Response is a compact toast via
        # answerCallbackQuery so the user gets instant feedback without cluttering
        # the chat.
        try:
            cbq = (body or {}).get("callback_query")
            if cbq:
                await _handle_attendance_callback(cbq)
                # Skip PTB processing for callback queries since we handled it here.
                return {"ok": True}
        except Exception as _cbe:
            logging.getLogger("telegram").warning(f"callback handler failed: {_cbe}")
        await process_update(body)
    except Exception as e:
        logging.getLogger("telegram").warning(f"webhook processing failed: {e}")
    return {"ok": True}


async def _handle_attendance_callback(cbq: dict) -> None:
    """Process a Telegram inline-button callback for attendance toggling.

    Expected callback_data formats:
      att:yes:{event_id}   → mark member attending
      att:no:{event_id}    → unmark
    Resolves the tapper's chat_id to member(s), updates event_attendance, then
    answers the callback with a short toast."""
    from telegram_bot import answer_callback_query as _tg_ack
    data = (cbq.get("data") or "").strip()
    cb_id = cbq.get("id") or ""
    if not data.startswith("att:"):
        await _tg_ack(cb_id, "Bilinmeyen komut")
        return
    parts = data.split(":", 2)
    if len(parts) != 3:
        await _tg_ack(cb_id, "Geçersiz veri")
        return
    _prefix, action, event_id = parts
    # No-op button on already-answered DMs — silently ack and bail.
    if action == "noop":
        await _tg_ack(cb_id, "Zaten cevapladın")
        return
    if action not in {"yes", "no"} or not event_id:
        await _tg_ack(cb_id, "Geçersiz seçim")
        return
    frm = cbq.get("from") or {}
    chat_id = str((cbq.get("message") or {}).get("chat", {}).get("id") or frm.get("id") or "")
    uname = (frm.get("username") or "").strip()
    # 1) Resolve member(s): (a) users with matching telegram_chat_id, then
    #    (b) fallback: member whose telegram_username == uname.
    member_ids: List[str] = []
    if chat_id:
        u = await db.users.find_one({"telegram_chat_id": chat_id}, {"_id": 0, "member_ids": 1, "member_id": 1})
        if u:
            for mid in (u.get("member_ids") or []):
                if mid and mid not in member_ids:
                    member_ids.append(mid)
            if u.get("member_id") and u["member_id"] not in member_ids:
                member_ids.append(u["member_id"])
    if not member_ids and uname:
        import re as _re
        m = await db.members.find_one(
            {"telegram_username": {"$regex": f"^{_re.escape(uname)}$", "$options": "i"}},
            {"_id": 0, "id": 1}
        )
        if m and m.get("id"):
            member_ids.append(m["id"])
    if not member_ids:
        await _tg_ack(cb_id, "Hesabın henüz bir üyeye bağlı değil — admine sor", show_alert=True)
        return
    # 2) Verify event exists
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "name": 1})
    if not ev:
        await _tg_ack(cb_id, "Etkinlik bulunamadı", show_alert=True)
        return
    # 3) Apply toggle
    now = now_iso()
    original_text = ((cbq.get("message") or {}).get("text") or "").strip()
    msg_id = (cbq.get("message") or {}).get("message_id")
    from telegram_bot import edit_message_text as _tg_edit
    if action == "yes":
        for mid in member_ids:
            await db.event_attendance.update_one(
                {"event_id": event_id, "member_id": mid},
                {"$set": {"event_id": event_id, "member_id": mid, "created_at": now, "source": "telegram_dm"}},
                upsert=True,
            )
        await _tg_ack(cb_id, f"✅ '{ev['name']}' için katılım kaydedildi")
        # Rewrite the DM with a completed footer + collapsed inline keyboard so
        # the user sees a clear "already answered" state instead of two live
        # buttons that could confuse a re-tap.
        footer = f"\n\n✅ *Cevabın kaydedildi — Katılıyorsun*"
        stamped = (original_text or f"🔔 {ev['name']}") + footer
        collapsed = {"inline_keyboard": [[{"text": "✓ Cevaplandı — değiştirmek için admine yaz", "callback_data": "att:noop"}]]}
        if chat_id and msg_id:
            await _tg_edit(chat_id, msg_id, stamped, reply_markup=collapsed)
    else:
        for mid in member_ids:
            await db.event_attendance.delete_one({"event_id": event_id, "member_id": mid})
        await _tg_ack(cb_id, f"❌ '{ev['name']}' katılımın kaldırıldı")
        footer = f"\n\n❌ *Cevabın kaydedildi — Katılamıyorsun*"
        stamped = (original_text or f"🔔 {ev['name']}") + footer
        collapsed = {"inline_keyboard": [[{"text": "✓ Cevaplandı — değiştirmek için admine yaz", "callback_data": "att:noop"}]]}
        if chat_id and msg_id:
            await _tg_edit(chat_id, msg_id, stamped, reply_markup=collapsed)


@api_router.get("/telegram/status")
async def telegram_status():
    """Health-check for admin monitoring."""
    import os as _os
    return {
        "configured": bool(_os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()),
        "channel_configured": bool(_os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()),
    }


@api_router.get("/telegram/username-status")
async def telegram_username_status(usernames: str = ""):
    """Which of the given Telegram @usernames have already `/start`-ed the bot
    (chat_id captured in `telegram_chat_map`). Returns per-username booleans so
    the Members UI can show a "DM hazır" badge next to matched handles.

    Query: ?usernames=PasHa,Alice,@Bob (comma-separated, @ optional).
    """
    raw = [u.strip().lstrip("@").strip() for u in (usernames or "").split(",")]
    handles = [h for h in raw if h]
    if not handles:
        return {"linked": {}, "pending": []}
    lc_to_orig: Dict[str, str] = {}
    for h in handles:
        lc_to_orig[h.lower()] = h
    docs = await db.telegram_chat_map.find(
        {"username_lc": {"$in": list(lc_to_orig.keys())}},
        {"_id": 0, "username_lc": 1, "chat_id": 1}
    ).to_list(len(lc_to_orig))
    hit = {d["username_lc"]: bool(d.get("chat_id")) for d in docs}
    linked: Dict[str, bool] = {}
    for lc, orig in lc_to_orig.items():
        linked[orig] = hit.get(lc, False)
    pending = [orig for orig, ok in linked.items() if not ok]
    return {"linked": linked, "pending": pending}


@api_router.post("/cron/telegram-daily-briefing")
async def cron_telegram_daily_briefing():
    """Platform cron trigger for the 08:00 TR morning digest."""
    ok = await send_daily_briefing(db)
    return {"sent": ok}


@api_router.post("/cron/attendance-chase")
async def cron_attendance_chase(request: Request):
    """Auto-chase: DM every not-yet-marked member whose event is 20–24 hours away.
    Runs every 15 min via .emergent/crons.yml. Uses `attendance_chased_at` on the
    event doc to avoid duplicate chases inside the same 24h window.

    Flow per candidate event:
      1) Ensure not chased yet.
      2) Collect member_ids NOT in event_attendance who have a linked Telegram
         chat_id (either via users.telegram_chat_id or telegram_chat_map fallback).
      3) DM each with the "hâlâ katılıyor musun?" prompt + ✅/❌ inline buttons —
         same callback_data pattern as the reminder DM so the existing webhook
         handler processes taps identically.
      4) Stamp `attendance_chased_at` so we don't chase again.
    """
    # Optional shared-secret guard so only the platform cron can call this.
    auth = request.headers.get("X-Cron-Secret", "")
    expected = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if expected and not _hmac_cron.compare_digest(auth, expected):
        raise HTTPException(status_code=401, detail="invalid cron secret")

    from telegram_bot import send_message as _tg_send
    now_utc = datetime.now(timezone.utc)
    # Look for events that start between +20h and +24h from now.
    lo = (now_utc + timedelta(hours=20)).isoformat()
    hi = (now_utc + timedelta(hours=24)).isoformat()
    candidates = await db.events.find(
        {"archived": False, "reminder_enabled": True,
         "date": {"$gte": lo, "$lte": hi},
         "$or": [
             {"attendance_chased_at": {"$exists": False}},
             {"attendance_chased_at": None},
         ]},
        {"_id": 0, "id": 1, "name": 1, "date": 1}
    ).to_list(100)

    total_dm = 0
    per_event: List[dict] = []
    for ev in candidates:
        ev_id = ev["id"]
        # Members who already answered
        att_ids = {
            d["member_id"] async for d in db.event_attendance.find(
                {"event_id": ev_id}, {"_id": 0, "member_id": 1}
            )
        }
        # Every member with either a linked user (Login Widget chat_id) OR a
        # telegram_username that has /start-ed the bot.
        chat_targets: Dict[str, str] = {}  # member_id → chat_id
        # 1) Linked-user path
        async for u in db.users.find(
            {"telegram_chat_id": {"$exists": True, "$ne": None},
             "notification_enabled": {"$ne": False}},
            {"_id": 0, "id": 1, "telegram_chat_id": 1, "member_ids": 1, "member_id": 1}
        ):
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            for mid in linked:
                if mid and mid not in att_ids and mid not in chat_targets:
                    chat_targets[mid] = str(u["telegram_chat_id"])
        # 2) Username fallback path — members not covered above
        remaining = await db.members.find(
            {"telegram_username": {"$exists": True, "$ne": None},
             "id": {"$nin": list(chat_targets.keys()) + list(att_ids)}},
            {"_id": 0, "id": 1, "telegram_username": 1}
        ).to_list(2000)
        for m in remaining:
            h = (m.get("telegram_username") or "").strip().lstrip("@").strip()
            if not h:
                continue
            entry = await db.telegram_chat_map.find_one(
                {"username_lc": h.lower()}, {"_id": 0, "chat_id": 1}
            )
            if entry and entry.get("chat_id"):
                chat_targets[m["id"]] = str(entry["chat_id"])
        # Compose + send
        try:
            ev_ts = datetime.fromisoformat(ev["date"].replace("Z", "+00:00"))
            hours_left = int((ev_ts - now_utc).total_seconds() // 3600)
        except Exception:
            hours_left = 24
        text = (
            f"🔔 *{ev['name']}* — {hours_left} saat kaldı\n\n"
            f"Bu etkinliğe hâlâ katılmayı planlıyor musun? "
            f"Aşağıdan bir tıkla cevapla, katılım listesi otomatik güncellenir."
        )
        markup = {
            "inline_keyboard": [[
                {"text": "✅ Katılıyorum", "callback_data": f"att:yes:{ev_id}"},
                {"text": "❌ Katılamam", "callback_data": f"att:no:{ev_id}"},
            ]]
        }
        sent = 0
        _tr_cache: Dict[str, str] = {}
        for _mid, cid in chat_targets.items():
            ok, _translated, _lang = await _dm_translate_and_send(
                cid, text, reply_markup=markup, cache=_tr_cache,
            )
            if ok:
                sent += 1
        total_dm += sent
        per_event.append({"event_id": ev_id, "name": ev["name"], "dm_sent": sent, "candidates": len(chat_targets)})
        # Stamp so we skip on next tick
        await db.events.update_one({"id": ev_id}, {"$set": {"attendance_chased_at": now_iso()}})

    return {"events_processed": len(candidates), "total_dm": total_dm, "per_event": per_event}


@api_router.post("/cron/telegram-weekly-summary")
async def cron_telegram_weekly_summary():
    """Platform cron trigger for the Monday 08:00 TR weekly summary."""
    ok = await send_weekly_summary(db)
    return {"sent": ok}


@api_router.post("/cron/telegram-dm-health")
async def cron_telegram_dm_health():
    """Weekly health check: probe every stored Telegram chat_id via getChat
    and flag the ones that no longer respond (user blocked bot, deleted
    account, or invalid id). Dead ids get `dead_since` written back to the
    source collection so the admin panel can filter them out and prod DM
    fan-outs stop attempting them silently.

    Runs Sunday 04:00 UTC via `/app/.emergent/crons.yml`. Idempotent; already-
    flagged ids get their `last_checked_at` refreshed but aren't re-flagged.
    """
    import httpx
    import asyncio as _asyncio
    _tglog = logging.getLogger("telegram")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return {"skipped": "no TELEGRAM_BOT_TOKEN"}
    api_base = f"https://api.telegram.org/bot{token}"
    now = now_iso()
    results = {"users_checked": 0, "chat_map_checked": 0,
               "newly_dead_users": 0, "newly_dead_chat_map": 0,
               "already_dead": 0, "revived": 0, "alive": 0}

    async def _probe(chat_id: str) -> tuple:
        """Return (alive: bool, description: str). Rate-limited via a small
        sleep between calls to stay under Telegram's ~30 req/s limit."""
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(f"{api_base}/getChat", params={"chat_id": chat_id})
                data = r.json() if r.content else {}
                if data.get("ok"):
                    return (True, "")
                desc = str(data.get("description") or "").lower()
                # 400 chat not found / 403 forbidden — user blocked bot / deleted account
                if any(k in desc for k in ("chat not found", "bot was blocked", "user is deactivated",
                                            "forbidden", "chat_id_invalid")):
                    return (False, desc)
                # Rate limit / 5xx — treat as alive to avoid false positives
                return (True, desc)
        except Exception as e:
            _tglog.warning(f"dm_health probe error chat_id={chat_id}: {e}")
            return (True, "probe-error")

    # 1) users.telegram_chat_id
    async for u in db.users.find(
        {"telegram_chat_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "telegram_chat_id": 1, "telegram_dead_since": 1}
    ):
        cid = str(u.get("telegram_chat_id") or "")
        if not cid:
            continue
        results["users_checked"] += 1
        was_dead = bool(u.get("telegram_dead_since"))
        alive, desc = await _probe(cid)
        if alive:
            if was_dead:
                await db.users.update_one({"id": u["id"]},
                    {"$unset": {"telegram_dead_since": "", "telegram_dead_reason": ""},
                     "$set": {"telegram_last_checked_at": now}})
                results["revived"] += 1
            else:
                await db.users.update_one({"id": u["id"]},
                    {"$set": {"telegram_last_checked_at": now}})
                results["alive"] += 1
        else:
            if not was_dead:
                await db.users.update_one({"id": u["id"]},
                    {"$set": {"telegram_dead_since": now, "telegram_dead_reason": desc[:120],
                              "telegram_last_checked_at": now}})
                results["newly_dead_users"] += 1
                _tglog.warning(f"dm_health flagged user chat_id={cid} desc={desc!r}")
            else:
                await db.users.update_one({"id": u["id"]},
                    {"$set": {"telegram_last_checked_at": now}})
                results["already_dead"] += 1
        await _asyncio.sleep(0.05)  # ~20 req/s ceiling

    # 2) telegram_chat_map
    async for m in db.telegram_chat_map.find({}, {"_id": 0, "username_lc": 1, "chat_id": 1, "dead_since": 1}):
        cid = str(m.get("chat_id") or "")
        if not cid:
            continue
        results["chat_map_checked"] += 1
        was_dead = bool(m.get("dead_since"))
        alive, desc = await _probe(cid)
        if alive:
            if was_dead:
                await db.telegram_chat_map.update_one({"username_lc": m["username_lc"]},
                    {"$unset": {"dead_since": "", "dead_reason": ""},
                     "$set": {"last_checked_at": now}})
                results["revived"] += 1
            else:
                await db.telegram_chat_map.update_one({"username_lc": m["username_lc"]},
                    {"$set": {"last_checked_at": now}})
                results["alive"] += 1
        else:
            if not was_dead:
                await db.telegram_chat_map.update_one({"username_lc": m["username_lc"]},
                    {"$set": {"dead_since": now, "dead_reason": desc[:120],
                              "last_checked_at": now}})
                results["newly_dead_chat_map"] += 1
                _tglog.warning(f"dm_health flagged chat_map @{m.get('username_lc')} chat_id={cid} desc={desc!r}")
            else:
                await db.telegram_chat_map.update_one({"username_lc": m["username_lc"]},
                    {"$set": {"last_checked_at": now}})
                results["already_dead"] += 1
        await _asyncio.sleep(0.05)

    _tglog.info(f"dm_health complete: {results}")
    return results


@api_router.get("/announcements")
async def announcements_list(
    user: dict = Depends(require_auth),
    limit: int = 30,
    search: Optional[str] = None,
    filter: Optional[str] = None,  # "all" | "urgent" | "scheduled" | "normal"
):
    """Public list of active announcements, newest first. Admins/editors see
    inactive rows too so they can un-archive.

    `search` — case-insensitive match against title/body.
    `filter` — restrict to `urgent`, `scheduled` (pending_broadcast=true) or
    `normal` (non-urgent, already broadcast). `all` / missing = no filter.
    """
    q: dict = {} if (user and user.get("role") in ("admin", "editor")) else {"active": True}
    if search:
        s = search.strip()
        if s:
            q["$or"] = [
                {"title": {"$regex": s, "$options": "i"}},
                {"body": {"$regex": s, "$options": "i"}},
            ]
    f = (filter or "").strip().lower()
    if f == "urgent":
        q["urgent"] = True
    elif f == "scheduled":
        q["pending_broadcast"] = True
    elif f == "normal":
        q["urgent"] = {"$ne": True}
        q["pending_broadcast"] = {"$ne": True}
    cursor = db.announcements.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 100)))
    return {"items": [r async for r in cursor]}


class AnnouncementBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = None
    image_url: Optional[str] = None
    broadcast: Optional[bool] = True
    urgent: Optional[bool] = False
    scheduled_at: Optional[str] = None  # ISO8601 UTC — future time defers fan-out until due


@api_router.post("/announcements")
async def announcements_create(body: AnnouncementBody, user: dict = Depends(require_admin)):
    """Create an announcement and (optionally) fan it out across all 4
    notification channels the moment it's inserted. `broadcast=False` stores
    the record without pushing — useful for drafting scheduled announcements
    that only surface in the app's Duyurular list.

    When `scheduled_at` is a future ISO8601 timestamp, the announcement is
    stored with `pending_broadcast=True` and `active=False` so it stays
    hidden from the public list. The background `_announcement_scheduler_loop`
    dispatches the 4-channel fan-out once the timestamp is due.
    """
    from datetime import datetime as _dt_ann, timezone as _tz_ann
    scheduled_at_iso: Optional[str] = None
    is_scheduled = False
    if body.scheduled_at:
        try:
            when = _dt_ann.fromisoformat(body.scheduled_at.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(400, "invalid scheduled_at (must be ISO8601)")
        if when.tzinfo is None:
            when = when.replace(tzinfo=_tz_ann.utc)
        if when <= _dt_ann.now(_tz_ann.utc):
            raise HTTPException(400, "scheduled_at must be in the future")
        scheduled_at_iso = when.isoformat()
        is_scheduled = True

    doc = {
        "id": str(uuid.uuid4()),
        "title": (("🚨 " + body.title.strip()) if body.urgent else body.title.strip()),
        "body": body.body.strip(),
        "url": (body.url or "/duyurular").strip(),
        "urgent": bool(body.urgent),
        "image_url": (body.image_url or "").strip() or None,
        "created_by": user["id"],
        "created_by_username": user.get("username") or "",
        "created_at": now_iso(),
        # Scheduled announcements stay inactive until the loop fires them so
        # they don't leak into the public /announcements list early.
        "active": (not is_scheduled),
        "scheduled_at": scheduled_at_iso,
        "pending_broadcast": is_scheduled and bool(body.broadcast),
    }
    await db.announcements.insert_one(doc)
    result = {"item": {k: v for k, v in doc.items() if k != "_id"}}
    if body.broadcast and not is_scheduled:
        import asyncio as _asyncio_ann
        # Reuse the 4-channel scheduler-style dispatch so a manual admin
        # announcement lands via Web Push, Telegram Group, Telegram DMs (with
        # country-based DeepL translation), AND the in-app bell — identical to
        # a fired scheduled reminder. `event_id=None` means every notification-
        # enabled user receives the in-app row.
        push_doc = {"id": doc["id"], "title": doc["title"], "body": doc["body"],
                    "url": doc["url"], "image_url": doc.get("image_url"),
                    "send_channel": True, "send_dm": True,
                    "send_app": True, "event_id": None}
        push_task = _broadcast_push(
            doc["title"], doc["body"], doc["url"],
            tag=f"announcement-{doc['id']}",
            sound="rally",
        )
        channel_task = _send_tg_channel(push_doc)
        dm_task = _send_tg_dms(push_doc)
        app_task = _broadcast_in_app(push_doc)
        results = await _asyncio_ann.gather(
            push_task, channel_task, dm_task, app_task,
            return_exceptions=True,
        )
        push_r, ch_r, dm_r, app_r = [
            (r if not isinstance(r, Exception) else {}) for r in results
        ]
        result["fanout"] = {
            "push_sent": (push_r or {}).get("sent", 0) if isinstance(push_r, dict) else 0,
            "telegram_channel_sent": (ch_r or {}).get("channel_sent", False),
            "telegram_dm_sent": (dm_r or {}).get("dm_sent", 0),
            "telegram_dm_translated": (dm_r or {}).get("dm_translated", 0),
            "telegram_dm_langs": (dm_r or {}).get("dm_lang_breakdown", {}),
            "app_notif_sent": (app_r or {}).get("app_notif_sent", 0),
        }
    return result


@api_router.delete("/announcements/{aid}")
async def announcements_delete(aid: str, user: dict = Depends(require_admin)):
    """Hard-delete: permanently removes the announcement row."""
    r = await db.announcements.delete_one({"id": aid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Duyuru bulunamadı")
    return {"ok": True}


class AnnouncementPatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    urgent: Optional[bool] = None
    active: Optional[bool] = None


@api_router.patch("/announcements/{aid}")
async def announcements_patch(aid: str, body: AnnouncementPatch, _: dict = Depends(require_admin)):
    """In-place edit so admins can fix a typo without spawning a new fan-out.
    Does NOT re-broadcast — silent update. Previous title/body is pushed
    into the `history` array so an accidental edit can be reverted."""
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    current = await db.announcements.find_one({"id": aid}, {"_id": 0})
    if not current:
        raise HTTPException(404, "Duyuru bulunamadı")
    if "title" in update:
        u = update.get("urgent") if "urgent" in update else current.get("urgent")
        clean = update["title"].lstrip("🚨 ").strip()
        update["title"] = ("🚨 " + clean) if u else clean
    # Snapshot previous title+body BEFORE the write if either is changing
    snap = None
    if ("title" in update and update["title"] != current.get("title")) or \
       ("body" in update and update["body"] != current.get("body")):
        snap = {
            "title": current.get("title"),
            "body": current.get("body"),
            "image_url": current.get("image_url"),
            "urgent": current.get("urgent"),
            "edited_at": now_iso(),
        }
    update["updated_at"] = now_iso()
    ops = {"$set": update}
    if snap:
        ops["$push"] = {"history": {"$each": [snap], "$slice": -20}}  # keep last 20
    await db.announcements.update_one({"id": aid}, ops)
    doc = await db.announcements.find_one({"id": aid}, {"_id": 0})
    return {"ok": True, "item": doc}


@api_router.post("/announcements/{aid}/revert")
async def announcements_revert(aid: str, _: dict = Depends(require_admin)):
    """Revert to the most recent history snapshot (pop the last entry).
    Returns the updated announcement. 400 if no history exists."""
    doc = await db.announcements.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Duyuru bulunamadı")
    hist = doc.get("history") or []
    if not hist:
        raise HTTPException(400, "Geri alınacak sürüm yok")
    prev = hist[-1]
    await db.announcements.update_one(
        {"id": aid},
        {
            "$set": {
                "title": prev.get("title"),
                "body": prev.get("body"),
                "image_url": prev.get("image_url"),
                "urgent": prev.get("urgent"),
                "reverted_at": now_iso(),
            },
            "$pop": {"history": 1},
        },
    )
    return {"ok": True, "item": await db.announcements.find_one({"id": aid}, {"_id": 0})}


# ---------- Recurring event series: bulk edit + bulk delete ----------
@api_router.delete("/events/series/{series_id}")
async def delete_event_series(series_id: str, from_date: Optional[str] = None, _: dict = Depends(require_edit)):
    """Delete every event in a recurring series. `from_date` (ISO) narrows
    to "this occurrence + all future" style — anything strictly before the
    cutoff stays. Cascades to per-event points, same as single delete."""
    q = {"series_id": series_id}
    if from_date:
        q["date"] = {"$gte": from_date}
    ids = [e["id"] async for e in db.events.find(q, {"_id": 0, "id": 1})]
    if not ids:
        return {"ok": True, "deleted": 0}
    await db.points.delete_many({"event_id": {"$in": ids}})
    res = await db.events.delete_many({"id": {"$in": ids}})
    return {"ok": True, "deleted": res.deleted_count, "ids": ids}


class SeriesPatchBody(BaseModel):
    name: Optional[str] = None
    group_name: Optional[str] = None
    multiplier: Optional[float] = None
    subtitle: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    from_date: Optional[str] = None


@api_router.patch("/events/series/{series_id}")
async def patch_event_series(series_id: str, body: SeriesPatchBody, _: dict = Depends(require_edit)):
    """Bulk-edit every event in a recurring series. Accepts the same
    metadata fields as PATCH /events/{id} but applies to the whole series
    (or just future occurrences if `from_date` is set)."""
    update = {k: v for k, v in body.model_dump().items() if v is not None and k != "from_date"}
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    q = {"series_id": series_id}
    if body.from_date:
        q["date"] = {"$gte": body.from_date}
    res = await db.events.update_many(q, {"$set": update})
    # Fire-and-forget in-app notification to every subscribed user so members
    # who were counting on the old schedule/name see a heads-up in the bell.
    try:
        sample = await db.events.find_one({"series_id": series_id}, {"_id": 0, "name": 1})
        label = (update.get("name") or (sample or {}).get("name") or "Etkinlik serisi")
        notif_docs = []
        now = now_iso()
        async for u in db.users.find({}, {"_id": 0, "id": 1}):
            notif_docs.append({
                "id": uuid.uuid4().hex,
                "user_id": u["id"],
                "title": "Etkinlik Serisi Güncellendi",
                "body": f"'{label}' serisindeki {res.modified_count} etkinlik güncellendi.",
                "url": "/etkinlikler",
                "read": False,
                "created_at": now,
            })
        if notif_docs:
            await db.in_app_notifications.insert_many(notif_docs)
    except Exception as ex:
        logger.warning(f"series notify failed: {ex}")
    return {"ok": True, "matched": res.matched_count, "modified": res.modified_count}


# ---------- Cron: purge stale event-order (weekly) ----------
@api_router.post("/cron/purge-stale-event-order")
async def cron_purge_stale_event_order():
    """No-auth cron endpoint (called by .emergent/crons.yml). Sweeps every
    user's `event_manual_order` and drops ids no longer pointing at live
    events. Mirrors the admin-only endpoint but callable by the platform
    cron with no bearer token."""
    live_ids = set()
    async for ev in db.events.find({}, {"_id": 0, "id": 1}):
        eid = ev.get("id")
        if eid:
            live_ids.add(str(eid))
    users_touched = 0
    ids_removed = 0
    buckets_removed = 0
    async for u in db.users.find(
        {"event_manual_order": {"$exists": True, "$ne": {}}},
        {"_id": 0, "id": 1, "event_manual_order": 1},
    ):
        current = u.get("event_manual_order") or {}
        new_map = {}
        local_removed = 0
        for bucket, ids in current.items():
            filtered = [i for i in (ids or []) if i in live_ids]
            local_removed += (len(ids or []) - len(filtered))
            if filtered:
                new_map[bucket] = filtered
            elif ids:
                buckets_removed += 1
        if new_map != current:
            await db.users.update_one({"id": u["id"]}, {"$set": {"event_manual_order": new_map}})
            users_touched += 1
            ids_removed += local_removed
    return {"ok": True, "users_touched": users_touched, "ids_removed": ids_removed,
            "buckets_removed": buckets_removed, "live_events": len(live_ids)}


@api_router.get("/admin/country-coverage")
async def admin_country_coverage(_: dict = Depends(require_admin)):
    """Return coverage stats so the admin panel can render a warning banner
    when a chunk of members lack the `country` field — those members will
    receive DM notifications in the source language (TR) instead of their
    localised variant. Also surfaces ISO2 codes present in the DB that
    aren't in `COUNTRY_TO_LANG` (silent TR fallback risk)."""
    total = 0
    with_country = 0
    per_country: Dict[str, int] = {}
    async for m in db.members.find({}, {"_id": 0, "country": 1}):
        total += 1
        c = (m.get("country") or "").strip().upper()
        if c:
            with_country += 1
            per_country[c] = per_country.get(c, 0) + 1
    missing = total - with_country
    unmapped = {c: n for c, n in per_country.items() if c not in COUNTRY_TO_LANG}
    coverage_pct = round((with_country / total) * 100, 1) if total else 0.0
    return {
        "total_members": total,
        "with_country": with_country,
        "missing_country": missing,
        "coverage_pct": coverage_pct,
        "per_country": dict(sorted(per_country.items(), key=lambda x: -x[1])),
        "unmapped_countries": unmapped,
    }


class TelegramBroadcastBody(BaseModel):
    title: str
    body: str
    country_iso2: Optional[str] = None  # optional ISO2 filter


@api_router.post("/telegram/broadcast")
async def telegram_broadcast(body: TelegramBroadcastBody, _: dict = Depends(require_admin)):
    """Send a message to the configured Telegram channel, optionally scoped to a country.

    When ``country_iso2`` is provided the message body is prefixed with a country
    header (flag + name) and appended with the list of member names from that
    country so the channel context matches the country-based Web-Push broadcast.
    Additionally, any user with ``telegram_chat_id`` linked to a member from that
    country receives a personalised DM (best-effort, failures ignored).
    """
    import os as _os
    channel = _os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    country = (body.country_iso2 or "").strip().upper() or None
    header_lines = [f"📣 *{body.title.strip()}*", "", body.body.strip()]
    matched_names: List[str] = []
    dm_chat_ids: List[str] = []
    username_dm_hits = 0  # members reached via @username fallback (no linked user)
    username_dm_pending: List[str] = []  # members with @username set but no /start yet
    if country and len(country) == 2:
        docs = await db.members.find(
            {"country": country},
            {"_id": 0, "id": 1, "name": 1, "telegram_username": 1}
        ).to_list(1000)
        matched_names = sorted([d.get("name") or "?" for d in docs])
        matched_ids = {d["id"] for d in docs if d.get("id")}
        header_lines = [f"📣 *{body.title.strip()}* — 🌍 `{country}` ({len(matched_names)} üye)", "", body.body.strip()]
        if matched_names:
            header_lines.append("")
            visible = matched_names[:20]
            header_lines.append("👥 " + ", ".join(visible))
            if len(matched_names) > 20:
                header_lines.append(f"…+{len(matched_names) - 20}")
        # 1) Collect DM chat ids for users linked to any matched member (Login Widget path).
        user_docs = await db.users.find(
            {"telegram_chat_id": {"$exists": True, "$ne": None},
             "notification_enabled": {"$ne": False}},
            {"_id": 0, "id": 1, "telegram_chat_id": 1, "member_ids": 1, "member_id": 1}
        ).to_list(5000)
        linked_member_ids: set = set()
        for u in user_docs:
            linked = list(u.get("member_ids") or [])
            if u.get("member_id"):
                linked.append(u["member_id"])
            if any(mid in matched_ids for mid in linked):
                cid = u.get("telegram_chat_id")
                if cid:
                    dm_chat_ids.append(str(cid))
                    linked_member_ids.update(mid for mid in linked if mid in matched_ids)
        # 2) Fallback: members that carry a telegram_username but have no linked user
        #    account — look up the chat_id captured on their /start message.
        for d in docs:
            mid = d.get("id")
            if not mid or mid in linked_member_ids:
                continue
            handle = (d.get("telegram_username") or "").strip().lstrip("@").strip()
            if not handle:
                continue
            m = await db.telegram_chat_map.find_one(
                {"username_lc": handle.lower()}, {"_id": 0, "chat_id": 1}
            )
            if m and m.get("chat_id"):
                dm_chat_ids.append(str(m["chat_id"]))
                username_dm_hits += 1
            else:
                username_dm_pending.append(f"@{handle}")
    text = "\n".join(header_lines)
    channel_sent = False
    if channel:
        channel_sent = bool(await send_message(channel, text))
    # Fan-out DMs (best-effort — a single failure doesn't abort the batch).
    # Uses the shared translate-and-send helper so recipients on EN/RU/DE etc.
    # get the country broadcast in their preferred UI language.
    dm_sent = 0
    _tr_cache: Dict[str, str] = {}
    for cid in dm_chat_ids:
        ok, _t, _l = await _dm_translate_and_send(cid, text, cache=_tr_cache)
        if ok:
            dm_sent += 1
    return {
        "channel_sent": channel_sent,
        "sent": channel_sent,  # legacy alias for existing callers
        "country": country,
        "matched_members": len(matched_names),
        "dm_targets": len(dm_chat_ids),
        "dm_sent": dm_sent,
        "username_dm_hits": username_dm_hits,
        "username_dm_pending": username_dm_pending,
    }


# ---------- Telegram /link token management ----------

@api_router.post("/telegram/link/generate")
async def telegram_generate_link_token(user: dict = Depends(require_auth)):
    """Issue a short-lived (10 min) uppercase 6-char token the user can send in
    Telegram DM as ``/link TOKEN`` to bind their chat_id to their account."""
    import secrets as _secrets, string as _string
    alphabet = _string.ascii_uppercase + _string.digits
    # Retry if collision (extremely unlikely).
    for _ in range(4):
        token = "".join(_secrets.choice(alphabet) for _ in range(6))
        exists = await db.telegram_link_tokens.find_one({"token": token})
        if not exists:
            break
    else:
        raise HTTPException(500, "Token üretilemedi, tekrar dene")
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    # A user may only have one active link token — clean up any previous ones.
    await db.telegram_link_tokens.delete_many({"user_id": user["id"]})
    await db.telegram_link_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "expires_at": expires_at,
        "created_at": now_iso(),
    })
    bot_username = os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@") or "TiTaNXiS_BoT"
    return {
        "token": token,
        "expires_at": expires_at,
        "bot_username": bot_username,
        "deep_link": f"https://t.me/{bot_username}?start=link_{token}",
        "instructions": f"@{bot_username} sohbetinde `/link {token}` yaz.",
    }


@api_router.get("/telegram/link/status")
async def telegram_link_status(user: dict = Depends(require_auth)):
    """Return whether the caller currently has a Telegram chat linked."""
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "telegram_chat_id": 1, "telegram_linked_at": 1})
    return {
        "linked": bool(u and u.get("telegram_chat_id")),
        "linked_at": (u or {}).get("telegram_linked_at"),
    }


@api_router.post("/telegram/link/unlink")
async def telegram_unlink(user: dict = Depends(require_auth)):
    """Remove the caller's telegram_chat_id — undoes /link on the web side."""
    res = await db.users.update_one(
        {"id": user["id"]},
        {"$unset": {"telegram_chat_id": "", "telegram_linked_at": "", "telegram_username": ""}},
    )
    return {"unlinked": res.modified_count > 0}


class TelegramManualLinkBody(BaseModel):
    chat_id: str
    username: Optional[str] = None


@api_router.post("/telegram/manual-link")
async def telegram_manual_link(body: TelegramManualLinkBody, user: dict = Depends(require_auth)):
    """Fallback for when the Login Widget can't run (cross-origin denied,
    mobile browser, etc). User pastes their numeric chat_id (obtainable via
    @userinfobot on Telegram) and we bind it to their account. No signature
    check since this requires an authenticated session — the user is proving
    they OWN that chat_id by using it in a subsequent DM test.
    """
    cid = (body.chat_id or "").strip()
    if not cid.lstrip("-").isdigit():
        raise HTTPException(400, "chat_id sayısal olmalı — Telegram'da @userinfobot'a mesaj at, sana ID'ni gösterir")
    uname = (body.username or "").strip().lstrip("@").strip() or None
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "telegram_chat_id": cid,
            "telegram_username": uname,
            "telegram_linked_at": now_iso(),
            "telegram_link_source": "manual",
        }},
    )
    # Also populate the chat_map so username-based fan-out finds them too.
    if uname:
        await db.telegram_chat_map.update_one(
            {"username_lc": uname.lower()},
            {"$set": {"username_lc": uname.lower(), "username": uname, "chat_id": cid, "updated_at": now_iso()}},
            upsert=True,
        )
    return {"linked": True, "chat_id": cid, "telegram_username": uname}


class TelegramLoginBody(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


@api_router.post("/telegram/login")
async def telegram_login_widget(body: TelegramLoginBody, user: dict = Depends(require_auth)):
    """Verify the Telegram Login Widget payload (HMAC-SHA256) and bind the
    caller's account to the returned Telegram user id.

    Signature check per https://core.telegram.org/widgets/login#checking-authorization
    """
    import hashlib as _hl, hmac as _hm, time as _time, os as _os
    bot_token = _os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not bot_token:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN yapılandırılmamış")
    if abs(_time.time() - body.auth_date) > 86400:
        raise HTTPException(400, "auth_date süresi dolmuş (24 saatten eski)")
    data = body.model_dump(exclude_none=True)
    provided_hash = data.pop("hash")
    check_string = "\n".join(f"{k}={data[k]}" for k in sorted(data.keys()))
    secret_key = _hl.sha256(bot_token.encode()).digest()
    calc_hash = _hm.new(secret_key, check_string.encode(), _hl.sha256).hexdigest()
    if not _hm.compare_digest(calc_hash, provided_hash):
        raise HTTPException(401, "İmza doğrulanamadı")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "telegram_chat_id": str(body.id),
            "telegram_username": body.username,
            "telegram_linked_at": now_iso(),
        }},
    )
    return {
        "linked": True,
        "telegram_id": body.id,
        "telegram_username": body.username,
    }


class BulkAllianceBody(BaseModel):
    member_ids: List[str]
    alliance_name: str
    alliance_category: Optional[str] = None  # "Main" | "Academy" | None (leave unchanged)


@api_router.post("/members/bulk-alliance")
async def bulk_set_alliance(body: BulkAllianceBody, user: dict = Depends(require_edit)):
    """Bulk-transfer members to a different alliance (case-sensitive by design)."""
    ids = [i for i in (body.member_ids or []) if i]
    if not ids:
        raise HTTPException(400, "Üye seçilmedi")
    alliance = (body.alliance_name or "").strip()
    if not alliance:
        raise HTTPException(400, "alliance_name boş olamaz")
    update_set = {"alliance_name": alliance}
    if body.alliance_category in ("Main", "Academy"):
        update_set["alliance_category"] = body.alliance_category
    before_docs = await db.members.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "alliance_name": 1, "alliance_category": 1}).to_list(len(ids))
    before_map = {d["id"]: d for d in before_docs}
    res = await db.members.update_many({"id": {"$in": ids}}, {"$set": update_set})
    for mid in ids:
        await _record_member_changes(mid, before_map.get(mid, {}), update_set, user)
    return {"matched": res.matched_count, "modified": res.modified_count, "alliance_name": alliance}


# ---------- Event Attendance ----------

class AttendanceToggleBody(BaseModel):
    member_id: str
    attended: Optional[bool] = None  # None = toggle, True/False = explicit set


# Valid attendance status values. `attending` = ✅ (default when a member is
# marked present). `declined` = ❌ won't attend. `maybe` = ❔ tentative.
# `late` = 🕒 attended but arrived late (still counted toward participation
# rate in reports). Missing / no doc = ⚪ no-response.
ATTENDANCE_STATUSES = {"attending", "declined", "maybe", "late"}


class AttendanceStatusBody(BaseModel):
    status: Optional[str] = None  # one of ATTENDANCE_STATUSES or None to clear (no-response)


@api_router.post("/events/{event_id}/attendance/toggle")
async def event_attendance_toggle(event_id: str, body: AttendanceToggleBody, user: dict = Depends(require_edit)):
    """Mark/unmark a member's attendance for an event.

    Storage: separate ``event_attendance`` collection so we can index either way
    (event → members or member → events) without event-doc bloat.
    """
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    mem = await db.members.find_one({"id": body.member_id}, {"_id": 0, "id": 1})
    if not mem:
        raise HTTPException(404, "Üye bulunamadı")
    existing = await db.event_attendance.find_one({"event_id": event_id, "member_id": body.member_id})
    should_attend = (not existing) if body.attended is None else bool(body.attended)
    if should_attend and not existing:
        await db.event_attendance.insert_one({
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "member_id": body.member_id,
            "status": "attending",
            "marked_at": now_iso(),
            "marked_by": user.get("username") or "?",
        })
    elif not should_attend and existing:
        await db.event_attendance.delete_one({"_id": existing["_id"]})
    return {"event_id": event_id, "member_id": body.member_id, "attended": should_attend}


@api_router.patch("/events/{event_id}/attendance/{member_id}")
async def event_attendance_set_status(
    event_id: str,
    member_id: str,
    body: AttendanceStatusBody,
    user: dict = Depends(require_edit),
):
    """Set a member's attendance status for an event to one of
    `attending / declined / maybe / late`, or pass `status=null` to clear
    (i.e. the member is back to no-response). Powers the editable-status
    dropdown in the Raporlar Merkezi > Etkinlik Katılım İstatistikleri tab.
    """
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    mem = await db.members.find_one({"id": member_id}, {"_id": 0, "id": 1})
    if not mem:
        raise HTTPException(404, "Üye bulunamadı")
    status = (body.status or "").strip().lower() or None
    if status is not None and status not in ATTENDANCE_STATUSES:
        raise HTTPException(400, f"invalid status; expected one of {sorted(ATTENDANCE_STATUSES)}")
    if status is None:
        await db.event_attendance.delete_one({"event_id": event_id, "member_id": member_id})
        return {"event_id": event_id, "member_id": member_id, "status": None}
    await db.event_attendance.update_one(
        {"event_id": event_id, "member_id": member_id},
        {"$set": {
            "event_id": event_id, "member_id": member_id,
            "status": status,
            "marked_at": now_iso(),
            "marked_by": user.get("username") or "?",
        }, "$setOnInsert": {"id": str(uuid.uuid4())}},
        upsert=True,
    )
    return {"event_id": event_id, "member_id": member_id, "status": status}


@api_router.get("/events/{event_id}/attendance")
async def event_attendance_list(event_id: str):
    """Return the list of member_ids marked as attended for an event."""
    docs = await db.event_attendance.find({"event_id": event_id}, {"_id": 0}).to_list(5000)
    return {"event_id": event_id, "count": len(docs), "member_ids": [d["member_id"] for d in docs]}


class EventResultScreenshotBody(BaseModel):
    url: str


@api_router.post("/events/{event_id}/screenshots")
async def event_screenshot_add(event_id: str, body: EventResultScreenshotBody, _: dict = Depends(require_edit)):
    """Append a result-screenshot URL to an event's gallery (rank / reward
    captures uploaded post-event). Idempotent — duplicate URLs are ignored."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "result_screenshots": 1})
    if not ev:
        raise HTTPException(404, "event not found")
    urls = list(ev.get("result_screenshots") or [])
    u = body.url.strip()
    if not u:
        raise HTTPException(400, "url required")
    if u not in urls:
        urls.append(u)
    await db.events.update_one({"id": event_id}, {"$set": {"result_screenshots": urls}})
    return {"result_screenshots": urls}


@api_router.delete("/events/{event_id}/screenshots")
async def event_screenshot_remove(event_id: str, url: str, _: dict = Depends(require_edit)):
    """Remove a single screenshot URL from an event's gallery."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "result_screenshots": 1})
    if not ev:
        raise HTTPException(404, "event not found")
    urls = [u for u in (ev.get("result_screenshots") or []) if u != url]
    await db.events.update_one({"id": event_id}, {"$set": {"result_screenshots": urls}})
    return {"result_screenshots": urls}


@api_router.get("/members/{member_id}/attendance-stats")
async def member_attendance_stats(member_id: str, days: int = 30):
    """Return a compliance % for a member: (attended events / total events in window)."""
    days = max(1, min(int(days or 30), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    events = await db.events.find(
        {"date": {"$gte": cutoff}}, {"_id": 0, "id": 1}
    ).to_list(5000)
    event_ids = {e["id"] for e in events}
    total = len(event_ids)
    if total == 0:
        return {"attended": 0, "total": 0, "compliance": None, "days": days}
    attended = await db.event_attendance.count_documents({
        "member_id": member_id,
        "event_id": {"$in": list(event_ids)},
    })
    compliance = round((attended / total) * 100, 1)
    return {"attended": attended, "total": total, "compliance": compliance, "days": days}


# ---------- Raporlar Merkezi (Phase 3) ----------

def _reports_period_cutoff(period: str) -> Optional[str]:
    """Return an ISO date string cutoff for the given `period` selector, or
    None for `all`. `30d` / `90d` / `180d` supported. Any other value falls
    back to `all`."""
    from datetime import datetime as _dt_r, timezone as _tz_r, timedelta as _td_r
    p = (period or "all").lower()
    if p == "all":
        return None
    m = {"30d": 30, "90d": 90, "180d": 180, "1y": 365}
    days = m.get(p)
    if not days:
        return None
    return (_dt_r.now(_tz_r.utc) - _td_r(days=days)).isoformat()


@api_router.get("/reports/members")
async def reports_members(
    period: str = "all",
    alliance: Optional[str] = None,
    country: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    """Member performance aggregation. For each member, compute:
      - attending / declined / maybe / late counts + no_response count
      - total_events in period (all non-archived)
      - participation_rate = (attending + late) / total_events * 100
      - by_group breakdown = {group_name: {attending, declined, maybe, late}}

    Missing `status` on legacy attendance rows is treated as `attending` for
    backward compatibility (see startup migration below).

    Optional `alliance` and `country` query params restrict the member pool
    (case-insensitive for alliance name; forced uppercase ISO2 for country)
    so guild leaders can slice performance by squad or region.
    """
    cutoff = _reports_period_cutoff(period)
    ev_query: dict = {"archived": False}
    if cutoff:
        ev_query["date"] = {"$gte": cutoff}
    events = await db.events.find(ev_query, {"_id": 0, "id": 1, "group_name": 1, "date": 1}).to_list(20000)
    event_map = {e["id"]: e for e in events}
    total_events = len(event_map)

    att_query: dict = {}
    if event_map:
        att_query["event_id"] = {"$in": list(event_map.keys())}
    else:
        att_query["event_id"] = {"$in": []}
    attendance = await db.event_attendance.find(att_query, {"_id": 0}).to_list(200000)

    member_query: dict = {}
    if alliance:
        member_query["alliance_name"] = {"$regex": f"^{__import__('re').escape(alliance)}$", "$options": "i"}
    if country:
        member_query["country"] = country.strip().upper()
    members = await db.members.find(member_query, {"_id": 0, "id": 1, "name": 1, "country": 1,
                                                   "alliance_name": 1, "rank": 1}).to_list(20000)
    per_member: dict = {}
    for m in members:
        per_member[m["id"]] = {
            "member_id": m["id"],
            "name": m.get("name") or "?",
            "country": m.get("country"),
            "alliance_name": m.get("alliance_name"),
            "rank": m.get("rank"),
            "attending": 0, "declined": 0, "maybe": 0, "late": 0,
            "no_response": 0,
            "by_group": {},
        }
    for a in attendance:
        mid = a.get("member_id")
        row = per_member.get(mid)
        if not row:
            continue
        status = (a.get("status") or "attending").lower()
        if status not in ATTENDANCE_STATUSES:
            status = "attending"
        row[status] = row.get(status, 0) + 1
        ev = event_map.get(a.get("event_id"))
        gn = (ev or {}).get("group_name") or "—"
        g = row["by_group"].setdefault(gn, {"attending": 0, "declined": 0, "maybe": 0, "late": 0})
        g[status] = g.get(status, 0) + 1

    for row in per_member.values():
        responded = row["attending"] + row["declined"] + row["maybe"] + row["late"]
        row["no_response"] = max(0, total_events - responded)
        # Participation rate — treat attending + late as "showed up".
        showed_up = row["attending"] + row["late"]
        row["participation_rate"] = round(showed_up / total_events * 100, 1) if total_events else 0.0

    rows = sorted(per_member.values(), key=lambda r: (-r["participation_rate"], -r["attending"], r["name"]))
    return {"period": period, "total_events": total_events, "items": rows}


@api_router.get("/reports/trend")
async def reports_trend(
    days: int = 30,
    alliance: Optional[str] = None,
    country: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    """Daily participation trend over the last N days. Each datapoint carries
    the per-day participation rate — computed as `(attending+late) /
    member_pool * 100` across every event whose `date` falls on that day.

    Days without an event stay as null so the chart draws a broken line
    instead of a misleading flat-zero. `alliance` and `country` narrow the
    member pool so the trend reflects a specific squad or region.
    """
    from datetime import datetime as _dt_t, timezone as _tz_t, timedelta as _td_t, date as _date_t
    days = max(1, min(int(days or 30), 180))
    end = _dt_t.now(_tz_t.utc)
    start = end - _td_t(days=days - 1)
    start_iso = start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    member_query: dict = {}
    if alliance:
        member_query["alliance_name"] = {"$regex": f"^{__import__('re').escape(alliance)}$", "$options": "i"}
    if country:
        member_query["country"] = country.strip().upper()
    member_ids = [m["id"] for m in await db.members.find(member_query, {"_id": 0, "id": 1}).to_list(20000)]
    member_pool = len(member_ids)

    events = await db.events.find(
        {"archived": False, "date": {"$gte": start_iso}},
        {"_id": 0, "id": 1, "date": 1},
    ).to_list(20000)
    if not events or not member_pool:
        return {"days": days, "member_pool": member_pool, "items": []}

    ev_ids = [e["id"] for e in events]
    # Only count attendance rows scoped to the current alliance/country pool.
    att = await db.event_attendance.find(
        {"event_id": {"$in": ev_ids}, "member_id": {"$in": member_ids}},
        {"_id": 0, "event_id": 1, "status": 1},
    ).to_list(200000)
    att_by_event: dict = {}
    for a in att:
        s = (a.get("status") or "attending").lower()
        if s in ("attending", "late"):
            att_by_event[a["event_id"]] = att_by_event.get(a["event_id"], 0) + 1

    # Group events by ISO date (YYYY-MM-DD) and compute per-day totals.
    by_day: dict = {}
    for e in events:
        d = (e.get("date") or "")[:10]
        if not d:
            continue
        b = by_day.setdefault(d, {"attending": 0, "event_count": 0})
        b["attending"] += att_by_event.get(e["id"], 0)
        b["event_count"] += 1

    # Fill every day in the window (null rate on empty days) so the chart
    # always has `days` datapoints across the x-axis.
    items = []
    end_date = end.date()
    for i in range(days):
        d = (end_date - _td_t(days=days - 1 - i)).isoformat()
        bucket = by_day.get(d)
        if bucket and bucket["event_count"]:
            # rate = attending / (member_pool * event_count) * 100
            rate = round(bucket["attending"] / (member_pool * bucket["event_count"]) * 100, 1)
            items.append({
                "date": d,
                "participation_rate": rate,
                "attending": bucket["attending"],
                "event_count": bucket["event_count"],
                "member_pool": member_pool,
            })
        else:
            items.append({
                "date": d,
                "participation_rate": None,
                "attending": 0,
                "event_count": 0,
                "member_pool": member_pool,
            })
    return {"days": days, "member_pool": member_pool, "items": items}


# ---------- Guild settings (Trend Overlays) ----------
class GuildTargetBody(BaseModel):
    target: int  # 0-100 percentage benchmark


@api_router.get("/settings/guild-target")
async def settings_get_guild_target(user: dict = Depends(require_auth)):
    """Return the guild's target participation percentage. Used by the
    Katılım Trendi chart to draw a benchmark line. Default 60% if unset."""
    doc = await db.guild_settings.find_one({"key": "guild_target"}, {"_id": 0})
    return {"target": int((doc or {}).get("value", 60))}


@api_router.put("/settings/guild-target")
async def settings_set_guild_target(body: GuildTargetBody, user: dict = Depends(require_admin)):
    t = max(0, min(100, int(body.target)))
    await db.guild_settings.update_one(
        {"key": "guild_target"},
        {"$set": {"key": "guild_target", "value": t, "updated_at": now_iso(),
                  "updated_by": user["id"], "updated_by_username": user.get("username")}},
        upsert=True,
    )
    return {"target": t}


# ---------- Trend Alerts (bell + Telegram when MA breaches target for 3d) ----------

async def _compute_trend_items(days: int, member_query: Optional[dict] = None) -> dict:
    """Shared trend aggregation used by `/api/reports/trend` and the
    `_trend_alert_loop`. Kept as a plain helper (no request/deps) so the
    alert loop can call it without going through FastAPI's dep injection."""
    from datetime import datetime as _dt_t, timezone as _tz_t, timedelta as _td_t
    days = max(1, min(int(days or 30), 180))
    end = _dt_t.now(_tz_t.utc)
    start = end - _td_t(days=days - 1)
    start_iso = start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    mq = member_query or {}
    member_ids = [m["id"] for m in await db.members.find(mq, {"_id": 0, "id": 1}).to_list(20000)]
    member_pool = len(member_ids)
    events = await db.events.find(
        {"archived": False, "date": {"$gte": start_iso}},
        {"_id": 0, "id": 1, "date": 1},
    ).to_list(20000)
    if not events or not member_pool:
        return {"days": days, "member_pool": member_pool, "items": []}
    ev_ids = [e["id"] for e in events]
    att = await db.event_attendance.find(
        {"event_id": {"$in": ev_ids}, "member_id": {"$in": member_ids}},
        {"_id": 0, "event_id": 1, "status": 1},
    ).to_list(200000)
    att_by_event: dict = {}
    for a in att:
        s = (a.get("status") or "attending").lower()
        if s in ("attending", "late"):
            att_by_event[a["event_id"]] = att_by_event.get(a["event_id"], 0) + 1
    by_day: dict = {}
    for e in events:
        d = (e.get("date") or "")[:10]
        if not d:
            continue
        b = by_day.setdefault(d, {"attending": 0, "event_count": 0})
        b["attending"] += att_by_event.get(e["id"], 0)
        b["event_count"] += 1
    items = []
    end_date = end.date()
    for i in range(days):
        d = (end_date - _td_t(days=days - 1 - i)).isoformat()
        bucket = by_day.get(d)
        if bucket and bucket["event_count"]:
            rate = round(bucket["attending"] / (member_pool * bucket["event_count"]) * 100, 1)
            items.append({"date": d, "participation_rate": rate,
                          "attending": bucket["attending"],
                          "event_count": bucket["event_count"],
                          "member_pool": member_pool})
        else:
            items.append({"date": d, "participation_rate": None,
                          "attending": 0, "event_count": 0,
                          "member_pool": member_pool})
    return {"days": days, "member_pool": member_pool, "items": items}


def _trend_ma7_series(items: list) -> list:
    """Trailing 7-day moving average matching the frontend's smoothing so
    admins never see one number in the chart and a different one in the
    alert. Returns list of {date, ma} — `ma` can be None on cold-start days."""
    win = 7
    out = []
    for i, d in enumerate(items):
        start = max(0, i - win + 1)
        slice_ = [x["participation_rate"] for x in items[start:i + 1] if x["participation_rate"] is not None]
        ma = round(sum(slice_) / len(slice_), 1) if len(slice_) >= min(win, 2) else None
        out.append({"date": d["date"], "ma": ma})
    return out


async def _trend_alert_evaluate() -> dict:
    """Compute the current MA7 breach streak and (if warranted) fan out
    alerts. Returns a diagnostic dict so the manual-trigger endpoint can
    surface what happened.

    Also fires a green "🎯 Hedef geri kazanıldı" recovery bell exactly once
    per breach cycle when the MA climbs back above the target — tracked via
    `pending_recovery` flag inside `guild_settings.trend_alert_state`.
    """
    from datetime import datetime as _dt_a, timezone as _tz_a
    target_doc = await db.guild_settings.find_one({"key": "guild_target"}, {"_id": 0})
    target = int((target_doc or {}).get("value", 60))
    trend = await _compute_trend_items(30)
    state_doc = await db.guild_settings.find_one({"key": "trend_alert_state"}, {"_id": 0})
    state = (state_doc or {}).get("value") or {}
    last_dispatched_at = state.get("last_dispatched_at")
    last_streak = int(state.get("last_streak") or 0)
    snoozed_until = state.get("snoozed_until")
    pending_recovery = bool(state.get("pending_recovery"))

    if not trend["items"] or trend["member_pool"] == 0:
        return {"fired": False, "reason": "no-data", "streak": 0, "target": target,
                "snoozed_until": snoozed_until, "pending_recovery": pending_recovery}
    ma = _trend_ma7_series(trend["items"])
    streak = 0
    for row in reversed(ma):
        if row["ma"] is None:
            break
        if row["ma"] < target:
            streak += 1
        else:
            break
    last_ma = next((r["ma"] for r in reversed(ma) if r["ma"] is not None), None)

    now = _dt_a.now(_tz_a.utc)
    hours_since_last = 999.0
    if last_dispatched_at:
        try:
            when = _dt_a.fromisoformat(last_dispatched_at.replace("Z", "+00:00"))
            if when.tzinfo is None:
                when = when.replace(tzinfo=_tz_a.utc)
            hours_since_last = (now - when).total_seconds() / 3600.0
        except Exception:
            pass
    # Honor active snooze.
    snoozed = False
    if snoozed_until:
        try:
            su = _dt_a.fromisoformat(snoozed_until.replace("Z", "+00:00"))
            if su.tzinfo is None:
                su = su.replace(tzinfo=_tz_a.utc)
            snoozed = su > now
        except Exception:
            pass

    should_fire = (streak >= 3) and (not snoozed) and (hours_since_last >= 20 or streak > last_streak)
    # Recovery: streak just dropped to 0 AND we previously fired a breach alert.
    should_recover = (streak == 0) and pending_recovery and (last_ma is not None) and (last_ma >= target) and (not snoozed)

    result = {
        "fired": False, "streak": streak, "last_streak": last_streak,
        "target": target, "last_ma": last_ma,
        "hours_since_last": round(hours_since_last, 1),
        "member_pool": trend["member_pool"],
        "snoozed_until": snoozed_until, "snoozed": snoozed,
        "pending_recovery": pending_recovery,
    }
    if not should_fire and not should_recover:
        if snoozed:
            result["reason"] = "snoozed"
        elif streak < 3:
            result["reason"] = "no-alert"
        else:
            result["reason"] = "throttled"
        return result

    if should_fire:
        title = "⚠️ Katılım Uyarısı"
        body = (f"Son 7 günlük ortalama %{last_ma if last_ma is not None else '?'} — "
                f"hedef %{target}. {streak} gündür hedefin altında.")
        url = "/raporlar"
        kind = "trend_alert"
    else:
        title = "🎯 Hedef Geri Kazanıldı"
        body = (f"Son 7 günlük ortalama %{last_ma} — hedef %{target} yeniden aşıldı. "
                f"Uyarı otomatik kapatıldı.")
        url = "/raporlar"
        kind = "trend_recovery"

    admin_users = await db.users.find({"role": "admin", "notification_enabled": {"$ne": False}},
                                      {"_id": 0, "id": 1, "telegram_chat_id": 1}).to_list(500)
    admin_ids = [u["id"] for u in admin_users]
    if admin_ids:
        await db.in_app_notifications.insert_many([
            {"id": str(uuid.uuid4()), "user_id": uid, "title": title, "body": body,
             "url": url, "read": False, "created_at": now_iso(), "kind": kind}
            for uid in admin_ids
        ])
    result["bell_sent"] = len(admin_ids)

    # History log for the weekly digest.
    try:
        await db.trend_alert_history.insert_one({
            "id": str(uuid.uuid4()),
            "kind": kind,
            "streak": streak,
            "last_ma": last_ma,
            "target": target,
            "member_pool": trend["member_pool"],
            "timestamp": now.isoformat(),
        })
    except Exception as ex:
        logger.warning(f"trend alert history log: {ex}")

    tg_sent = 0
    try:
        from telegram_bot import _send_tg_message
        for u in admin_users:
            cid = u.get("telegram_chat_id")
            if not cid:
                continue
            full_body = f"{body}\n{os.environ.get('PUBLIC_BASE_URL', '')}{url}"
            ok = await _send_tg_message(str(cid), f"{title}\n\n{full_body}")
            if ok:
                tg_sent += 1
    except Exception as ex:
        logger.warning(f"trend alert telegram: {ex}")
    result["tg_sent"] = tg_sent

    try:
        push_r = await _broadcast_push(title, body, url, tag=f"{kind}-{now.date().isoformat()}", sound="rally")
        result["push_sent"] = (push_r or {}).get("sent", 0)
    except Exception as ex:
        logger.warning(f"trend alert push: {ex}")
        result["push_sent"] = 0

    # State flips: breach → pending_recovery=True; recovery → False.
    new_state = {
        "last_dispatched_at": now.isoformat(),
        "last_streak": streak,
        "last_ma": last_ma,
        "target": target,
        "snoozed_until": snoozed_until if snoozed else None,
        "pending_recovery": True if should_fire else False,
    }
    if should_recover:
        new_state["last_recovery_at"] = now.isoformat()
    await db.guild_settings.update_one(
        {"key": "trend_alert_state"},
        {"$set": {"key": "trend_alert_state", "value": new_state, "updated_at": now_iso()}},
        upsert=True,
    )
    result["fired"] = True
    result["kind"] = kind
    logger.info(f"trend_alert fired kind={kind}: streak={streak} ma={last_ma} target={target}")
    return result


async def _trend_alert_loop():
    """Hourly monitor. Cheap: aggregation covers 30 days × ~5 events. Also
    fires the weekly digest at the configured weekday+hour in the chosen
    timezone (default Sunday 20:00 Europe/Istanbul)."""
    import asyncio
    from datetime import datetime as _dt_l, timezone as _tz_l
    await asyncio.sleep(120)
    while True:
        try:
            await _trend_alert_evaluate()
        except Exception as ex:
            logger.warning(f"trend alert loop error: {ex}")
        # Weekly digest tick — fires on configured weekday+hour, dedup by
        # `last_sent_at within last 12h` so multiple ticks within the target
        # hour still only send once.
        try:
            sched_doc = await db.guild_settings.find_one({"key": "trend_digest_schedule"}, {"_id": 0})
            sched = ((sched_doc or {}).get("value") or {})
            weekday = int(sched.get("weekday", 6))  # 0=Mon … 6=Sun (default Sun)
            hour = int(sched.get("hour", 20))       # 0-23 (default 20:00)
            tz_name = sched.get("tz", "Europe/Istanbul")
            try:
                from zoneinfo import ZoneInfo
                local = _dt_l.now(ZoneInfo(tz_name))
            except Exception:
                local = _dt_l.now(_tz_l.utc)
            state = await db.guild_settings.find_one({"key": "trend_digest_state"}, {"_id": 0})
            last_at = ((state or {}).get("value") or {}).get("last_sent_at")
            recently_sent = False
            if last_at:
                try:
                    when = _dt_l.fromisoformat(last_at.replace("Z", "+00:00"))
                    if when.tzinfo is None:
                        when = when.replace(tzinfo=_tz_l.utc)
                    hours = (_dt_l.now(_tz_l.utc) - when).total_seconds() / 3600.0
                    recently_sent = hours < 12
                except Exception:
                    pass
            due = (local.weekday() == weekday) and (local.hour == hour) and (not recently_sent)
            if due:
                await _trend_digest_dispatch(7)
        except Exception as ex:
            logger.warning(f"trend digest tick: {ex}")
        await asyncio.sleep(60 * 60)


class DigestScheduleBody(BaseModel):
    weekday: int  # 0=Monday … 6=Sunday
    hour: int     # 0-23
    tz: Optional[str] = "Europe/Istanbul"


@api_router.get("/reports/trend/digest/schedule")
async def digest_schedule_get(_: dict = Depends(require_admin)):
    """Current digest cadence: weekday (0=Mon, 6=Sun), hour (0-23), tz name.
    Defaults to Sunday 20:00 Europe/Istanbul when unset."""
    doc = await db.guild_settings.find_one({"key": "trend_digest_schedule"}, {"_id": 0})
    val = (doc or {}).get("value") or {}
    return {
        "weekday": int(val.get("weekday", 6)),
        "hour": int(val.get("hour", 20)),
        "tz": val.get("tz", "Europe/Istanbul"),
    }


@api_router.put("/reports/trend/digest/schedule")
async def digest_schedule_set(body: DigestScheduleBody, user: dict = Depends(require_admin)):
    weekday = max(0, min(6, int(body.weekday)))
    hour = max(0, min(23, int(body.hour)))
    tz_name = (body.tz or "Europe/Istanbul").strip()
    # Validate timezone before persisting so a typo doesn't kill the loop.
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(tz_name)
    except Exception:
        raise HTTPException(400, f"Geçersiz zaman dilimi: {tz_name}")
    await db.guild_settings.update_one(
        {"key": "trend_digest_schedule"},
        {"$set": {"key": "trend_digest_schedule",
                  "value": {"weekday": weekday, "hour": hour, "tz": tz_name,
                            "updated_by_username": user.get("username"),
                            "updated_at": now_iso()}}},
        upsert=True,
    )
    return {"weekday": weekday, "hour": hour, "tz": tz_name}


@api_router.post("/reports/trend/check-alerts")
async def reports_trend_check_alerts(_: dict = Depends(require_admin)):
    """Manual trigger — admins can force an evaluation without waiting for
    the hourly loop. Useful for smoke-testing the alert path after tweaking
    the target."""
    return await _trend_alert_evaluate()


@api_router.get("/reports/trend/alert-state")
async def reports_trend_alert_state(_: dict = Depends(require_admin)):
    """Current alert snapshot — target, current MA7 streak, last-dispatch metadata."""
    doc = await db.guild_settings.find_one({"key": "trend_alert_state"}, {"_id": 0})
    target_doc = await db.guild_settings.find_one({"key": "guild_target"}, {"_id": 0})
    target = int((target_doc or {}).get("value", 60))
    trend = await _compute_trend_items(30)
    ma = _trend_ma7_series(trend["items"]) if trend["items"] else []
    streak = 0
    for row in reversed(ma):
        if row["ma"] is None:
            break
        if row["ma"] < target:
            streak += 1
        else:
            break
    last_ma = next((r["ma"] for r in reversed(ma) if r["ma"] is not None), None)
    state = (doc or {}).get("value") or {}
    # Compute is-currently-snoozed flag so the frontend doesn't have to parse timestamps.
    from datetime import datetime as _dt_s, timezone as _tz_s
    snoozed = False
    if state.get("snoozed_until"):
        try:
            su = _dt_s.fromisoformat(state["snoozed_until"].replace("Z", "+00:00"))
            if su.tzinfo is None:
                su = su.replace(tzinfo=_tz_s.utc)
            snoozed = su > _dt_s.now(_tz_s.utc)
        except Exception:
            pass
    return {
        "target": target,
        "streak": streak,
        "last_ma": last_ma,
        "snoozed": snoozed,
        "snoozed_until": state.get("snoozed_until") if snoozed else None,
        "pending_recovery": bool(state.get("pending_recovery")),
        "state": state,
    }


class TrendSnoozeBody(BaseModel):
    days: int = 7


@api_router.post("/reports/trend/alert-snooze")
async def reports_trend_alert_snooze(body: TrendSnoozeBody, user: dict = Depends(require_admin)):
    """Silence trend alerts for `days` days (default 7). The evaluator still
    computes streak — it just skips fan-out until the snooze window expires.
    Prevents a known dip from spamming the guild every hour."""
    from datetime import datetime as _dt_sn, timezone as _tz_sn, timedelta as _td_sn
    days = max(1, min(int(body.days or 7), 30))
    until = (_dt_sn.now(_tz_sn.utc) + _td_sn(days=days)).isoformat()
    doc = await db.guild_settings.find_one({"key": "trend_alert_state"}, {"_id": 0})
    state = (doc or {}).get("value") or {}
    state["snoozed_until"] = until
    state["snoozed_by_username"] = user.get("username")
    state["snoozed_at"] = now_iso()
    await db.guild_settings.update_one(
        {"key": "trend_alert_state"},
        {"$set": {"key": "trend_alert_state", "value": state, "updated_at": now_iso()}},
        upsert=True,
    )
    # Log snooze to history for the digest.
    try:
        await db.trend_alert_history.insert_one({
            "id": str(uuid.uuid4()),
            "kind": "snooze",
            "snoozed_until": until,
            "snoozed_by_username": user.get("username"),
            "days": days,
            "timestamp": now_iso(),
        })
    except Exception:
        pass
    return {"ok": True, "snoozed_until": until, "days": days}


@api_router.delete("/reports/trend/alert-snooze")
async def reports_trend_alert_unsnooze(_: dict = Depends(require_admin)):
    """Cancel an active snooze so alerts can fire again on the next tick."""
    doc = await db.guild_settings.find_one({"key": "trend_alert_state"}, {"_id": 0})
    state = (doc or {}).get("value") or {}
    state.pop("snoozed_until", None)
    state.pop("snoozed_by_username", None)
    state.pop("snoozed_at", None)
    await db.guild_settings.update_one(
        {"key": "trend_alert_state"},
        {"$set": {"key": "trend_alert_state", "value": state, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True}


# ---------- Weekly Trend Digest ----------

async def _trend_digest_compose(days: int = 7) -> dict:
    """Compose a Telegram digest summarizing trend activity across the last
    `days` days. Reads from `trend_alert_history` (populated in the alert
    fan-out) and re-uses `_compute_trend_items` for the headline MA number.

    Returns a dict with `text` (Telegram-ready markdown) + counts so the
    admin preview endpoint can render a card without re-serializing."""
    from datetime import datetime as _dt_d, timezone as _tz_d, timedelta as _td_d
    now = _dt_d.now(_tz_d.utc)
    since = (now - _td_d(days=days)).isoformat()
    history = await db.trend_alert_history.find(
        {"timestamp": {"$gte": since}}, {"_id": 0}
    ).sort("timestamp", 1).to_list(500)
    breaches = [h for h in history if h.get("kind") == "trend_alert"]
    recoveries = [h for h in history if h.get("kind") == "trend_recovery"]
    snoozes = [h for h in history if h.get("kind") == "snooze"]

    # Current headline metrics.
    target_doc = await db.guild_settings.find_one({"key": "guild_target"}, {"_id": 0})
    target = int((target_doc or {}).get("value", 60))
    trend = await _compute_trend_items(days)
    ma = _trend_ma7_series(trend["items"]) if trend["items"] else []
    last_ma = next((r["ma"] for r in reversed(ma) if r["ma"] is not None), None)
    non_null = [r["ma"] for r in ma if r["ma"] is not None]
    avg_ma = round(sum(non_null) / len(non_null), 1) if non_null else None

    # Slope over the digest window to describe direction.
    pts = [(i, r["ma"]) for i, r in enumerate(ma) if r["ma"] is not None]
    slope = 0.0
    if len(pts) >= 2:
        n = len(pts)
        sx = sum(p[0] for p in pts); sy = sum(p[1] for p in pts)
        sxy = sum(p[0] * p[1] for p in pts); sxx = sum(p[0] * p[0] for p in pts)
        denom = n * sxx - sx * sx
        if denom:
            slope = (n * sxy - sx * sy) / denom
    direction = "yükseliyor 📈" if slope > 0.2 else "düşüyor 📉" if slope < -0.2 else "sabit ➖"

    lines = [
        f"📊 *TiTaNXiS Haftalık Katılım Özeti*",
        f"_{(now - _td_d(days=days)).strftime('%d.%m')} - {now.strftime('%d.%m.%Y')}_",
        "",
        f"🎯 Hedef: %{target}",
        f"📉 Son MA7: {'%'+str(last_ma) if last_ma is not None else '—'}"
        + (f"  ({'✅ hedefin üzerinde' if last_ma is not None and last_ma >= target else '⚠️ hedefin altında'})" if last_ma is not None else ""),
        f"📊 {days}g ortalaması: {'%'+str(avg_ma) if avg_ma is not None else '—'} · trend {direction}",
        "",
        f"⚠️  Uyarılar: *{len(breaches)}*",
        f"🎯  Toparlanma: *{len(recoveries)}*",
        f"🔕  Sessize alma: *{len(snoozes)}*",
    ]
    if snoozes:
        lines.append("")
        lines.append("*Sessize alma detayı:*")
        for s in snoozes[-3:]:  # last 3
            when = s.get("timestamp", "")[:16].replace("T", " ")
            who = s.get("snoozed_by_username") or "admin"
            d = s.get("days") or "?"
            lines.append(f"  • {when} — {who} · {d}g")
    if breaches:
        lines.append("")
        lines.append("*Son uyarılar:*")
        for b in breaches[-3:]:
            when = b.get("timestamp", "")[:16].replace("T", " ")
            lines.append(f"  • {when} — {b.get('streak','?')}g streak · MA %{b.get('last_ma','?')}")
    text = "\n".join(lines)
    return {
        "text": text,
        "target": target,
        "last_ma": last_ma,
        "avg_ma": avg_ma,
        "direction": direction,
        "breaches": len(breaches),
        "recoveries": len(recoveries),
        "snoozes": len(snoozes),
        "since": since,
        "until": now.isoformat(),
    }


async def _trend_digest_dispatch(days: int = 7) -> dict:
    """Send the digest to every admin with a linked `telegram_chat_id`, plus
    every configured broadcast channel (Telegram groups/channels admins have
    opted in), then stamp the run into `guild_settings.trend_digest_state`."""
    from datetime import datetime as _dt_x, timezone as _tz_x
    digest = await _trend_digest_compose(days)
    admins = await db.users.find(
        {"role": "admin", "notification_enabled": {"$ne": False}},
        {"_id": 0, "id": 1, "telegram_chat_id": 1, "username": 1}
    ).to_list(500)
    tg_sent = 0
    tg_err = 0
    channels_sent = 0
    channels_err = 0
    try:
        from telegram_bot import _send_tg_message
        # 1) Admin DMs.
        for u in admins:
            cid = u.get("telegram_chat_id")
            if not cid:
                continue
            try:
                ok = await _send_tg_message(str(cid), digest["text"])
                if ok:
                    tg_sent += 1
                else:
                    tg_err += 1
            except Exception:
                tg_err += 1
        # 2) Configured broadcast channels (groups / supergroups / channels).
        recipients_doc = await db.guild_settings.find_one({"key": "trend_digest_recipients"}, {"_id": 0})
        recipients = ((recipients_doc or {}).get("value") or [])
        for r in recipients:
            cid = str(r.get("chat_id") or "").strip()
            if not cid:
                continue
            try:
                ok = await _send_tg_message(cid, digest["text"])
                if ok:
                    channels_sent += 1
                else:
                    channels_err += 1
            except Exception:
                channels_err += 1
    except Exception as ex:
        logger.warning(f"digest telegram import: {ex}")
    now = _dt_x.now(_tz_x.utc)
    admin_ids = [u["id"] for u in admins]
    if admin_ids:
        await db.in_app_notifications.insert_many([
            {"id": str(uuid.uuid4()), "user_id": uid,
             "title": "📊 Haftalık Katılım Özeti",
             "body": (digest["text"][:180].replace("*", "") + "…") if len(digest["text"]) > 180 else digest["text"].replace("*", ""),
             "url": "/raporlar", "read": False,
             "created_at": now_iso(), "kind": "trend_digest"}
            for uid in admin_ids
        ])
    await db.guild_settings.update_one(
        {"key": "trend_digest_state"},
        {"$set": {"key": "trend_digest_state",
                  "value": {"last_sent_at": now.isoformat(),
                            "last_tg_sent": tg_sent, "last_bell_sent": len(admin_ids),
                            "last_channels_sent": channels_sent,
                            "breaches": digest["breaches"], "recoveries": digest["recoveries"],
                            "snoozes": digest["snoozes"]},
                  "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "tg_sent": tg_sent, "tg_err": tg_err,
            "channels_sent": channels_sent, "channels_err": channels_err,
            "bell_sent": len(admin_ids), "days": days,
            "breaches": digest["breaches"], "recoveries": digest["recoveries"],
            "snoozes": digest["snoozes"], "text": digest["text"]}


class DigestRecipientBody(BaseModel):
    chat_id: str            # numeric group id or @channelname
    label: Optional[str] = None


@api_router.get("/reports/trend/digest/recipients")
async def digest_recipients_list(_: dict = Depends(require_admin)):
    """List Telegram broadcast recipients (channels/groups) that receive the
    weekly digest in addition to admin DMs."""
    doc = await db.guild_settings.find_one({"key": "trend_digest_recipients"}, {"_id": 0})
    return {"items": ((doc or {}).get("value") or [])}


@api_router.post("/reports/trend/digest/recipients")
async def digest_recipients_add(body: DigestRecipientBody, user: dict = Depends(require_admin)):
    cid = (body.chat_id or "").strip()
    if not cid:
        raise HTTPException(400, "chat_id zorunlu")
    doc = await db.guild_settings.find_one({"key": "trend_digest_recipients"}, {"_id": 0})
    items = ((doc or {}).get("value") or [])
    if any(str(r.get("chat_id")) == cid for r in items):
        raise HTTPException(400, "Bu alıcı zaten ekli")
    items.append({
        "chat_id": cid,
        "label": (body.label or "").strip() or cid,
        "added_by_username": user.get("username"),
        "added_at": now_iso(),
    })
    await db.guild_settings.update_one(
        {"key": "trend_digest_recipients"},
        {"$set": {"key": "trend_digest_recipients", "value": items, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "items": items}


@api_router.delete("/reports/trend/digest/recipients/{chat_id:path}")
async def digest_recipients_remove(chat_id: str, _: dict = Depends(require_admin)):
    doc = await db.guild_settings.find_one({"key": "trend_digest_recipients"}, {"_id": 0})
    items = ((doc or {}).get("value") or [])
    new_items = [r for r in items if str(r.get("chat_id")) != chat_id]
    await db.guild_settings.update_one(
        {"key": "trend_digest_recipients"},
        {"$set": {"key": "trend_digest_recipients", "value": new_items, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "removed": len(items) - len(new_items)}


@api_router.post("/reports/trend/digest/recipients/{chat_id:path}/test")
async def digest_recipients_test(chat_id: str, _: dict = Depends(require_admin)):
    """Fire a tiny ping to a specific recipient so admins can verify the bot
    has access before the real Sunday digest lands."""
    try:
        from telegram_bot import _send_tg_message
        ok = await _send_tg_message(str(chat_id),
            "🧪 TiTaNXiS Digest Bağlantı Testi — bu alıcı haftalık özeti alacak.")
        return {"ok": bool(ok), "chat_id": chat_id}
    except Exception as ex:
        raise HTTPException(500, f"Telegram test hatası: {ex}")


@api_router.post("/reports/trend/digest/test-send")
async def reports_trend_digest_test_send(days: int = 7, user: dict = Depends(require_admin)):
    """Mini test dispatch — sends the current digest ONLY to the requesting
    admin's own Telegram DM (if linked) + a personal bell. Does NOT touch
    the schedule, `trend_digest_state`, or the configured recipient list —
    so admins can preview delivery formatting without spamming leadership.

    When the caller has no `telegram_chat_id`, we also mint a fresh link
    token and return `link_url` so the UI can offer a one-tap deep link to
    the Telegram bot for instant account binding."""
    days = max(1, min(int(days or 7), 90))
    digest = await _trend_digest_compose(days)
    body = "🧪 *[TEST]*\n" + digest["text"]
    tg_sent = 0
    tg_err_reason = None
    link_url = None
    udoc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "telegram_chat_id": 1})
    chat_id = (udoc or {}).get("telegram_chat_id")
    if chat_id:
        try:
            from telegram_bot import _send_tg_message
            ok = await _send_tg_message(str(chat_id), body)
            tg_sent = 1 if ok else 0
            if not ok:
                tg_err_reason = "bot delivery failed"
        except Exception as ex:
            tg_err_reason = str(ex)
    else:
        tg_err_reason = "telegram_chat_id yok — aşağıdaki butonla bağla"
        # Mint a short-lived link token + deep link so the UI can offer a
        # one-tap "Telegram Bağla" button. Cleans up any stale tokens the
        # user might have from a prior attempt so only the freshest one lives.
        import secrets as _s, string as _st
        alphabet = _st.ascii_uppercase + _st.digits
        for _ in range(4):
            token = "".join(_s.choice(alphabet) for _ in range(6))
            if not await db.telegram_link_tokens.find_one({"token": token}):
                break
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        await db.telegram_link_tokens.delete_many({"user_id": user["id"]})
        await db.telegram_link_tokens.insert_one({
            "token": token, "user_id": user["id"],
            "expires_at": expires_at, "created_at": now_iso(),
        })
        bot_username = os.environ.get("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@") or "TiTaNXiS_BoT"
        link_url = f"https://t.me/{bot_username}?start=link_{token}"
    # Personal bell.
    await db.in_app_notifications.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "title": "🧪 Digest Test Mesajı",
        "body": (digest["text"][:180].replace("*", "") + "…") if len(digest["text"]) > 180 else digest["text"].replace("*", ""),
        "url": "/raporlar", "read": False,
        "created_at": now_iso(), "kind": "trend_digest_test",
    })
    return {"ok": True, "tg_sent": tg_sent, "tg_err_reason": tg_err_reason,
            "bell_sent": 1, "chat_id_linked": bool(chat_id),
            "link_url": link_url, "text": body}


@api_router.get("/reports/trend/digest/preview")
async def reports_trend_digest_preview(days: int = 7, _: dict = Depends(require_admin)):
    """Preview the digest without sending it — useful for a "Bu haftaki
    özeti gör" admin button before firing to Telegram."""
    days = max(1, min(int(days or 7), 90))
    d = await _trend_digest_compose(days)
    state = await db.guild_settings.find_one({"key": "trend_digest_state"}, {"_id": 0})
    return {**d, "last_state": (state or {}).get("value") or {}}


@api_router.post("/reports/trend/digest/send")
async def reports_trend_digest_send(days: int = 7, _: dict = Depends(require_admin)):
    """Manual digest send — bypasses the weekly cadence."""
    days = max(1, min(int(days or 7), 90))
    return await _trend_digest_dispatch(days)


@api_router.get("/reports/events")
async def reports_events(period: str = "all", user: dict = Depends(require_admin)):
    """Per-event stats — counts by status + attendance rate. Includes a
    lightweight `by_status` breakdown that the frontend renders as chips
    next to each event row."""
    cutoff = _reports_period_cutoff(period)
    ev_query: dict = {"archived": False}
    if cutoff:
        ev_query["date"] = {"$gte": cutoff}
    events = await db.events.find(ev_query, {"_id": 0}).sort("date", -1).to_list(20000)
    if not events:
        return {"period": period, "items": [], "member_pool": 0}
    member_pool = await db.members.count_documents({})
    ev_ids = [e["id"] for e in events]
    attendance = await db.event_attendance.find({"event_id": {"$in": ev_ids}},
                                                {"_id": 0}).to_list(200000)
    per_event: dict = {eid: {"attending": 0, "declined": 0, "maybe": 0, "late": 0}
                       for eid in ev_ids}
    for a in attendance:
        eid = a.get("event_id")
        b = per_event.get(eid)
        if not b:
            continue
        status = (a.get("status") or "attending").lower()
        if status not in ATTENDANCE_STATUSES:
            status = "attending"
        b[status] = b.get(status, 0) + 1
    items = []
    for e in events:
        stats = per_event.get(e["id"], {"attending": 0, "declined": 0, "maybe": 0, "late": 0})
        showed_up = stats["attending"] + stats["late"]
        responded = showed_up + stats["declined"] + stats["maybe"]
        rate = round(showed_up / member_pool * 100, 1) if member_pool else 0.0
        items.append({
            "id": e["id"],
            "name": e.get("name"),
            "group_name": e.get("group_name"),
            "date": e.get("date"),
            "series_id": e.get("series_id"),
            "attending": stats["attending"],
            "declined": stats["declined"],
            "maybe": stats["maybe"],
            "late": stats["late"],
            "no_response": max(0, member_pool - responded),
            "responded": responded,
            "member_pool": member_pool,
            "participation_rate": rate,
        })
    return {"period": period, "items": items, "member_pool": member_pool}


@api_router.get("/reports/events/{event_id}/attendance")
async def reports_event_attendance_detail(event_id: str, user: dict = Depends(require_admin)):
    """Per-member attendance rows for a single event so the frontend can
    render the editable status dropdown. Returns every member (even those
    without a doc) so admins can promote a no-response to a status inline."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    members = await db.members.find({}, {"_id": 0, "id": 1, "name": 1,
                                         "country": 1, "alliance_name": 1,
                                         "rank": 1}).sort("name", 1).to_list(20000)
    docs = await db.event_attendance.find({"event_id": event_id}, {"_id": 0}).to_list(20000)
    by_member = {d["member_id"]: d for d in docs}
    items = []
    for m in members:
        d = by_member.get(m["id"])
        status = (d.get("status") if d else None) or ("attending" if d else None)
        items.append({
            "member_id": m["id"],
            "name": m.get("name"),
            "country": m.get("country"),
            "alliance_name": m.get("alliance_name"),
            "rank": m.get("rank"),
            "status": status,
            "marked_at": (d or {}).get("marked_at"),
            "marked_by": (d or {}).get("marked_by"),
        })
    return {"event": {"id": ev["id"], "name": ev.get("name"), "date": ev.get("date"),
                      "group_name": ev.get("group_name")},
            "items": items}


@api_router.get("/reports/members/export.csv")
async def reports_members_csv(
    period: str = "all",
    alliance: Optional[str] = None,
    country: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    """CSV export of the /reports/members payload — same rows, flattened for
    Excel / Sheets. Response streamed as text/csv with a filename hint."""
    from fastapi.responses import PlainTextResponse
    import csv, io
    data = await reports_members(period=period, alliance=alliance, country=country, user=user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["member_id", "name", "alliance_name", "rank", "country",
                "attending", "late", "declined", "maybe", "no_response",
                "participation_rate_pct", "total_events", "period"])
    total = data["total_events"]
    for r in data["items"]:
        w.writerow([r["member_id"], r["name"], r.get("alliance_name") or "",
                    r.get("rank") or "", r.get("country") or "",
                    r["attending"], r["late"], r["declined"], r["maybe"],
                    r["no_response"], r["participation_rate"], total, period])
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="member-perf-{period}.csv"'},
    )


@api_router.get("/reports/events/export.csv")
async def reports_events_csv(period: str = "all", user: dict = Depends(require_admin)):
    """CSV export of the /reports/events payload."""
    from fastapi.responses import PlainTextResponse
    import csv, io
    data = await reports_events(period=period, user=user)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["event_id", "name", "group_name", "date",
                "attending", "late", "declined", "maybe", "no_response",
                "responded", "member_pool", "participation_rate_pct", "period"])
    for r in data["items"]:
        w.writerow([r["id"], r["name"], r["group_name"], r["date"],
                    r["attending"], r["late"], r["declined"], r["maybe"],
                    r["no_response"], r["responded"], r["member_pool"],
                    r["participation_rate"], period])
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="event-attendance-{period}.csv"'},
    )


async def _poll_broadcast_closed(poll: dict, public: dict):
    """Fan out a poll-closed result card. Posts a formatted tally to the
    Telegram poll group (same chat that received the native `sendPoll` at
    creation) and fires a lightweight "poll closed" push + in-app bell so
    voters know the results are final. Best-effort; failures logged only."""
    import asyncio
    try:
        options = public.get("options") or []
        total_votes = sum(int(o.get("votes") or 0) for o in options) or 1
        winner = max(options, key=lambda o: int(o.get("votes") or 0)) if options else None
        lines = [
            f"📊 *Anket Sonuçlandı*",
            "",
            f"*{public.get('question') or poll.get('question') or ''}*",
            "",
        ]
        for o in options:
            v = int(o.get("votes") or 0)
            pct = round(v / total_votes * 100, 1) if total_votes else 0.0
            bar = "▓" * int(round(pct / 10)) + "░" * (10 - int(round(pct / 10)))
            marker = "🏆 " if winner and o.get("id") == winner.get("id") and v > 0 else "   "
            lines.append(f"{marker}{o.get('text','')}\n     `{bar}`  {v} oy ({pct}%)")
        lines.append("")
        lines.append(f"Toplam katılım: *{public.get('total_voters', 0)}* (TG: {public.get('tg_voters', 0)})")
        card = "\n".join(lines)

        # Prefer the chat we already published the native poll to; fall back
        # to the configured poll chat / main channel.
        tg_chat = (poll.get("tg_chat_id")
                   or os.environ.get("TELEGRAM_POLL_CHAT_ID", "-1003597221954").strip()
                   or os.environ.get("TELEGRAM_CHANNEL_ID", "").strip())
        tasks = []
        if tg_chat:
            from telegram_bot import send_message as _tg_send
            reply_to = poll.get("tg_message_id")
            payload_kwargs = {"chat_id": str(tg_chat), "text": card, "parse_mode": "Markdown"}
            if reply_to:
                payload_kwargs["reply_markup"] = None  # keep signature happy
            tasks.append(_tg_send(str(tg_chat), card, parse_mode="Markdown"))
        title = "🗳️ Anket kapandı"
        body = (public.get("question") or "")[:180]
        doc = {"id": f"poll-closed-{poll.get('id')}", "title": title, "body": body,
               "url": "/anketler", "image_url": None, "event_id": None,
               "send_channel": False, "send_dm": False, "send_app": True}
        tasks.append(_broadcast_in_app(doc))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as ex:
        logger.warning(f"poll_closed broadcast: {ex}")


async def _poll_broadcast(question: str, poll_id: str, options: Optional[list] = None,
                          multi_choice: bool = False):
    """Fan out a new-poll notification across Web Push + Telegram DMs + in-app
    bell. Also publishes a native Telegram poll to the configured leadership
    group (`TELEGRAM_POLL_CHAT_ID` env, default -1003597221954) via `sendPoll`
    so Telegram members can vote inline — `poll_answer` updates merge back
    into the app tallies. Fired by the polls router the moment a poll is
    created."""
    import asyncio
    title = "🗳️ Yeni Anket"
    body = question[:180] + ("…" if len(question) > 180 else "")
    url = "/anketler"
    doc = {"id": f"poll-{poll_id}", "title": title, "body": body, "url": url,
           "image_url": None, "event_id": None,
           "send_channel": False, "send_dm": True, "send_app": True}
    tg_poll_meta = None
    try:
        # Native Telegram poll to the guild group.
        if options:
            from telegram_bot import _send_tg_poll
            group_chat = os.environ.get("TELEGRAM_POLL_CHAT_ID", "-1003597221954").strip()
            tg_poll_meta = await _send_tg_poll(
                group_chat, question, [o["text"] for o in options],
                is_anonymous=False,
                allows_multiple_answers=bool(multi_choice),
            )
            if tg_poll_meta:
                await db.polls.update_one(
                    {"id": poll_id},
                    {"$set": {
                        "tg_poll_id": tg_poll_meta["tg_poll_id"],
                        "tg_message_id": tg_poll_meta["message_id"],
                        "tg_chat_id": tg_poll_meta["chat_id"],
                    }},
                )
        await asyncio.gather(
            _broadcast_push(title, body, url, tag=f"poll-{poll_id}", sound="rally"),
            _send_tg_dms(doc),
            _broadcast_in_app(doc),
            return_exceptions=True,
        )
    except Exception as ex:
        logger.warning(f"poll broadcast: {ex}")


app.include_router(api_router)
app.include_router(make_auth_router(db))
from routes.polls import make_polls_router
app.include_router(make_polls_router(db, require_auth, require_admin, on_poll_created=_poll_broadcast, on_poll_closed=_poll_broadcast_closed), prefix="/api")
from routes.invites import make_invites_router
from routes.svs import make_svs_router
from auth import hash_password as _hash_password, create_token as _create_token, parse_user_agent as _parse_user_agent, public_user as _public_user
app.include_router(
    make_invites_router(db, require_admin, _hash_password, _create_token, _parse_user_agent, now_iso, _public_user),
    prefix="/api",
)
app.include_router(make_svs_router(db, require_auth, require_admin), prefix="/api")
from routes.ocr import make_ocr_router
app.include_router(make_ocr_router(db, require_edit, require_auth), prefix="/api")
from routes.alliances import make_alliances_router
app.include_router(make_alliances_router(db, require_edit), prefix="/api")

app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ["CORS_ORIGINS"].split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await ensure_indexes(db)
    await seed_admin(db)
    # Polls indexes — Faz 4
    try:
        from routes.polls import ensure_polls_indexes
        await ensure_polls_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"polls index ensure: {_e}")
    # Invites indexes — Faz 5
    try:
        from routes.invites import ensure_invites_indexes
        await ensure_invites_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"invites index ensure: {_e}")
    # SvS indexes
    try:
        from routes.svs import ensure_svs_indexes
        await ensure_svs_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"svs index ensure: {_e}")

    # Backfill missing `status` field on legacy attendance docs → "attending".
    try:
        r = await db.event_attendance.update_many(
            {"status": {"$exists": False}},
            {"$set": {"status": "attending"}},
        )
        if r.modified_count:
            logging.getLogger("server").info(
                f"attendance status backfill: set 'attending' on {r.modified_count} legacy rows"
            )
    except Exception as _e:
        logging.getLogger("server").warning(f"attendance backfill: {_e}")

    # Register the Telegram webhook (no-ops if TELEGRAM_BOT_TOKEN is unset).
    try:
        from telegram_bot import setup_webhook as _tg_setup_webhook
        await _tg_setup_webhook()
    except Exception as _e:
        logging.getLogger("telegram").warning(f"setup_webhook at startup: {_e}")

    # Backfill alliance_name for legacy members
    legacy = await db.members.find(
        {"$or": [{"alliance_name": {"$exists": False}}, {"alliance_name": None}]},
        {"_id": 0, "id": 1},
    ).to_list(1000)
    for m in legacy:
        await db.members.update_one({"id": m["id"]}, {"$set": {"alliance_name": random.choice(ALLIANCES)}})
    if legacy:
        logger.info(f"Backfilled alliance_name for {len(legacy)} members")

    # One-time migration: strip non-digit chars from numeric level fields ("F8" -> "8", "T11" -> "11")
    import re as _re
    numeric_fields = ["castle_level", "tetikci_f", "tetikci_t", "bombaci_f", "bombaci_t", "kalkanli_f", "kalkanli_t"]
    ored = [{f: {"$regex": r"[^0-9]"}} for f in numeric_fields]
    dirty = await db.members.find({"$or": ored}, {"_id": 0, **{"id": 1, **{f: 1 for f in numeric_fields}}}).to_list(5000)
    migrated = 0
    for m in dirty:
        upd = {}
        for f in numeric_fields:
            v = m.get(f)
            if isinstance(v, str) and v.strip() and _re.search(r"[^0-9]", v):
                cleaned = _re.sub(r"[^0-9]", "", v)
                upd[f] = cleaned if cleaned else None
        if upd:
            await db.members.update_one({"id": m["id"]}, {"$set": upd})
            migrated += 1
    if migrated:
        logger.info(f"Stripped non-digit chars from level fields for {migrated} members")

    # One-time migration: strip stray brackets from alliance_name ("[GOW]" -> "GOW").
    try:
        dirty_alliance = await db.members.find(
            {"alliance_name": {"$regex": r"[\[\]]"}},
            {"_id": 0, "id": 1, "alliance_name": 1},
        ).to_list(20000)
        alliance_fixed = 0
        for m in dirty_alliance:
            v = m.get("alliance_name")
            if not isinstance(v, str):
                continue
            cleaned = v.replace("[", "").replace("]", "").strip()
            if cleaned != v:
                await db.members.update_one(
                    {"id": m["id"]}, {"$set": {"alliance_name": cleaned}}
                )
                alliance_fixed += 1
        if alliance_fixed:
            logger.info(f"Stripped brackets from alliance_name for {alliance_fixed} members")
    except Exception as _e:
        logger.warning(f"alliance_name migration failed: {_e}")
    # Idempotent migration: set email=pasha@titanxis.com on admin & pasha users,
    # and link both accounts to the "PasHa" member document if present.
    # Runs on every startup but is a no-op once the desired state is reached.
    try:
        TARGET_EMAIL = "pasha@titanxis.com"
        pasha_member = await db.members.find_one({"name": "PasHa"}, {"_id": 0, "id": 1})
        pasha_mid = pasha_member["id"] if pasha_member else None
        for uname in ("admin", "pasha"):
            u = await db.users.find_one({"username": uname})
            if not u:
                continue
            updates = {}
            if u.get("email") != TARGET_EMAIL:
                updates["email"] = TARGET_EMAIL
            if pasha_mid:
                current_ids = list(u.get("member_ids") or [])
                if pasha_mid not in current_ids:
                    current_ids.append(pasha_mid)
                    updates["member_ids"] = current_ids
            if updates:
                await db.users.update_one({"username": uname}, {"$set": updates})
                logger.info(f"pasha-email migration: updated user '{uname}' fields={list(updates.keys())}")
    except Exception as _e:
        logger.warning(f"pasha-email migration failed: {_e}")

    # Auto-seed disabled: guild leaders now populate their own members.
    # To manually populate demo data, POST /api/seed?force=true with admin token.


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
