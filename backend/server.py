from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, UploadFile, File, Form, Request, Response
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
    # v134 — Admin panelinden elle bağlanan Telegram sohbet ID'si. `/duyuru` +
    # kişisel bildirimler bu değeri de hedef listesine ekler. `users` collection'ı
    # ile bağlama yapılamayan üyeler için manuel köprü niteliğinde.
    telegram_chat_id: Optional[str] = None
    # "server" (default — only counted in Sunucu-scoped leaderboard) or
    # "global" (rendered in Global scope as well). Members created before this
    # field existed default to "server" so the Sunucu view stays intact.
    scope: Optional[str] = "server"
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
    scope: Optional[str] = "server"


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
    telegram_chat_id: Optional[str] = None
    scope: Optional[str] = None


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
    # When False, this event's row is hidden inside the leaderboard's group
    # breakdown panel (▶ expand). The event still counts toward the group's
    # total points — only the per-event line item is suppressed. Default
    # True so existing events stay visible without a migration.
    show_breakdown: bool = True
    # Optional archive folder id — when set the event surfaces inside that
    # folder on the Events archive tab and the Leaderboard archive folder
    # picker. Null means "not in any folder" (top-level of the archive).
    folder_id: Optional[str] = None
    # Incremented every time this event wins an archive compare session
    # (higher total points than the other event). Powers the 👑 badge on
    # archive cards so admins can scan tournament winners at a glance.
    compare_wins: int = 0
    result_screenshots: List[str] = Field(default_factory=list)  # post-hoc rank/reward screenshots
    # When False, this event is hidden from the anasayfa (member home) calendar
    # even though it stays visible on /etkinlikler. Lets admins hide practice/
    # internal events from members without archiving them.
    show_in_calendar: bool = True
    # v135.8 — Şablon izleme. Etkinlik bir event_template'den oluşturulduysa
    # şablonun adı bu alanda tutulur; UI'da küçük bir "Şablon: X" chip'i
    # olarak görünür ve hangi taslaktan geldiği izlenir. `None` → şablonsuz.
    template_source_name: Optional[str] = None
    # v129 — Auto-archive fields (persisted on Event doc).
    auto_archive: bool = False
    auto_archive_folder_id: Optional[str] = None
    # v132 — Bireysel Etkinlik + Minimum Puan Eşiği ek alanları.
    # `description` = long-form açıklama (Bireysel event form textarea).
    # `auto_report_top10` = kapanışta ilk 10 kişiyi rapor etsin mi.
    # `report_channels` = ["telegram","push","message"] alt kümesi.
    # `alliance_thresholds` = [{alliance_name, threshold}] grup bazlı min puan.
    # `member_thresholds` = [{member_id, threshold}] üye bazlı özel eşik.
    description: Optional[str] = None
    auto_report_top10: bool = False
    report_channels: List[str] = Field(default_factory=list)
    alliance_thresholds: List[dict] = Field(default_factory=list)
    member_thresholds: List[dict] = Field(default_factory=list)
    # v125 — Auto-generated DeepL translations for user-visible strings.
    # Populated by /events POST/PATCH so the frontend can render event
    # name / subtitle / group in the user's preferred language without a
    # round-trip. Missing keys just fall back to the TR source.
    name_translations: Dict[str, str] = Field(default_factory=dict)
    subtitle_translations: Dict[str, str] = Field(default_factory=dict)
    group_translations: Dict[str, str] = Field(default_factory=dict)
    # When False, this event never shows up on Katılım Merkezi (Reports)
    # because attendance tracking is disabled — e.g. announcements or
    # informational entries that shouldn't skew participation stats.
    attendance_enabled: bool = True
    # v122 — Sadıklar (Loyalty) toggle. When enabled, members scoring at
    # least `loyalty_threshold` weighted points in this event earn 1
    # loyalty point that counts toward the 🔥 Sadıklar leaderboard. When
    # `loyalty_enabled` is False the threshold is ignored.
    loyalty_enabled: bool = False
    loyalty_threshold: int = 0
    # v52 — alliance whose members receive RSVP notifications and show up in
    # participation lists. Defaults to "GOW" so newly created events target
    # our home alliance out of the box. Admins can widen the scope by setting
    # this to "all" (any user with a linked member) or narrow it to a
    # specific alliance by name. Non-matching alliance members simply won't
    # see this event on their participation feed.
    alliance_scope: str = "GOW"
    created_at: str = Field(default_factory=now_iso)
    # When set, this event belongs to a recurring series generated by a
    # single admin action. Enables `/events/series/{id}` bulk edit/delete.
    series_id: Optional[str] = None
    # v135.26 — Automated pre-event reminder. Admin picks one of
    # {15, 30, 60, 120} minutes when composing the event; a background
    # loop then fires a Telegram channel post + web push to yes/maybe
    # RSVPs exactly that many minutes before `date`. `reminder_sent_at`
    # is stamped after the first successful fanout to make the loop
    # idempotent — re-scheduling the same event never double-pings.
    reminder_minutes: Optional[int] = None
    reminder_sent_at: Optional[str] = None
    # v135.36 — Auto-issue a certificate to every attendee the moment the
    # event archives. Toggle set at create/update time; loop reads it during
    # archive fanout.
    auto_certificate: Optional[bool] = False
    auto_certificate_title: Optional[str] = None
    auto_certificate_theme: Optional[str] = "amber"
    # v140.43 — Etkinlik tipi kalıcı olarak saklanır. Değerler: "bireysel"
    # (Bireysel Etkinlik formundan gelen) veya "ittifak" (İttifak/EventForm
    # formundan gelen). Kolon kategorileme (Kolektif ↔ Bireysel) artık grup
    # adına DEĞİL, bu alana bakar → grup atanan bir Bireysel etkinlik hâlâ
    # Bireysel kolonunda kalır. Eski kayıtlar için None → legacy group_name
    # fallback devreye girer.
    event_type: Optional[str] = None


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
    show_breakdown: Optional[bool] = True
    show_in_calendar: Optional[bool] = True
    attendance_enabled: Optional[bool] = True
    # v122 — Sadıklar (Loyalty) config on event create.
    loyalty_enabled: Optional[bool] = False
    loyalty_threshold: Optional[int] = 0
    # v52 — Ittifak scope. Default "GOW" so new events are targeted at our
    # home alliance by default (matches user policy).
    alliance_scope: Optional[str] = "GOW"
    folder_id: Optional[str] = None
    # v129 — Auto-archive knobs. When `auto_archive=True`, the sweep loop
    # moves this event to `archived=True` (and optionally into
    # `auto_archive_folder_id`) as soon as its date is in the past.
    auto_archive: Optional[bool] = False
    auto_archive_folder_id: Optional[str] = None
    # v132 — Bireysel Etkinlik + Minimum Puan Eşiği optional fields.
    description: Optional[str] = None
    auto_report_top10: Optional[bool] = False
    report_channels: Optional[List[str]] = None
    alliance_thresholds: Optional[List[dict]] = None
    member_thresholds: Optional[List[dict]] = None
    # v135.8 — Şablon izleme (bkz. Event modeli).
    template_source_name: Optional[str] = None
    # v135.26 — Pre-event auto reminder lead (None|15|30|60|120 minutes).
    reminder_minutes: Optional[int] = None
    # v135.36 — Otomatik sertifika: arşive taşındığında katılımcılara toplu
    # sertifika üretir. `auto_certificate_title` boşsa etkinlik adı kullanılır.
    auto_certificate: Optional[bool] = False
    auto_certificate_title: Optional[str] = None
    auto_certificate_theme: Optional[str] = "amber"
    # v140.43 — bkz. Event modeli.
    event_type: Optional[str] = None
    # v136 — Recurrence knobs on create. Backend spawns N-1 additional
    # events after the base one when `interval != "none"` and count > 1.
    # Values: "daily" | "2days" | "weekly" | "2weekly" | "monthly".
    recurrence_interval: Optional[str] = None
    recurrence_count: Optional[int] = None


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
    show_breakdown: Optional[bool] = None
    show_in_calendar: Optional[bool] = None
    attendance_enabled: Optional[bool] = None
    # v122 — Sadıklar (Loyalty) config editable after creation.
    loyalty_enabled: Optional[bool] = None
    loyalty_threshold: Optional[int] = None
    # v52 — allow admins to widen/change the alliance target after creation.
    alliance_scope: Optional[str] = None
    folder_id: Optional[str] = None
    # v129 — Same auto-archive knobs, editable via PATCH.
    auto_archive: Optional[bool] = None
    auto_archive_folder_id: Optional[str] = None
    # v132 — Bireysel Etkinlik + Minimum Puan Eşiği editable via PATCH.
    description: Optional[str] = None
    auto_report_top10: Optional[bool] = None
    report_channels: Optional[List[str]] = None
    alliance_thresholds: Optional[List[dict]] = None
    member_thresholds: Optional[List[dict]] = None
    # Same fields as create — when supplied on PATCH the backend will spawn
    # additional future events after the current one (without touching the
    # current one) so admins can add a "Tekrarla" schedule to any existing
    # event.
    recurrence_interval: Optional[str] = None
    recurrence_count: Optional[int] = None
    # v135.26 — Pre-event auto reminder lead (None|15|30|60|120 minutes).
    # PATCH also accepts explicit `None` to disable a previously-set reminder.
    reminder_minutes: Optional[int] = None
    # v135.36 — Otomatik sertifika toggles (editable via PATCH).
    auto_certificate: Optional[bool] = None
    auto_certificate_title: Optional[str] = None
    auto_certificate_theme: Optional[str] = None


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


# v124 — Legal documents (Privacy / Terms / Aydınlatma) served in the
# user's language. TR is the source-of-truth; other languages are
# translated on-demand via DeepL and cached in `legal_translations`.
@api_router.get("/legal/{doc}")
async def get_legal(doc: str, lang: str = "tr"):
    from legal_content import LEGAL_SOURCES, LEGAL_UPDATED
    if doc not in LEGAL_SOURCES:
        raise HTTPException(404, "unknown legal doc")
    lang = (lang or "tr").lower()
    src = LEGAL_SOURCES[doc]
    if lang == "tr":
        return {"doc": doc, "lang": "tr", "updated": LEGAL_UPDATED,
                "title": src["title"], "sections": src["sections"]}
    # Cache hit?
    cached = await db.legal_translations.find_one({"doc": doc, "lang": lang}, {"_id": 0})
    if cached:
        return cached["content"]
    # Cache miss → translate via DeepL. Loops per section to reuse the
    # existing per-string helper (which handles quota + logging).
    try:
        n = len(src["sections"])
        title_tr = (await _translate_one(src["title"], target_langs=[lang])).get(lang, src["title"])
        sections_tr = []
        for s in src["sections"]:
            h_tr = (await _translate_one(s["heading"], target_langs=[lang])).get(lang, s["heading"])
            b_tr = (await _translate_one(s["body"], target_langs=[lang])).get(lang, s["body"])
            sections_tr.append({"heading": h_tr, "body": b_tr})
        content = {
            "doc": doc, "lang": lang, "updated": LEGAL_UPDATED,
            "title": title_tr, "sections": sections_tr,
        }
        from datetime import datetime as _ldt, timezone as _ltz
        await db.legal_translations.update_one(
            {"doc": doc, "lang": lang},
            {"$set": {"doc": doc, "lang": lang, "content": content,
                      "cached_at": _ldt.now(_ltz.utc).isoformat()}},
            upsert=True,
        )
        return content
    except Exception as e:
        logger.warning(f"legal translate fallback tr for {doc}/{lang}: {e}")
        return {"doc": doc, "lang": "tr", "updated": LEGAL_UPDATED,
                "title": src["title"], "sections": src["sections"]}


# v124 — Google Calendar / iCal export for a single event. Serves a
# standards-compliant .ics file so any calendar app can subscribe.
@api_router.get("/events/{event_id}/ics")
async def event_ics(event_id: str):
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "event not found")
    from datetime import datetime as _dt2, timezone as _tz2, timedelta as _td2
    try:
        start = _dt2.fromisoformat((ev.get("date") or "").replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(400, "bad event date")
    if start.tzinfo is None:
        start = start.replace(tzinfo=_tz2.utc)
    end = start + _td2(hours=2)
    def fmt(d: _dt2) -> str:
        return d.astimezone(_tz2.utc).strftime("%Y%m%dT%H%M%SZ")
    name = (ev.get("name") or "TiTaNXiS Event").replace("\n", " ").replace(",", "\\,")
    subtitle = (ev.get("subtitle") or "").replace("\n", " ").replace(",", "\\,")
    uid = f"{event_id}@titanxis"
    ics = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TiTaNXiS//EN",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{fmt(_dt2.now(_tz2.utc))}",
        f"DTSTART:{fmt(start)}",
        f"DTEND:{fmt(end)}",
        f"SUMMARY:{name}",
        f"DESCRIPTION:{subtitle}" if subtitle else "DESCRIPTION:",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return Response(content=ics, media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="titanxis-{event_id[:8]}.ics"'})


# v124 — Event in-app chat. Lightweight polling-based messages; only
# users who RSVP'd yes/maybe can post so noise stays low.
@api_router.get("/events/{event_id}/messages")
async def event_messages_list(event_id: str, since: Optional[str] = None):
    q: dict = {"event_id": event_id}
    if since:
        q["ts"] = {"$gt": since}
    rows = await db.event_messages.find(q, {"_id": 0}).sort("ts", 1).to_list(500)
    return rows


class EventMsgBody(BaseModel):
    text: str


@api_router.post("/events/{event_id}/messages")
async def event_messages_post(event_id: str, body: EventMsgBody, user: dict = Depends(require_auth)):
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(400, "empty message")
    if len(text) > 500:
        raise HTTPException(400, "message too long (max 500)")
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1})
    if not ev:
        raise HTTPException(404, "event not found")
    doc = {
        "id": str(uuid.uuid4()),
        "event_id": event_id,
        "user_id": user["id"],
        "username": user.get("username"),
        "avatar_url": user.get("avatar_url"),
        "text": text,
        "ts": now_iso(),
    }
    await db.event_messages.insert_one({**doc})
    return doc


# v122 — Sadıklar (Loyalty) leaderboard. For each event with
# `loyalty_enabled=true`, every member whose weighted point total meets
# or exceeds `loyalty_threshold` earns 1 loyalty point. The leaderboard
# ranks members by cumulative loyalty count. Members with 0 loyalty are
# omitted so the ranking stays focused on active loyalists.
@api_router.get("/loyalty/leaderboard")
async def loyalty_leaderboard():
    events = await db.events.find(
        {"loyalty_enabled": True, "loyalty_threshold": {"$gt": 0},
         "hidden_from_leaderboard": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "loyalty_threshold": 1, "multiplier": 1, "date": 1},
    ).to_list(2000)
    if not events:
        return []
    ev_by_id = {e["id"]: e for e in events}
    ev_ids = list(ev_by_id.keys())
    # Weighted point totals per (event, member).
    pipeline = [
        {"$match": {"event_id": {"$in": ev_ids}}},
        {"$project": {
            "event_id": 1, "member_id": 1,
            "weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]},
        }},
        {"$group": {"_id": {"e": "$event_id", "m": "$member_id"}, "total": {"$sum": "$weighted"}}},
    ]
    rows = await db.points.aggregate(pipeline).to_list(50000)
    # Fan-out: which members qualified for which events.
    loyalty_by_member: Dict[str, int] = {}
    events_by_member: Dict[str, List[str]] = {}
    for r in rows:
        ev_id = r["_id"]["e"]
        mid = r["_id"]["m"]
        ev = ev_by_id.get(ev_id)
        if not ev:
            continue
        threshold = int(ev.get("loyalty_threshold") or 0)
        if threshold <= 0:
            continue
        if r["total"] >= threshold:
            loyalty_by_member[mid] = loyalty_by_member.get(mid, 0) + 1
            events_by_member.setdefault(mid, []).append(ev.get("name") or ev_id)
    if not loyalty_by_member:
        return []
    member_ids = list(loyalty_by_member.keys())
    members = await db.members.find({"id": {"$in": member_ids}}, {"_id": 0}).to_list(len(member_ids))
    m_by_id = {m["id"]: m for m in members}
    result = []
    for mid, score in loyalty_by_member.items():
        m = m_by_id.get(mid)
        if not m:
            continue
        result.append({
            "member_id": mid,
            "name": m.get("name"),
            "rank": m.get("rank"),
            "alliance_name": m.get("alliance_name"),
            "loyalty_score": score,
            "events_qualified": sorted(events_by_member.get(mid, [])),
            "total_loyalty_events": len(events),
        })
    result.sort(key=lambda r: (-r["loyalty_score"], (r.get("name") or "").lower()))
    for i, r in enumerate(result):
        r["position"] = i + 1
    return result


# v121 — Bulk RSVP streak lookup for the Members page. Returns a
# {member_id: streak} map for members whose linked app-user has a
# consecutive "yes" streak >= threshold (default 5). Members without a
# linked user, or with streak < threshold, are omitted so the frontend
# can iterate `Object.entries` without filtering. `event_rsvps` joined
# by user_id → users.member_ids gives us the fan-out.
@api_router.get("/members/rsvp-streaks")
async def members_rsvp_streaks(threshold: int = 5):
    threshold = max(1, int(threshold))
    # Pull only users with linked member_ids to keep the pipeline lean.
    users = await db.users.find(
        {"member_ids": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "member_ids": 1},
    ).to_list(5000)
    if not users:
        return {}
    user_ids = [u["id"] for u in users]
    rsvps = await db.event_rsvps.find(
        {"user_id": {"$in": user_ids}},
        {"_id": 0, "user_id": 1, "event_id": 1, "status": 1},
    ).to_list(50000)
    if not rsvps:
        return {}
    ev_ids = list({r.get("event_id") for r in rsvps if r.get("event_id")})
    events = await db.events.find(
        {"id": {"$in": ev_ids}, "attendance_enabled": {"$ne": False}},
        {"_id": 0, "id": 1, "date": 1},
    ).to_list(5000)
    ev_date = {e["id"]: e.get("date") for e in events if e.get("date")}
    # Group RSVPs per user, sort by event date desc, count consecutive "yes".
    per_user: Dict[str, List[dict]] = {}
    for r in rsvps:
        d = ev_date.get(r.get("event_id"))
        if not d:
            continue
        per_user.setdefault(r["user_id"], []).append({"status": r.get("status"), "date": d})
    streak_by_uid: Dict[str, int] = {}
    for uid, rows in per_user.items():
        rows.sort(key=lambda x: x["date"], reverse=True)
        n = 0
        for row in rows:
            if row["status"] == "yes":
                n += 1
            else:
                break
        if n >= threshold:
            streak_by_uid[uid] = n
    # Fan out to member_ids so the frontend can index by member directly.
    result: Dict[str, int] = {}
    for u in users:
        n = streak_by_uid.get(u["id"])
        if not n:
            continue
        for mid in (u.get("member_ids") or []):
            # If multiple linked users share a member (rare), keep the max.
            result[mid] = max(result.get(mid, 0), n)
    return result


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
    # v135.29 — Public bio join. If any app-user has linked this member
    # (users.member_ids), surface their `bio` on the member doc so the
    # MemberProfileDialog can render it without a second round-trip.
    try:
        linked = await db.users.find_one(
            {"$or": [
                {"member_ids": member_id},
                {"member_id": member_id},
            ]},
            {"_id": 0, "bio": 1, "username": 1},
        )
        if linked and (linked.get("bio") or "").strip():
            doc["bio"] = linked["bio"]
            doc["bio_author_username"] = linked.get("username")
    except Exception:
        pass
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
    # v61 — Case-preserved set. `GOW`, `GoW`, `GOw` her biri ayrı ittifak.
    existing_alliances_cs = {
        str(a) for a in await db.members.distinct("alliance_name") if a
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
        # Track brand-new alliances (EXACT MATCH) for the response summary.
        if canonical_alliance and canonical_alliance not in existing_alliances_cs:
            if canonical_alliance not in new_alliances:
                new_alliances.append(canonical_alliance)
            existing_alliances_cs.add(canonical_alliance)

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
    # v134 — telegram_chat_id: normalise ("" temizler, sayısal string olarak sakla).
    if "telegram_chat_id" in raw:
        tcid = raw["telegram_chat_id"]
        if tcid is None or (isinstance(tcid, str) and tcid.strip() == ""):
            update["telegram_chat_id"] = None
        else:
            update["telegram_chat_id"] = str(tcid).strip()
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    # Read the "before" doc so we can log field-level deltas — powers the
    # per-member audit trail visible in the profile dialog.
    before = await db.members.find_one({"id": member_id}, {"_id": 0})
    if not before:
        raise HTTPException(404, "Üye bulunamadı")
    # Auto-rank rule — when castle_level is updated and the caller didn't
    # explicitly bump the rank, promote based on castle: ≥8 → R3, 5-7 → R2.
    # Never demotes (R4/R5 stay). Same rule the OCR members-apply endpoint uses.
    if "castle_level" in update:
        _rank_order = {"R1": 1, "R2": 2, "R3": 3, "R4": 4, "R5": 5}
        castle_new = update["castle_level"]
        if isinstance(castle_new, int) and castle_new > 0:
            effective_rank = update.get("rank") or before.get("rank") or "R1"
            if castle_new >= 8:
                target = "R3"
            elif castle_new >= 5:
                target = "R2"
            else:
                target = None
            if target and _rank_order.get(effective_rank, 1) < _rank_order[target]:
                update["rank"] = target
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
async def list_events(archived: Optional[bool] = None, folder_id: Optional[str] = None, group_name: Optional[str] = None):
    query = {}
    if archived is not None:
        query["archived"] = archived
    if folder_id is not None:
        # Sentinel "none" lets the client ask for archived events NOT in any
        # folder (top-level of the archive). Otherwise match on the exact id.
        if folder_id == "none":
            query["$or"] = [{"folder_id": None}, {"folder_id": {"$exists": False}}]
        else:
            query["folder_id"] = folder_id
    # v61 — Hızlı Rapor: filter by exact group name (case-sensitive).
    if group_name is not None and group_name.strip():
        query["group_name"] = group_name.strip()
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
    # v125 — Auto-translate user-visible strings (name / subtitle / group)
    # to all 28 non-TR languages via DeepL before insert. Frontend picks
    # the right variant based on i18n.language. Runs inline so the very
    # first render after save already has translations.
    # v135.20 — Async translate manager: tek turda TÜM 3 alan çevirilir
    # (Google aktifken 28 batch call yerine 84 serial). Rate-limit + retry
    # + non-destructive semantik `_translate_fields` içinde yönetilir.
    try:
        await _translate_fields(payload, [
            ("name", "name_translations"),
            ("subtitle", "subtitle_translations"),
            ("group_name", "group_translations"),
        ])
    except Exception as ex:
        logger.warning(f"auto-translate event failed: {ex}")
    # Pop the recurrence knobs off before we turn the payload into an Event —
    # we generate concrete duplicates below rather than storing a rule.
    interval = (payload.pop("recurrence_interval", None) or "none")
    count = max(1, min(52, int(payload.pop("recurrence_count", 1) or 1)))
    # If we're spawning multiple events, stamp them with a shared series_id
    # so admins can later bulk-edit or delete the entire series in one call.
    series_id = str(uuid.uuid4()) if (interval != "none" and count > 1) else None
    if series_id:
        payload["series_id"] = series_id
    # v135.17 — EventCreate marks list/dict fields as Optional=None but the
    # Event storage model requires non-None (default_factory=list/dict).
    # Pydantic v2 doesn't coerce None → default, so strip None here or
    # Event(**payload) raises `list_type` ValidationError → 500 on POST.
    for _field, _default in (
        ("report_channels", []),
        ("alliance_thresholds", []),
        ("member_thresholds", []),
        ("name_translations", {}),
        ("subtitle_translations", {}),
        ("group_translations", {}),
        ("result_screenshots", []),
    ):
        if payload.get(_field) is None:
            payload[_field] = _default
    e = Event(**payload)
    created = [e]
    if interval != "none" and count > 1:
        from datetime import datetime as _dt, timedelta as _td
        try:
            base_dt = _dt.fromisoformat(str(payload.get("date")).replace("Z", "+00:00"))
        except Exception:
            base_dt = None
        step_days = {"daily": 1, "2days": 2, "weekly": 7, "2weekly": 14}.get(interval)
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
    # v125 — When the TR source of a user-visible field changes, refresh
    # its translations dict so stale variants don't linger in other langs.
    # v135.12 — DON'T overwrite with empty when DeepL is unavailable; leave
    # the existing dict so the value is not lost. Backfill sweep re-tries.
    # v135.20 — Async translate manager: değişen alanları batch'te çevir.
    try:
        _dirty_fields = []
        if "name" in update: _dirty_fields.append(("name", "name_translations"))
        if "subtitle" in update: _dirty_fields.append(("subtitle", "subtitle_translations"))
        if "group_name" in update: _dirty_fields.append(("group_name", "group_translations"))
        if _dirty_fields:
            await _translate_fields(update, _dirty_fields)
    except Exception as ex:
        logger.warning(f"auto-translate patch failed: {ex}")
    if update:
        # v135.36 — Track if this PATCH flips archived False→True on an
        # auto_certificate event so we can bulk-issue certs after the write.
        pre_doc = None
        if update.get("archived") is True:
            pre_doc = await db.events.find_one(
                {"id": event_id}, {"_id": 0, "archived": 1, "auto_certificate": 1},
            )
        res = await db.events.update_one({"id": event_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Etkinlik bulunamadı")
        if pre_doc and not pre_doc.get("archived") and pre_doc.get("auto_certificate"):
            try:
                fn = globals().get("_auto_issue_certs_for_event")
                if fn:
                    await fn(event_id)
            except Exception as ex:
                logger.warning(f"auto-cert on PATCH archive failed for {event_id}: {ex}")
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
        step_days = {"daily": 1, "2days": 2, "weekly": 7, "2weekly": 14}.get(interval)
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


class BulkBreakdownBody(BaseModel):
    ids: List[str]
    show_breakdown: bool


class GroupHiddenBody(BaseModel):
    group_name: str
    hidden: bool


class BulkArchiveBody(BaseModel):
    ids: List[str]
    archived: bool
    folder_id: Optional[str] = None  # Manuel arşiv: aynı anda klasöre taşı (None = değiştirme; "__none__" = klasörsüz yap)


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


@api_router.post("/events/bulk-breakdown")
async def events_bulk_breakdown(body: BulkBreakdownBody, _: dict = Depends(require_edit)):
    """Toggle `show_breakdown` on many events at once. Powers the archive
    "Alt detayı gizle/göster" chips on the bulk toolbar — flipping many
    tournament rounds off the leaderboard ▶ panel with one click."""
    ids = [i for i in (body.ids or []) if i]
    if not ids:
        return {"modified": 0}
    res = await db.events.update_many(
        {"id": {"$in": ids}},
        {"$set": {"show_breakdown": bool(body.show_breakdown)}},
    )
    return {"modified": res.modified_count, "show_breakdown": bool(body.show_breakdown)}


@api_router.post("/events/hide-group")
async def events_hide_group(body: GroupHiddenBody, _: dict = Depends(require_edit)):
    """Master toggle — flip `hidden_from_leaderboard` on every event of a
    tournament group in a single call. Powers the group header's
    "Sıralamada gizle / göster" master switch. When `hidden=True` the
    whole group vanishes from every leaderboard aggregate."""
    gn = (body.group_name or "").strip()
    if not gn:
        raise HTTPException(400, "group_name gerekli")
    res = await db.events.update_many(
        {"group_name": gn},
        {"$set": {"hidden_from_leaderboard": bool(body.hidden)}},
    )
    return {"modified": res.modified_count, "hidden": bool(body.hidden), "group_name": gn}


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
    # v135.36 — Collect auto-cert eligible events BEFORE flip.
    to_cert = []
    if bool(body.archived):
        rows = await db.events.find(
            {"id": {"$in": ids}, "archived": {"$ne": True}, "auto_certificate": True},
            {"_id": 0, "id": 1},
        ).to_list(2000)
        to_cert = [r["id"] for r in rows]
    set_doc: dict = {"archived": bool(body.archived)}
    # v136 — Manuel arşiv klasör seçimi. Sadece arşive alırken uygulanır.
    # "__none__" → klasörden çıkar, herhangi bir string → o klasöre taşı, None → dokunma.
    if bool(body.archived) and body.folder_id is not None:
        set_doc["folder_id"] = None if body.folder_id == "__none__" else body.folder_id
    res = await db.events.update_many(
        {"id": {"$in": ids}},
        {"$set": set_doc},
    )
    for eid in to_cert:
        try:
            fn = globals().get("_auto_issue_certs_for_event")
            if fn:
                await fn(eid)
        except Exception as ex:
            logger.warning(f"auto-cert on bulk-archive failed for {eid}: {ex}")
    return {"modified": res.modified_count, "archived": bool(body.archived)}


@api_router.post("/events/archive-group")
async def archive_group(group_name: str, _: dict = Depends(require_edit)):
    # v135.36 — First collect target events so we can auto-issue certs after
    # the archive flip (only on events that had `auto_certificate=True`).
    targets = await db.events.find(
        {"group_name": group_name, "archived": False},
        {"_id": 0, "id": 1, "auto_certificate": 1},
    ).to_list(2000)
    res = await db.events.update_many({"group_name": group_name, "archived": False}, {"$set": {"archived": True}})
    for ev in targets:
        if ev.get("auto_certificate"):
            try:
                fn = globals().get("_auto_issue_certs_for_event")
                if fn:
                    await fn(ev["id"])
            except Exception as ex:
                logger.warning(f"auto-cert on archive-group failed for {ev.get('id')}: {ex}")
    return {"modified": res.modified_count}


@api_router.post("/events/unarchive-group")
async def unarchive_group(group_name: str, _: dict = Depends(require_edit)):
    res = await db.events.update_many({"group_name": group_name, "archived": True}, {"$set": {"archived": False}})
    return {"modified": res.modified_count}


@api_router.post("/events/auto-archive-sweep")
async def auto_archive_sweep():
    """v129 — Cron-safe sweep: flip `archived=True` on any event whose
    `date` is in the past AND `auto_archive=True` and it's not already
    archived. When `auto_archive_folder_id` is set, also assign the
    event into that folder. No auth: called by /app/.emergent/crons.yml
    (idempotent — repeated runs are cheap no-ops)."""
    from datetime import datetime as _dt2, timezone as _tz2
    now = _dt2.now(_tz2.utc).isoformat()
    # Match past-dated, non-archived events flagged for auto-archive.
    q = {"auto_archive": True, "archived": {"$ne": True}, "date": {"$lt": now}}
    docs = await db.events.find(q, {"_id": 0, "id": 1, "auto_archive_folder_id": 1, "auto_certificate": 1}).to_list(2000)
    moved = 0
    for d in docs:
        upd = {"archived": True, "archived_at": now}
        fid = d.get("auto_archive_folder_id")
        if fid:
            upd["folder_id"] = fid
        await db.events.update_one({"id": d["id"]}, {"$set": upd})
        moved += 1
        # v135.36 — Auto-issue certificates on sweep-archive.
        if d.get("auto_certificate"):
            try:
                fn = globals().get("_auto_issue_certs_for_event")
                if fn:
                    await fn(d["id"])
            except Exception as ex:
                logger.warning(f"auto-cert on auto-archive-sweep failed for {d.get('id')}: {ex}")
    return {"moved": moved, "checked": len(docs)}



@api_router.post("/events/rename-group")
async def rename_group(old_name: str, new_name: str, _: dict = Depends(require_edit)):
    new_name = (new_name or "").strip()
    if not new_name:
        raise HTTPException(400, "new_name cannot be empty")
    if new_name == old_name:
        return {"modified": 0}
    # v125 — Auto-translate the renamed group so leaderboard chips and
    # event card headers pick up localized names on the next render.
    try:
        translations = await _auto_translate_all(new_name)
    except Exception as ex:
        logger.warning(f"auto-translate rename failed: {ex}")
        translations = None
    # v135.12 — Only overwrite if we got a non-empty result. Empty result
    # from DeepL means rate-limit or transient failure; keep existing so
    # backfill can retry.
    set_doc: dict = {"group_name": new_name}
    if translations is not None:
        set_doc["group_translations"] = translations
    res = await db.events.update_many(
        {"group_name": old_name},
        {"$set": set_doc},
    )
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


# ============================================================
# EVENT ARCHIVE FOLDERS
# ============================================================
# Folder taxonomy, templates, and per-group Win/Loose badges live in
# `routes/event_folders.py` (extracted Feb 18, 2026). Register that
# module's routes onto the shared `api_router` so URL paths stay
# identical (`/api/event-folders/*`, `/api/event-folder-templates/*`,
# `/api/event-group-results/*`).
from routes.event_folders import register_event_folders  # noqa: E402
# Lambda defers the `_auto_translate_all` lookup to call time so we can
# register before the helper is defined further down in this module.
register_event_folders(
    api_router, db, require_edit,
    auto_translate=lambda t: globals()["_auto_translate_all"](t),
)



@api_router.post("/events/{event_id}/compare-win")
async def record_compare_win(event_id: str, _: dict = Depends(require_edit)):
    """Increment the compare_wins counter — called by CompareEventsModal
    the first time an event beats another in an archive comparison. The
    archive event card then shows a 👑 badge with the total win count."""
    exists = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1})
    if not exists:
        raise HTTPException(404, "event not found")
    await db.events.update_one({"id": event_id}, {"$inc": {"compare_wins": 1}})
    doc = await db.events.find_one({"id": event_id}, {"_id": 0, "compare_wins": 1})
    return {"compare_wins": int((doc or {}).get("compare_wins") or 0)}


@api_router.get("/public/folder/{folder_id}")
async def public_folder_leaderboard(folder_id: str):
    """Read-only aggregated leaderboard for a folder — sums points × mult
    across every archived event inside. No auth required so admins can
    share season recaps via a copy-paste URL to the whole guild chat."""
    folder = await db.event_folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(404, "folder not found")
    events = await db.events.find(
        {"folder_id": folder_id, "archived": True},
        {"_id": 0},
    ).sort("date", -1).to_list(500)
    event_ids = [e["id"] for e in events]
    if not event_ids:
        return {"folder": folder, "events": [], "leaderboard": []}
    pipeline = [
        {"$match": {"event_id": {"$in": event_ids}}},
        {"$group": {
            "_id": "$member_id",
            "total_points": {"$sum": {"$multiply": [
                {"$ifNull": ["$points", 0]},
                {"$ifNull": ["$multiplier", 1]},
            ]}},
            "member_name": {"$last": "$member_name"},
            "event_count": {"$sum": 1},
        }},
        {"$sort": {"total_points": -1}},
        {"$limit": 500},
    ]
    rows = []
    async for row in db.points.aggregate(pipeline):
        rows.append({
            "member_id": row["_id"],
            "name": row.get("member_name") or "",
            "total_points": int(round(row.get("total_points") or 0)),
            "event_count": row.get("event_count", 0),
        })
    # Alliance + avatar enrichment so the public page can render badges
    # and portraits without extra round-trips.
    member_ids = [r["member_id"] for r in rows if r["member_id"]]
    if member_ids:
        members = await db.members.find(
            {"id": {"$in": member_ids}},
            {"_id": 0, "id": 1, "name": 1, "alliance_name": 1, "avatar_url": 1},
        ).to_list(500)
        m_by_id = {m["id"]: m for m in members}
        for r in rows:
            m = m_by_id.get(r["member_id"], {})
            r["alliance_name"] = m.get("alliance_name") or ""
            r["avatar_url"] = m.get("avatar_url")
            if not r["name"]:
                r["name"] = m.get("name") or ""
    # v131 — Users store their avatar on the user doc; propagate to linked
    # members here (fallback) so leaderboard rows always resolve to a URL
    # even when the member doc hasn't been backfilled yet.
    member_ids_needing_avatar = [r["member_id"] for r in rows if r["member_id"] and not r.get("avatar_url")]
    if member_ids_needing_avatar:
        linked_users = await db.users.find(
            {"member_ids": {"$in": member_ids_needing_avatar}, "avatar_url": {"$ne": None}},
            {"_id": 0, "avatar_url": 1, "member_ids": 1},
        ).to_list(500)
        user_avatar_by_member = {}
        for u in linked_users:
            for mid in (u.get("member_ids") or []):
                if mid and u.get("avatar_url") and mid not in user_avatar_by_member:
                    user_avatar_by_member[mid] = u["avatar_url"]
        for r in rows:
            if not r.get("avatar_url") and r["member_id"] in user_avatar_by_member:
                r["avatar_url"] = user_avatar_by_member[r["member_id"]]
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"folder": folder, "events": events, "leaderboard": rows}



@api_router.get("/reports/archive-points-export.csv")
async def archive_points_export_csv(_: dict = Depends(require_edit)):
    """Full member × event points dump for every archived event. Streams a
    CSV with `member_name, member_id, alliance, event_name, event_date,
    group_name, multiplier, base_points, final_points`. Powers the "CSV
    Toplu Dışa Aktar" button on the Leaderboard archive tab."""
    import io, csv
    events = await db.events.find({"archived": True}, {"_id": 0}).to_list(2000)
    ev_by_id = {e["id"]: e for e in events}
    if not events:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["member_name", "member_id", "alliance", "event_name", "event_date", "group_name", "multiplier", "base_points", "final_points"])
        return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="archive_points.csv"'})
    points = await db.points.find({"event_id": {"$in": list(ev_by_id.keys())}}, {"_id": 0}).to_list(20000)
    # Enrich with member data (alliance)
    member_ids = list({p.get("member_id") for p in points if p.get("member_id")})
    members = await db.members.find({"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "member_id": 1, "alliance_name": 1}).to_list(5000) if member_ids else []
    m_by_id = {m["id"]: m for m in members}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["member_name", "member_id", "alliance", "event_name", "event_date", "group_name", "multiplier", "base_points", "final_points"])
    for p in points:
        m = m_by_id.get(p.get("member_id"), {})
        e = ev_by_id.get(p.get("event_id"), {})
        base = int(p.get("points") or 0)
        mult = float(p.get("multiplier") or 1.0)
        # v63 — Puanlar tr-TR binlik ayraçlı.
        _tr = lambda n: f"{int(n):,}".replace(",", ".")
        w.writerow([
            p.get("member_name") or m.get("name") or "",
            m.get("member_id") or "",
            m.get("alliance_name") or "",
            p.get("event_name") or e.get("name") or "",
            str(e.get("date") or "")[:10],
            e.get("group_name") or "",
            mult,
            _tr(base),
            _tr(int(round(base * mult))),
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="archive_points.csv"'},
    )



@api_router.get("/reports/guild-data.csv")
async def reports_guild_data_csv(_: dict = Depends(require_edit)):
    """Guild-wide member + point summary. Streams a single flat CSV row
    per member with lifetime totals (attendance counts, total points,
    active-vs-archived point split) so admins can offline-archive the whole
    roster with one click. Powers the "Guild Data CSV" button on Members."""
    import io, csv
    members = await db.members.find({}, {"_id": 0}).to_list(5000)
    events = await db.events.find({}, {"_id": 0}).to_list(4000)
    ev_by_id = {e["id"]: e for e in events}
    points = await db.points.find({}, {"_id": 0}).to_list(50000)
    tally = {}
    for p in points:
        mid = p.get("member_id")
        if not mid:
            continue
        ev = ev_by_id.get(p.get("event_id"), {})
        base = int(p.get("points") or 0)
        mult = float(p.get("multiplier") or 1.0)
        final_ = int(round(base * mult))
        row = tally.setdefault(mid, {"total": 0, "active": 0, "archived": 0, "events": 0})
        row["total"] += final_
        row["events"] += 1
        if ev.get("archived"):
            row["archived"] += final_
        else:
            row["active"] += final_
    buf = io.StringIO()
    w = csv.writer(buf)
    # v63 — Rütbe sütunu kaldırıldı, puanlar tr-TR binlik ayraçlı.
    w.writerow([
        "member_id", "name", "alliance_name", "country", "power",
        "castle_level", "total_points", "active_points", "archived_points",
        "event_count",
    ])
    members_sorted = sorted(members, key=lambda m: -int(m.get("power") or 0))
    for m in members_sorted:
        t = tally.get(m.get("id"), {"total": 0, "active": 0, "archived": 0, "events": 0})
        def _tr(n):
            return f"{int(n):,}".replace(",", ".")
        w.writerow([
            m.get("member_id") or "",
            m.get("name") or "",
            m.get("alliance_name") or "",
            m.get("country") or "",
            m.get("power") or 0,
            m.get("castle_level") or "",
            _tr(t["total"]), _tr(t["active"]), _tr(t["archived"]), t["events"],
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="guild_data.csv"'},
    )


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
async def leaderboard(
    event_id: Optional[str] = None,
    event_name: Optional[str] = None,
    group_name: Optional[str] = None,
    scope: Optional[str] = None,
    member_scope: Optional[str] = None,
    alliance: Optional[str] = None,
):
    """
    Leaderboard endpoint with an optional 3-way member scope filter:
      - member_scope="global"  → all members (default when not passed too)
      - member_scope="server"  → only members flagged `scope="server"`
      - member_scope="clan"    → only members in the given `alliance` name
                                  (falls back to "GOW" if `alliance` is empty)
    Existing `scope` parameter is unchanged — controls event visibility (active/archived/hidden).

    v140.28 — Yeni `event_name` parametresi: aynı ada sahip TÜM etkinlikleri
    (recurring series) toplar. `group_name` verilirse grubun tüm etkinliklerine
    ait puanlar toplanır. Öncelik: event_id → group_name → event_name.
    """
    match_stage = {}
    if event_id:
        match_stage["event_id"] = event_id
    elif group_name:
        # Tüm grup üyelerine ait etkinliklerin id'lerini bul
        ev_query = {"group_name": group_name, "hidden_from_leaderboard": {"$ne": True}}
        evs = await db.events.find(ev_query, {"_id": 0, "id": 1}).to_list(500)
        match_stage["event_id"] = {"$in": [e["id"] for e in evs]}
    elif event_name:
        # Aynı ada sahip (recurring series) tüm etkinlikleri topla
        ev_query = {"name": event_name, "hidden_from_leaderboard": {"$ne": True}}
        evs = await db.events.find(ev_query, {"_id": 0, "id": 1}).to_list(500)
        match_stage["event_id"] = {"$in": [e["id"] for e in evs]}
    else:
        if scope == "hidden":
            event_query = {"hidden_from_leaderboard": True}
        else:
            event_query = {"hidden_from_leaderboard": {"$ne": True}}
        if scope in ("active", "archived"):
            event_query["archived"] = (scope == "archived")
        events = await db.events.find(event_query, {"_id": 0, "id": 1}).to_list(2000)
        match_stage["event_id"] = {"$in": [e["id"] for e in events]}
    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {"$project": {"member_id": 1, "weighted": {"$multiply": ["$points", {"$ifNull": ["$multiplier", 1.0]}]}}},
        {"$group": {"_id": "$member_id", "total_points": {"$sum": "$weighted"}}},
        # Only surface members with at least 1 point — zero/null scorers stay hidden.
        {"$match": {"total_points": {"$gt": 0}}},
        {"$sort": {"total_points": -1}},
        {"$limit": 500},
    ]
    agg = await db.points.aggregate(pipeline).to_list(500)
    member_ids = [r["_id"] for r in agg]
    # Build the member query WITH the 3-way scope filter so pagination stays honest.
    member_query: dict = {"id": {"$in": member_ids}}
    if member_scope == "server":
        member_query["scope"] = {"$in": ["server", None]}
    elif member_scope == "clan":
        # v61 — CASE-SENSITIVE exact alliance match. `GOW` (ana) ile
        # `GoW` / `GOw` (akademi) birbirinden bağımsızdır.
        alliance_val = (alliance or "GOW").strip()
        member_query["alliance_name"] = alliance_val
    # member_scope="global" or missing → no extra filter
    members = await db.members.find(member_query, {"_id": 0}).to_list(len(member_ids)) if member_ids else []
    m_by_id = {m["id"]: m for m in members}
    result = []
    rank_pos = 0
    for r in agg:
        m = m_by_id.get(r["_id"])
        if not m:
            continue
        rank_pos += 1
        result.append({
            "member_id": r["_id"],
            "name": m["name"],
            "rank": m["rank"],
            "level": m.get("level", 1),
            "title": m.get("title"),
            "alliance_name": m.get("alliance_name"),
            # v131 — leaderboard cards + rows now show avatars. Return the
            # url so the frontend doesn't need a second round-trip per row.
            "avatar_url": m.get("avatar_url"),
            "total_points": int(r["total_points"]),
            "position": rank_pos,
        })
    # v131 — Fallback lookup: if a member has no `avatar_url` yet, check if
    # a linked user has one and surface that so the podium/rows never miss
    # portraits when the member doc hasn't been synced.
    member_ids_needing_avatar = [x["member_id"] for x in result if not x.get("avatar_url")]
    if member_ids_needing_avatar:
        linked_users = await db.users.find(
            {"member_ids": {"$in": member_ids_needing_avatar}, "avatar_url": {"$ne": None}},
            {"_id": 0, "avatar_url": 1, "member_ids": 1},
        ).to_list(500)
        user_avatar_by_member: dict = {}
        for u in linked_users:
            for mid in (u.get("member_ids") or []):
                if mid and u.get("avatar_url") and mid not in user_avatar_by_member:
                    user_avatar_by_member[mid] = u["avatar_url"]
        for row in result:
            if not row.get("avatar_url") and row["member_id"] in user_avatar_by_member:
                row["avatar_url"] = user_avatar_by_member[row["member_id"]]
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


# v64 — Alliance Drill-Down. Returns every event that had at least one
# scoring member from the given (case-sensitive) alliance, plus a matrix of
# per-member point rows so admins can inline-edit right from the modal.
@api_router.get("/alliances/{alliance_name}/drill")
async def alliance_drill(alliance_name: str):
    """Return per-event / per-member points for a single alliance.

    v64 — CASE-SENSITIVE: `GOW`, `GoW`, `GOw` are DIFFERENT alliances (main
    vs. academy). No merging.

    Shape:
      {
        alliance: str,
        total_points: int,
        events: [{event_id, event_name, group_name, date, archived,
                   total: int, members: [{point_id, member_id, name,
                   points, multiplier, final_points, note}]}]
      }
    """
    alliance = (alliance_name or "").strip()
    if not alliance:
        raise HTTPException(400, "alliance_name gerekli")
    # Case-sensitive exact match; no `.upper()`/`.lower()`.
    m_docs = await db.members.find(
        {"alliance_name": alliance}, {"_id": 0, "id": 1, "name": 1, "alliance_name": 1}
    ).to_list(5000)
    if not m_docs:
        return {"alliance": alliance, "total_points": 0, "events": []}
    m_by_id = {m["id"]: m for m in m_docs}
    mids = list(m_by_id.keys())

    points = await db.points.find(
        {"member_id": {"$in": mids}}, {"_id": 0}
    ).to_list(50000)
    if not points:
        return {"alliance": alliance, "total_points": 0, "events": []}

    eids = list({p.get("event_id") for p in points if p.get("event_id")})
    ev_docs = await db.events.find({"id": {"$in": eids}}, {"_id": 0}).to_list(5000)
    ev_by_id = {e["id"]: e for e in ev_docs}

    events_out: dict = {}
    for p in points:
        eid = p.get("event_id")
        if not eid:
            continue
        ev = ev_by_id.get(eid)
        if not ev:
            continue
        member = m_by_id.get(p.get("member_id"))
        if not member:
            continue
        base = int(p.get("points") or 0)
        mult = float(p.get("multiplier") or 1.0)
        final_pts = int(round(base * mult))
        bucket = events_out.setdefault(eid, {
            "event_id": eid,
            "event_name": ev.get("name") or "",
            "group_name": ev.get("group_name") or "",
            "date": ev.get("date") or "",
            "archived": bool(ev.get("archived")),
            "total": 0,
            "members": [],
        })
        bucket["total"] += final_pts
        bucket["members"].append({
            "point_id": p.get("id"),
            "member_id": member["id"],
            "name": member.get("name") or "",
            "points": base,
            "multiplier": mult,
            "final_points": final_pts,
            "note": p.get("note") or "",
            "date": p.get("date") or "",
        })

    events_list = []
    for eid, bucket in events_out.items():
        bucket["members"].sort(key=lambda r: r["final_points"], reverse=True)
        events_list.append(bucket)
    # Chronological desc (newest first)
    events_list.sort(key=lambda e: str(e.get("date") or ""), reverse=True)

    total_points = sum(e["total"] for e in events_list)
    return {
        "alliance": alliance,
        "total_points": total_points,
        "members_count": len(m_docs),
        "events": events_list,
    }



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
    # v63 — Enrich with alliance names for the alliance column; drop `Rütbe`.
    m_docs = await db.members.find({}, {"_id": 0, "id": 1, "alliance_name": 1}).to_list(10000)
    alliance_by_id = {m["id"]: (m.get("alliance_name") or "") for m in m_docs}
    output = io.StringIO()
    writer = csv.writer(output)
    # v63 — İttifak sütunu solda, Rütbe kaldırıldı. Puanlar tr-TR binlik ayraçlı.
    writer.writerow(["Sıra", "İttifak", "İsim", "Seviye", "Ünvan", "Toplam Puan"])
    for r in lb:
        pts_str = f"{int(r['total_points']):,}".replace(",", ".")
        writer.writerow([
            r["position"],
            alliance_by_id.get(r.get("member_id"), "") or "",
            r["name"],
            r.get("level", ""),
            r.get("title", "") or "",
            pts_str,
        ])
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

    # v63 — Turkish thousand separator for Excel numeric cells. Excel
    # renders this as `1.000.000` under tr-TR locale; other locales still
    # sort numerically because we store the raw int, not a string.
    TR_NUMBER_FMT = "#,##0"

    # Sheet 1: Üye Listesi — İttifak cell painted with full alliance color + contrasting text
    # v63 — "Rütbe" sütunu kaldırıldı (kullanıcı isteği).
    ws1 = make_sheet("Üye Listesi", ["İttifak", "Üye", "ID", "Kale", "Tetikçi", "Bombacı", "Kalkanlı"])
    for i, m in enumerate(members, start=2):
        alliance = m.get("alliance_name") or ""
        ws1.cell(row=i, column=1, value=alliance)
        ws1.cell(row=i, column=2, value=m.get("name") or "")
        ws1.cell(row=i, column=3, value=m.get("member_id") or "")
        ws1.cell(row=i, column=4, value=m.get("castle_level") or "")
        ws1.cell(row=i, column=5, value=fmt_dual(m.get("tetikci_f"), m.get("tetikci_t")))
        ws1.cell(row=i, column=6, value=fmt_dual(m.get("bombaci_f"), m.get("bombaci_t")))
        ws1.cell(row=i, column=7, value=fmt_dual(m.get("kalkanli_f"), m.get("kalkanli_t")))
        if alliance:
            c = hex_for(alliance)
            ac = ws1.cell(row=i, column=1)
            ac.fill = PatternFill("solid", fgColor=c)
            ac.font = Font(bold=True, color=contrast_text(c))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # Sheet 2: Etkinlik Kayıtları — v63: İttifak sütunu (metin, sola), Rütbe kaldırıldı.
    ws2 = make_sheet("Etkinlik Kayıtları", ["İttifak", "Üye", "Etkinlik", "Puan", "Not", "Tarih"])
    for i, p in enumerate(points, start=2):
        m = m_by_id.get(p["member_id"], {})
        alliance = m.get("alliance_name") or ""
        ws2.cell(row=i, column=1, value=alliance)
        ws2.cell(row=i, column=2, value=p.get("member_name") or m.get("name") or "")
        ws2.cell(row=i, column=3, value=p.get("event_name") or "")
        pts = int(p["points"]) * float(p.get("multiplier", 1.0))
        pts_cell = ws2.cell(row=i, column=4, value=int(pts))
        pts_cell.number_format = TR_NUMBER_FMT
        ws2.cell(row=i, column=5, value=p.get("note") or "")
        try:
            dt = datetime.fromisoformat(str(p["date"]).replace("Z", "+00:00"))
            ws2.cell(row=i, column=6, value=dt.strftime("%d.%m.%Y %H:%M"))
        except Exception:
            ws2.cell(row=i, column=6, value=str(p.get("date") or ""))
        if alliance:
            soft = blend_with_white(hex_for(alliance), 0.22)
            row_fill = PatternFill("solid", fgColor=soft)
            for col in range(1, 7):
                ws2.cell(row=i, column=col).fill = row_fill
            # v63 — Solid alliance color on the İttifak cell (col 1) for scanability
            full = hex_for(alliance)
            ac = ws2.cell(row=i, column=1)
            ac.fill = PatternFill("solid", fgColor=full)
            ac.font = Font(bold=True, color=contrast_text(full))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # Sheet 3: Sıralama Listesi — v63: Rütbe kaldırıldı, "Etkinlik Bileşimi" eklendi.
    lb = await leaderboard()
    scored_ids = {r["member_id"] for r in lb}
    full_lb = list(lb) + [
        {"member_id": m["id"], "name": m.get("name") or "", "rank": m.get("rank") or "", "total_points": 0}
        for m in members if m["id"] not in scored_ids
    ]
    # v63 — Build per-member event breakdown (event_name → summed final points).
    # Rapor detayı: "Toplam = SvS + KaFeS + ..." açıkça belirtilsin.
    breakdown_by_mid: dict = {}
    for p in points:
        mid = p.get("member_id")
        if not mid:
            continue
        ev_name = (p.get("event_name") or "?").strip()
        pts_final = int(int(p.get("points") or 0) * float(p.get("multiplier") or 1.0))
        breakdown_by_mid.setdefault(mid, {})[ev_name] = breakdown_by_mid.get(mid, {}).get(ev_name, 0) + pts_final

    def _fmt_breakdown(mid: str, total: int) -> str:
        parts = breakdown_by_mid.get(mid, {})
        if not parts:
            return ""
        # Show as "SvS (1.200.000) + KaFeS (400.000) = 1.600.000" — grouped, largest first.
        items = sorted(parts.items(), key=lambda x: -x[1])
        rendered = " + ".join(f"{ev} ({v:,})".replace(",", ".") for ev, v in items)
        total_str = f"{total:,}".replace(",", ".")
        return f"{rendered} = {total_str}"

    ws3 = make_sheet("Sıralama Listesi", ["Sıra", "Üye", "İttifak", "Puan", "Etkinlik Bileşimi"])
    for idx, r in enumerate(full_lb, start=1):
        i = idx + 1
        m = m_by_id.get(r["member_id"], {})
        alliance = m.get("alliance_name") or ""
        ws3.cell(row=i, column=1, value=idx)
        ws3.cell(row=i, column=2, value=r["name"])
        ws3.cell(row=i, column=3, value=alliance)
        pts_cell = ws3.cell(row=i, column=4, value=int(r["total_points"]))
        pts_cell.number_format = TR_NUMBER_FMT
        ws3.cell(row=i, column=5, value=_fmt_breakdown(r["member_id"], int(r["total_points"])))
        if alliance:
            full = hex_for(alliance)
            soft = blend_with_white(full, 0.22)
            row_fill = PatternFill("solid", fgColor=soft)
            for col in range(1, 6):
                ws3.cell(row=i, column=col).fill = row_fill
            ac = ws3.cell(row=i, column=3)
            ac.fill = PatternFill("solid", fgColor=full)
            ac.font = Font(bold=True, color=contrast_text(full))
            ac.alignment = Alignment(horizontal="center", vertical="center")

    # Sheet 4: İttifak Sıralaması — v63: Puan sütunu binlik ayraçlı.
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
        pts_cell = ws4.cell(row=i, column=4, value=stats["points"])
        pts_cell.number_format = TR_NUMBER_FMT
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


class AllianceScopeBody(BaseModel):
    scope: str  # "global" | "server"


@api_router.get("/alliance-scopes")
async def list_alliance_scopes():
    """Per-alliance default scope (Global/Sunucu) used to render the toggle
    above each alliance header on the Members page."""
    docs = await db.alliance_scopes.find({}, {"_id": 0}).to_list(500)
    return {d["name"]: d.get("scope", "server") for d in docs}


@api_router.post("/alliances/{name}/scope")
async def set_alliance_scope(name: str, body: AllianceScopeBody, _: dict = Depends(require_edit)):
    """Sets an alliance's scope AND cascades that scope to every member with
    the same alliance_name — so leaders can flip the whole guild in one tap
    without having to edit each member individually."""
    if body.scope not in ("global", "server"):
        raise HTTPException(400, "scope must be 'global' or 'server'")
    await db.alliance_scopes.update_one(
        {"name": name},
        {"$set": {"name": name, "scope": body.scope, "updated_at": now_iso()}},
        upsert=True,
    )
    result = await db.members.update_many(
        {"alliance_name": name},
        {"$set": {"scope": body.scope}},
    )
    return {"name": name, "scope": body.scope, "members_updated": result.modified_count}


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
# Legacy local-disk directory kept for backward compatibility so any
# `/api/uploads/<legacy-filename>.png` URLs stored in Mongo before the
# object-storage migration keep serving. New uploads (below) go straight
# to Emergent Object Store via routes.uploads._put_object → same path
# the rest of the app (VIP attachments, event banners, image dropzone)
# already uses.
UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB


@api_router.post("/upload")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(require_edit)):
    """Persist a commander/hero art image to Emergent Object Store and
    register it in the shared `files` collection so the same `/api/uploads/
    {file_id}` route (from routes.uploads) can stream it back later.

    Response shape is intentionally the superset of what the old local-disk
    variant returned — `url`, `filename`, `size` — plus `id` and
    `content_type` so newer frontend code can adopt the file-id contract
    without breaking legacy callers that only read `res.data.url`.
    """
    from routes.uploads import _put_object, ALLOWED_EXT, MAX_BYTES, MIME_BY_EXT, APP_NAME

    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXT:
        # Fall back to content-type sniffing so drag-drop without extension works.
        guessed = mimetypes.guess_extension((file.content_type or "").split(";")[0]) or ""
        ext = guessed.lstrip(".").lower() if guessed.lstrip(".").lower() in ALLOWED_EXT else ""
        if not ext:
            raise HTTPException(400, f"Unsupported image type: {file.content_type or filename}")
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_BYTES // (1024 * 1024)}MB)")

    content_type = MIME_BY_EXT.get(ext, file.content_type or "application/octet-stream")
    file_id = uuid.uuid4().hex
    path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    result = _put_object(path, data, content_type)
    await db.files.insert_one({
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": filename,
        "content_type": content_type,
        "size": len(data),
        "owner_id": user["id"],
        "purpose": "commander",
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {
        "url": f"/api/uploads/{file_id}",
        "filename": filename,
        "size": len(data),
        "id": file_id,
        "content_type": content_type,
    }


@api_router.post("/uploads/migrate-legacy")
async def uploads_migrate_legacy(_: dict = Depends(require_admin)):
    """Manually re-run the legacy `/app/uploads/*` → Object Store migration.
    Idempotent so admins can hit this after dropping fresh files in
    /app/uploads. Restart is NOT required."""
    from scripts.migrate_legacy_uploads import migrate_legacy_uploads
    return await migrate_legacy_uploads(db)


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


# ---------- Translation Engine (Google Cloud Translation API v2, DeepL fallback) ----------
# v135.16 — Primary engine switched to Google Cloud Translation API. DeepL is
# kept as a fallback so existing production deployments keep working during
# migration. `_translate_one` retains its historic name so no caller
# needs to change; the function now dispatches to whichever key is set.
GOOGLE_TRANSLATION_API_KEY = os.environ.get("GOOGLE_TRANSLATION_API_KEY", "").strip()
DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "").strip()

# Google Translation uses ISO 639-1 mostly; a couple of remaps for the app's
# enabled locales (nb → no is the Google-preferred code for Norwegian).
GOOGLE_LANG_MAP = {
    "tr": "tr", "en": "en", "ru": "ru", "de": "de", "fr": "fr", "es": "es",
    "ko": "ko", "ar": "ar",
    "bg": "bg", "cs": "cs", "da": "da", "el": "el", "et": "et", "fi": "fi", "hu": "hu",
    "id": "id", "it": "it", "ja": "ja", "lt": "lt", "lv": "lv", "nb": "no", "nl": "nl",
    "pl": "pl", "pt": "pt", "ro": "ro", "sk": "sk", "sl": "sl", "sv": "sv", "uk": "uk",
    "zh": "zh",
}

# v133.6 — TR ve AR eklendi (önceden eksikti — /api/translate Türkçe/Arapça hedef
# istendiğinde None dönüyordu). ET (Estonca) TR'den ayrıdır ve karışmaz.
DEEPL_LANG_MAP = {
    # i18n code -> DeepL code
    "tr": "TR", "en": "EN-GB", "ru": "RU", "de": "DE", "fr": "FR", "es": "ES",
    "ko": "KO", "ar": "AR",
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


V9_I18N_KEYS = {
    "lb_folder_back": "← Klasörler",
    "lb_folder_no_groups": "Bu klasörde grup yok",
    "lb_folder_no_folders": "Klasör oluşturulmadı",
    "lb_folder_group_count": "{{n}} grup",
    "lb_folder_no_events": "Etkinlik yok",
    "lb_active_group_expand_show": "Etkinlikleri göster",
    "lb_active_group_expand_hide": "Etkinlikleri gizle",
    "ev_show_breakdown_label": "🔍 Alt detaylar görünsün mü?",
    "ev_show_breakdown_hint_on": "Sıralamada grubun ▶ paneli açıldığında bu etkinlik puanıyla listelenir.",
    "ev_show_breakdown_hint_off": "Bu etkinlik grubun ▶ panelinde gizli — puan yine grup toplamına katılır ama tek tek görünmez.",
    "ev_bulk_breakdown_hide": "🔍❌ Alt Detay Gizle",
    "ev_bulk_breakdown_show": "🔍✓ Alt Detay Göster",
    "ev_bulk_breakdown_hide_tip": "Seçili etkinliklerin alt detay panelini gizle (grup toplamı korunur)",
    "ev_bulk_breakdown_show_tip": "Seçili etkinliklerin alt detay panelini geri aç",
    "ev_group_hidden_badge": "🚫 Gizli",
    "ev_group_hidden_hint_hidden": "Bu grup sıralamadan gizli — geri açmak için tıkla",
    "ev_group_hidden_hint_visible": "Tüm grubu sıralamadan gizle",
    "ev_group_hide_confirm": '"{{group}}" grubundaki {{n}} etkinlik sıralamadan gizlensin mi?',
    "ev_group_show_confirm": '"{{group}}" grubundaki {{n}} etkinlik sıralamaya geri eklensin mi?',
    "ev_group_type_label": "Grup Tipi",
    "ev_group_type_grouped": "Gruplu",
    "ev_group_type_ungrouped": "Grupsuz",
    "ev_ungrouped_events_label": "Grupsuz Etkinlikler",
    "poll_tg_details_toggle": "📡 TG Oy Detayları",
    "poll_tg_details_hide": "TG oy detaylarını gizle",
    "poll_tg_details_show": "TG oy detaylarını göster",
    "poll_tg_no_votes": "Henüz TG oyu yok",
    "poll_tg_voters_header": "Telegram Oy Verenler",
    "poll_tg_admin_only_note": "Detaylı liste yalnızca yönetici görünümünde.",
    "poll_loading": "Yükleniyor…",
}

I18N_FILE_PATH = "/app/frontend/src/i18n/index.js"
I18N_RETRY_LOCALES = ("de", "fr", "es", "ko", "ar", "bg", "cs", "da", "el", "et",
                     "fi", "hu", "id_", "it", "ja", "lt", "lv", "nb", "nl",
                     "pl", "ro", "sk", "sl")
I18N_DEEPL_MAP = {"de": "DE", "fr": "FR", "es": "ES", "ko": "KO", "ar": "AR",
                  "bg": "BG", "cs": "CS", "da": "DA", "el": "EL", "et": "ET",
                  "fi": "FI", "hu": "HU", "id_": "ID", "it": "IT", "ja": "JA",
                  "lt": "LT", "lv": "LV", "nb": "NB", "nl": "NL", "pl": "PL",
                  "ro": "RO", "sk": "SK", "sl": "SL"}


@api_router.post("/cron/deepl-retry-i18n")
async def cron_deepl_retry_i18n(request: Request):
    """Nightly self-healer for the v9 i18n backfill. Scans every non-{tr,en,ru,pt}
    locale block in `/app/frontend/src/i18n/index.js`, finds v9 keys still
    missing (throttled during the initial backfill), and re-attempts them
    via DeepL. Patches the file in-place with any new translations.
    Idempotent: keys already present are skipped; keys where DeepL still
    returns the source stay untouched so `fallbackLng: ["en", "tr"]` keeps
    working. Cron auth via `WEBHOOK_CRON_SECRET` matches the sibling
    prune-deepl-log endpoint."""
    import re
    import os as _os
    import asyncio
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {WEBHOOK_CRON_SECRET}"
    if not WEBHOOK_CRON_SECRET or not _hmac_cron.compare_digest(auth, expected):
        raise HTTPException(401, "cron secret mismatch")
    if not DEEPL_API_KEY:
        return {"skipped": "deepl_key_missing"}
    if not _os.path.exists(I18N_FILE_PATH):
        return {"skipped": "i18n_file_missing"}
    src = open(I18N_FILE_PATH, "r", encoding="utf-8").read()
    patched = 0
    per_locale: Dict[str, int] = {}
    for locale in I18N_RETRY_LOCALES:
        m = re.search(rf"^const {re.escape(locale)} = \{{(.*?)^\}};", src, re.M | re.S)
        if not m:
            continue
        block = m.group(1)
        missing = [k for k in V9_I18N_KEYS if not re.search(rf"\b{re.escape(k)}:\s", block)]
        if not missing:
            continue
        deepl_code = I18N_DEEPL_MAP[locale]
        additions: List[str] = []
        for key in missing:
            tr_value = V9_I18N_KEYS[key]
            translated_map = await _translate_one(tr_value, target_langs=[deepl_code])
            translated = translated_map.get(deepl_code)
            if not translated or translated.strip() == tr_value.strip():
                continue
            placeholder_ok = True
            for tok in re.findall(r"\{\{[^}]+\}\}", tr_value):
                if tok not in translated:
                    placeholder_ok = False
                    break
            if not placeholder_ok:
                continue
            escaped = translated.replace("\\", "\\\\").replace('"', '\\"')
            additions.append(f'  {key}: "{escaped}",')
            await asyncio.sleep(0.4)
        if not additions:
            continue
        insertion = "\n  // __V9_DEEPL_RETRY__\n" + "\n".join(additions) + "\n"
        m2 = re.search(rf"^const {re.escape(locale)} = \{{(.*?)^\}};", src, re.M | re.S)
        if not m2:
            continue
        block_close = src.rfind("};", m2.start(), m2.end())
        src = src[:block_close] + insertion + src[block_close:]
        patched += len(additions)
        per_locale[locale] = len(additions)
    if patched:
        open(I18N_FILE_PATH, "w", encoding="utf-8").write(src)
    # v135.13 — Piggyback event/folder translations backfill onto this nightly
    # cron. Same DeepL key + rate-limit backoff apply. Non-destructive: only
    # empty translation dicts are filled; existing values are preserved.
    events_result = await _backfill_event_translations()
    # v135.21 — Proactive quota alarm (Resend). No-op if usage < 80% or if
    # an alarm was already sent in the last 24h.
    try:
        await _send_translate_quota_alarm_if_needed()
    except Exception as _e:
        logger.warning(f"[quota-alarm] pre-check failed: {_e}")
    return {"patched": patched, "per_locale": per_locale, "events_backfill": events_result}


async def _backfill_event_translations() -> dict:
    """Shared helper: scan events + event_folders for empty translation dicts
    and fill them via the active translation engine (Google preferred,
    DeepL fallback). Non-destructive.

    v135.18 — When Google is active, uses batch endpoint: per target lang,
    send all pending texts in ONE call (up to 128). Reduces backfill from
    O(events × langs) round-trips to O(langs) round-trips per field type.
    Falls back to per-text serial translation when Google key absent.
    """
    if not (GOOGLE_TRANSLATION_API_KEY or DEEPL_API_KEY):
        return {"skipped": "no_translation_key"}
    # Collect all events + folders needing translation, per field.
    pending_events: List[dict] = []
    async for e in db.events.find({}):
        need_name = bool(e.get("name")) and not (e.get("name_translations") or {})
        need_group = bool(e.get("group_name")) and not (e.get("group_translations") or {})
        need_subtitle = bool(e.get("subtitle")) and not (e.get("subtitle_translations") or {})
        if need_name or need_group or need_subtitle:
            pending_events.append({
                "_id": e["_id"],
                "name": e.get("name") if need_name else None,
                "group_name": e.get("group_name") if need_group else None,
                "subtitle": e.get("subtitle") if need_subtitle else None,
            })
    pending_folders: List[dict] = []
    async for f in db.event_folders.find({}):
        if f.get("name") and not (f.get("name_translations") or {}):
            pending_folders.append({"_id": f["_id"], "name": f["name"]})

    target_langs = [lg for lg in ENABLED_LANGS if lg != "tr"]
    filled_name = filled_group = filled_subtitle = filled_folder = 0

    if GOOGLE_TRANSLATION_API_KEY:
        # v135.18 — Batch path: per lang, one request for ALL pending texts.
        # Build per-lang translations dict for each field, then apply.
        def _collect(field: str, docs: List[dict]) -> List[dict]:
            return [d for d in docs if d.get(field)]

        for field in ("name", "group_name", "subtitle"):
            docs_for_field = _collect(field, pending_events)
            if not docs_for_field:
                continue
            texts = [d[field] for d in docs_for_field]
            # per_doc_trans[i] will accumulate {lang: translation} for docs_for_field[i]
            per_doc_trans: List[dict] = [{} for _ in docs_for_field]
            for lang in target_langs:
                translations = await _google_translate_batch(texts, lang)
                for idx, tr in enumerate(translations):
                    if tr:
                        per_doc_trans[idx][lang] = tr
            # Write back
            trans_field = {"name": "name_translations", "group_name": "group_translations",
                           "subtitle": "subtitle_translations"}[field]
            for d, tr_dict in zip(docs_for_field, per_doc_trans):
                if tr_dict:
                    await db.events.update_one({"_id": d["_id"]}, {"$set": {trans_field: tr_dict}})
                    if field == "name": filled_name += 1
                    elif field == "group_name": filled_group += 1
                    elif field == "subtitle": filled_subtitle += 1
        # Folders
        if pending_folders:
            texts = [f["name"] for f in pending_folders]
            per_folder_trans: List[dict] = [{} for _ in pending_folders]
            for lang in target_langs:
                translations = await _google_translate_batch(texts, lang)
                for idx, tr in enumerate(translations):
                    if tr:
                        per_folder_trans[idx][lang] = tr
            for f, tr_dict in zip(pending_folders, per_folder_trans):
                if tr_dict:
                    await db.event_folders.update_one({"_id": f["_id"]}, {"$set": {"name_translations": tr_dict}})
                    filled_folder += 1
    else:
        # DeepL fallback path: original per-text serial translation.
        for d in pending_events:
            updates: dict = {}
            for field, tfield in (("name", "name_translations"),
                                    ("group_name", "group_translations"),
                                    ("subtitle", "subtitle_translations")):
                if d.get(field):
                    tr = await _auto_translate_all(d[field])
                    if tr:
                        updates[tfield] = tr
                        if field == "name": filled_name += 1
                        elif field == "group_name": filled_group += 1
                        elif field == "subtitle": filled_subtitle += 1
            if updates:
                await db.events.update_one({"_id": d["_id"]}, {"$set": updates})
        for f in pending_folders:
            tr = await _auto_translate_all(f["name"])
            if tr:
                await db.event_folders.update_one({"_id": f["_id"]}, {"$set": {"name_translations": tr}})
                filled_folder += 1

    return {
        "scanned_events": len(pending_events),
        "filled_name": filled_name,
        "filled_group": filled_group,
        "filled_subtitle": filled_subtitle,
        "filled_folder": filled_folder,
        "engine": "google" if GOOGLE_TRANSLATION_API_KEY else "deepl",
    }


@api_router.post("/events/backfill-translations")
async def events_backfill_translations(_: dict = Depends(require_admin)):
    """v135.12 — One-shot backfill: scan all events and re-translate any
    that have empty or missing `name_translations`, `group_translations` or
    `subtitle_translations`. Skips docs whose relevant source field is blank.
    Never overwrites existing non-empty translations. Respects DeepL 429
    rate limits via the retry-with-backoff logic in `_translate_one`.
    v135.13 — Delegates to the shared `_backfill_event_translations` helper
    (nightly cron uses the same helper).
    """
    if not DEEPL_API_KEY:
        raise HTTPException(503, "DEEPL_API_KEY not configured")
    return await _backfill_event_translations()


@api_router.get("/translate/health")
async def translate_health(_: dict = Depends(require_admin)):
    """v135.15 — Admin dashboard widget: canlı çeviri sağlığı.
    Returns: {configured, plan, cache_size, events_missing, folders_missing,
             usage_last_24h: {calls, chars, top_langs}, retry_429_last_24h,
             quota: {character_count, character_limit}}. Non-fatal on any
     sub-check failure — returns partial data so the widget still renders."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    active_key = GOOGLE_TRANSLATION_API_KEY or DEEPL_API_KEY
    engine = "google" if GOOGLE_TRANSLATION_API_KEY else ("deepl" if DEEPL_API_KEY else None)
    out: dict = {
        "configured": bool(active_key),
        "engine": engine,
        "plan": "google-cloud" if GOOGLE_TRANSLATION_API_KEY else (("free" if DEEPL_API_KEY.endswith(":fx") else "pro") if DEEPL_API_KEY else None),
        "cache_size": len(_DEEPL_CACHE),
        "cache_max": _DEEPL_CACHE_MAX,
        "events_missing": 0,
        "folders_missing": 0,
        "usage_last_24h": {"calls": 0, "chars": 0, "top_langs": []},
        "retry_429_last_24h": None,
        "quota": None,
    }
    # Count events with empty translations (non-blank source).
    try:
        async for e in db.events.find({}, {"_id": 0, "name": 1, "group_name": 1,
                                          "name_translations": 1, "group_translations": 1}):
            if e.get("name") and not (e.get("name_translations") or {}):
                out["events_missing"] += 1
                continue
            if e.get("group_name") and not (e.get("group_translations") or {}):
                out["events_missing"] += 1
        async for f in db.event_folders.find({}, {"_id": 0, "name": 1, "name_translations": 1}):
            if f.get("name") and not (f.get("name_translations") or {}):
                out["folders_missing"] += 1
    except Exception:
        pass
    # Usage in last 24h from deepl_translate_log.
    try:
        cutoff = (_dt.now(_tz.utc) - _td(hours=24)).isoformat()
        logs = await db.deepl_translate_log.find({"ts": {"$gte": cutoff}}, {"_id": 0}).to_list(20000)
        calls = len(logs)
        chars = sum(int(r.get("chars", 0) or 0) for r in logs)
        lang_counts: dict = {}
        for r in logs:
            for l in r.get("targets", []) or []:
                lang_counts[l] = lang_counts.get(l, 0) + 1
        top_langs = sorted(lang_counts.items(), key=lambda x: -x[1])[:5]
        out["usage_last_24h"] = {"calls": calls, "chars": chars,
                                  "top_langs": [{"lang": l, "count": c} for l, c in top_langs]}
    except Exception:
        pass
    # DeepL quota + 429 count (best-effort DeepL /usage call).
    if DEEPL_API_KEY:
        try:
            base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
            headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}"}
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(f"{base}/usage", headers=headers)
                if r.status_code == 200:
                    d = r.json()
                    out["quota"] = {
                        "character_count": d.get("character_count", 0),
                        "character_limit": d.get("character_limit", 0),
                        "percent": round(100 * (d.get("character_count", 0) or 0) / max(1, d.get("character_limit", 0) or 1), 2),
                    }
        except Exception:
            pass
    return out


@api_router.get("/translate/status")
async def translate_status(_: dict = Depends(require_admin)):
    """v135.13 — Admin diagnostic: verifies DeepL is reachable and shows
    which env source is populated. Production troubleshooting for the
    'preview çeviriyor ama production çevirmiyor' scenario — call this
    from any env and it reports {configured, key_last4, plan, test_ok,
    test_translation, sample_error}. If `configured=false` in production,
    add DEEPL_API_KEY to the deploy environment via Emergent UI."""
    result = {
        "configured": bool(DEEPL_API_KEY),
        "key_last4": DEEPL_API_KEY[-4:] if DEEPL_API_KEY else None,
        "plan": ("free" if DEEPL_API_KEY.endswith(":fx") else "pro") if DEEPL_API_KEY else None,
        "test_ok": False,
        "test_translation": None,
        "sample_error": None,
    }
    if not DEEPL_API_KEY:
        result["sample_error"] = "DEEPL_API_KEY not set in environment"
        return result
    try:
        out = await _translate_one("Merhaba", target_langs=["en"])
        result["test_translation"] = out.get("en")
        result["test_ok"] = bool(out.get("en"))
        if not result["test_ok"]:
            result["sample_error"] = "DeepL returned empty result — check rate limits / key validity"
    except Exception as ex:
        result["sample_error"] = f"{type(ex).__name__}: {ex}"[:200]
    return result


@api_router.get("/events/{event_id}/rsvp/list")
async def event_rsvp_list(event_id: str, _: dict = Depends(require_edit)):
    """Admin-only per-user RSVP list for an event. Powers the tap-through
    modal on /etkinlikler so leadership can see exactly who said yes/maybe/no
    and chase the absentees. Regular members must never hit this endpoint.

    Filtered by the event's `alliance_scope` (v54)."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1, "alliance_scope": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    scope = ev.get("alliance_scope")
    q = {"event_id": event_id, **_rsvp_alliance_query(scope)}
    rows = await db.event_rsvps.find(
        q,
        {"_id": 0, "user_id": 1, "username": 1, "status": 1, "updated_at": 1},
    ).to_list(2000)
    # v55: live-alliance recheck — pruen legacy or stale-scope RSVPs.
    rows = await _filter_rsvps_by_current_alliance(rows, scope)
    # Backfill missing usernames from users collection (older RSVPs may lack it).
    missing = [r["user_id"] for r in rows if not r.get("username") and r.get("user_id")]
    if missing:
        users = await db.users.find({"id": {"$in": missing}}, {"_id": 0, "id": 1, "username": 1}).to_list(2000)
        by_id = {u["id"]: u.get("username") for u in users}
        for r in rows:
            if not r.get("username"):
                r["username"] = by_id.get(r.get("user_id")) or r.get("user_id") or "—"
    rows.sort(key=lambda r: (r.get("username") or "").lower())
    return {"event_id": event_id, "items": rows}


@api_router.get("/events/{event_id}/rsvp/no-shows")
async def event_rsvp_no_shows(event_id: str, _: dict = Depends(require_edit)):
    """RSVP no-shows: users who said "yes" for this event but have no
    attendance record on any linked member. Powers the "Söyledi Gelmedi 👻"
    column on /raporlar > Etkinlik Katılım."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1, "alliance_scope": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    scope = ev.get("alliance_scope")
    yes_rows = await db.event_rsvps.find(
        {"event_id": event_id, "status": "yes", **_rsvp_alliance_query(scope)},
        {"_id": 0, "user_id": 1, "username": 1},
    ).to_list(2000)
    # v55: live-alliance recheck — no-shows list also respects the scope so
    # non-GOW members never surface even if they were RSVP'd legacy.
    yes_rows = await _filter_rsvps_by_current_alliance(yes_rows, scope)
    if not yes_rows:
        return {"event_id": event_id, "count": 0, "items": []}
    user_ids = [r["user_id"] for r in yes_rows if r.get("user_id")]
    # Resolve linked member_ids per user (users.member_ids list, legacy member_id, or members.user_id)
    users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "username": 1, "member_ids": 1, "member_id": 1}).to_list(2000)
    reverse_members = await db.members.find({"user_id": {"$in": user_ids}}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)
    user_to_members: dict = {}
    for u in users:
        mids = set()
        for m in (u.get("member_ids") or []):
            if m: mids.add(m)
        if u.get("member_id"): mids.add(u["member_id"])
        user_to_members[u["id"]] = mids
    for m in reverse_members:
        user_to_members.setdefault(m["user_id"], set()).add(m["id"])
    # Attendance for this event
    att = await db.event_attendance.find({"event_id": event_id}, {"_id": 0, "member_id": 1}).to_list(5000)
    attended_members = {a["member_id"] for a in att}
    username_by_id = {u["id"]: u.get("username") for u in users}
    items = []
    for r in yes_rows:
        uid = r.get("user_id")
        if not uid: continue
        linked = user_to_members.get(uid, set())
        # User counted as no-show only if NONE of their linked members attended.
        # Unlinked users also count (they RSVPd but can't map to a member).
        if linked and (linked & attended_members):
            continue
        items.append({"user_id": uid, "username": r.get("username") or username_by_id.get(uid) or uid})
    items.sort(key=lambda x: (x.get("username") or "").lower())
    return {"event_id": event_id, "count": len(items), "items": items}


class RsvpRemindBody(BaseModel):
    include_maybe: bool = True
    custom_body: Optional[str] = None  # optional override for the push body text


@api_router.post("/events/{event_id}/rsvp/remind")
async def event_rsvp_remind(event_id: str, body: RsvpRemindBody, _: dict = Depends(require_edit)):
    """Manual reminder push to everyone who RSVP'd yes (+ maybe by default).
    Uses the same VAPID webpush path as the cron job. If `custom_body` is
    provided (trimmed non-empty) it replaces the default message so admins
    can add rally cries or last-minute tips. Returns {sent, matched}."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1, "name": 1, "date": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    statuses = ["yes", "maybe"] if body.include_maybe else ["yes"]
    rsvps = await db.event_rsvps.find(
        {"event_id": event_id, "status": {"$in": statuses}},
        {"_id": 0, "user_id": 1},
    ).to_list(2000)
    user_ids = list({r["user_id"] for r in rsvps if r.get("user_id")})
    if not user_ids:
        return {"sent": 0, "matched": 0}
    subs = await db.push_subscriptions.find({"user_id": {"$in": user_ids}}, {"_id": 0}).to_list(500)
    if not subs:
        return {"sent": 0, "matched": len(user_ids), "note": "no push subscriptions"}
    try:
        dt = datetime.fromisoformat(str(ev.get("date")).replace("Z", "+00:00"))
        hhmm = dt.strftime("%H:%M")
    except Exception:
        hhmm = ""
    custom = (body.custom_body or "").strip()
    push_body = custom if custom else f"{ev['name']} için hatırlatma: Bugün saat {hhmm}!"
    # Cap length so a stray novel doesn't blow up the push payload.
    if len(push_body) > 240:
        push_body = push_body[:237] + "…"
    private_pem, _pub = await _get_or_create_vapid()
    payload = json.dumps({
        "title": "📣 Etkinlik hatırlatması",
        "body": push_body,
        "url": f"/etkinlikler#event-{event_id}",
        "tag": f"rsvp-manual-{event_id}",
    }, ensure_ascii=False)
    sent = 0
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
    return {"sent": sent, "matched": len(user_ids)}


@api_router.get("/events/{event_id}/rsvp/summary")
async def event_rsvp_summary(event_id: str, _: dict = Depends(require_edit)):
    """Admin-only rollup of RSVP counts per event. Used by /etkinlikler cards
    to show attendance at a glance. Regular members must never see these
    aggregates — the endpoint is gated by `require_edit`.

    Only RSVPs whose stored `alliance` matches the event's `alliance_scope`
    are counted (v54) so summaries respect the GOW-only default."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1, "alliance_scope": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    scope = ev.get("alliance_scope")
    q = {"event_id": event_id, **_rsvp_alliance_query(scope)}
    rows = await db.event_rsvps.find(q, {"_id": 0, "status": 1, "user_id": 1}).to_list(2000)
    # v55 belt-and-suspenders: re-check each user's LIVE alliance so stale
    # or legacy RSVPs never leak into aggregates.
    rows = await _filter_rsvps_by_current_alliance(rows, scope)
    yes = sum(1 for r in rows if r.get("status") == "yes")
    maybe = sum(1 for r in rows if r.get("status") == "maybe")
    no = sum(1 for r in rows if r.get("status") == "no")
    return {"event_id": event_id, "yes_count": yes, "maybe_count": maybe, "no_count": no}


async def _rsvp_reminder_task():
    """v140.9 — DEPRECATED. `_event_reminder_loop` yeni pathway. Bu task
    artık NO-OP; sadece geri uyumluluk için endpoint hala 2xx dönsün diye
    bırakıldı. Etkinlik hatırlatmaları per-lead olarak
    (`reminder_minutes` ∈ {15,30,60,120}) `_event_reminder_loop` üzerinden
    tek noktadan gidiyor. Bu task çalışırsa çift Telegram + çift push olur.
    """
    logger.info("[rsvp-reminder] NO-OP (deprecated; use _event_reminder_loop)")
    return


@api_router.post("/cron/rsvp-reminder-tick")
async def cron_rsvp_reminder_tick(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("authorization", "")
    expected = f"Bearer {WEBHOOK_CRON_SECRET}"
    if not WEBHOOK_CRON_SECRET or not _hmac_cron.compare_digest(auth, expected):
        raise HTTPException(401, "unauthorized")
    _asyncio_cron.create_task(_rsvp_reminder_task())
    return {"accepted": True}


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


# v135.21 — Proactive Google Cloud Translation quota alarm.
# Google Cloud v2 API has no `/usage` endpoint (unlike DeepL), so we compute
# character usage from our own `deepl_translate_log` for the current calendar
# month. When usage crosses `GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS` × 0.80,
# we send a Resend email to `DIGEST_ADMIN_EMAIL`. A 24h cooldown record is
# kept in `translate_quota_alarms` to prevent spam.
GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS = int(
    os.environ.get("GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS", "500000") or "500000"
)


async def _compute_translate_month_usage() -> dict:
    """Return {"chars": int, "limit": int, "percent": float, "month": "YYYY-MM"}
    for the current calendar month, aggregated from `deepl_translate_log`.
    Non-fatal on DB errors — returns 0 usage."""
    from datetime import datetime as _dt, timezone as _tz
    now = _dt.now(_tz.utc)
    month_start = _dt(now.year, now.month, 1, tzinfo=_tz.utc).isoformat()
    limit = GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS
    try:
        chars = 0
        async for r in db.deepl_translate_log.find(
            {"ts": {"$gte": month_start}}, {"_id": 0, "chars": 1}
        ):
            chars += int(r.get("chars", 0) or 0)
    except Exception:
        chars = 0
    pct = round(100.0 * chars / max(1, limit), 2)
    return {"chars": chars, "limit": limit, "percent": pct,
            "month": f"{now.year:04d}-{now.month:02d}"}


async def _send_translate_quota_alarm_if_needed(force: bool = False) -> dict:
    """When monthly Google translation usage ≥ 80% of the configured limit,
    send a Resend email to the admin. Enforces a 24h cooldown per calendar
    month via the `translate_quota_alarms` collection. Returns a diagnostic
    dict so the manual trigger endpoint can surface the outcome.
    """
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    usage = await _compute_translate_month_usage()
    result = {"sent": False, "usage": usage, "reason": None}
    threshold_pct = 80.0
    if not force and usage["percent"] < threshold_pct:
        result["reason"] = "below_threshold"
        return result
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    admin_email = os.environ.get("DIGEST_ADMIN_EMAIL", "").strip()
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
    if not resend_key or not admin_email:
        result["reason"] = "resend_or_admin_not_configured"
        return result
    # 24h cooldown — check most recent alarm for this month.
    try:
        cutoff = (_dt.now(_tz.utc) - _td(hours=24)).isoformat()
        recent = await db.translate_quota_alarms.find_one(
            {"month": usage["month"], "ts": {"$gte": cutoff}},
            {"_id": 0, "ts": 1},
        )
        if recent and not force:
            result["reason"] = "cooldown_active"
            return result
    except Exception:
        pass
    try:
        import resend as _resend
        _resend.api_key = resend_key
        pct = usage["percent"]
        html = (
            "<div style='background:#0F0806;color:#F5F0E8;font-family:Arial,sans-serif;padding:24px'>"
            "<h2 style='color:#E74C1A;margin:0 0 4px 0;font-family:Georgia,serif'>TiTaNXiS · Çeviri Kotası Uyarısı</h2>"
            f"<div style='color:#888;font-size:12px;margin-bottom:20px'>{usage['month']} · {_dt.now(_tz.utc).strftime('%Y-%m-%d %H:%M UTC')}</div>"
            f"<div style='background:rgba(231,76,26,.12);border:1px solid rgba(231,76,26,.4);padding:16px;border-radius:8px;margin-bottom:16px'>"
            f"<div style='color:#F5A623;font-size:11px;text-transform:uppercase;letter-spacing:.14em'>Kullanım (Bu Ay)</div>"
            f"<div style='color:#E74C1A;font-size:28px;font-weight:bold;font-family:monospace'>{pct}%</div>"
            f"<div style='color:#F5F0E8;font-size:13px;font-family:monospace'>{usage['chars']:,} / {usage['limit']:,} karakter</div>"
            "</div>"
            "<p style='color:#F5F0E8;font-size:13px;line-height:1.6'>Google Cloud Translation API aylık kotasının <b>%80'i aşıldı</b>. "
            "Kalan kotayı korumak için lütfen kontrol panelinden <a href='https://console.cloud.google.com/apis/api/translate.googleapis.com/quotas' style='color:#C4B5FD'>Google Cloud Console</a> üzerinden limit yükseltmesi yapın ya da çeviri hacmini kısıtlayın.</p>"
            "<p style='color:#888;font-size:11px;margin-top:20px'>Bu e-posta 24 saat cooldown ile gönderilir. Eşik: 80% · Env: <code>GOOGLE_TRANSLATION_MONTHLY_LIMIT_CHARS</code>.</p>"
            "</div>"
        )
        params = {
            "from": sender, "to": [admin_email],
            "subject": f"[TiTaNXiS] Çeviri Kotası %{pct} — {usage['chars']:,}/{usage['limit']:,} char",
            "html": html,
        }
        send_result = await _asyncio_cron.to_thread(_resend.Emails.send, params)
        rid = send_result.get("id") if isinstance(send_result, dict) else send_result
        await db.translate_quota_alarms.insert_one({
            "ts": _dt.now(_tz.utc).isoformat(),
            "month": usage["month"],
            "chars": usage["chars"],
            "limit": usage["limit"],
            "percent": usage["percent"],
            "resend_id": str(rid) if rid else None,
            "forced": bool(force),
        })
        logger.info(f"[quota-alarm] Resend send OK id={rid} pct={pct} month={usage['month']}")
        result["sent"] = True
        result["resend_id"] = str(rid) if rid else None
    except Exception as e:
        logger.error(f"[quota-alarm] send failed: {e}")
        result["reason"] = f"send_error: {str(e)[:200]}"
    return result


@api_router.get("/translate/quota-alarm/status")
async def translate_quota_alarm_status(_: dict = Depends(require_admin)):
    """Admin diagnostic — current month usage + last alarm log entries."""
    usage = await _compute_translate_month_usage()
    try:
        recent = await db.translate_quota_alarms.find(
            {}, {"_id": 0}
        ).sort("ts", -1).to_list(10)
    except Exception:
        recent = []
    return {
        "usage": usage,
        "threshold_percent": 80.0,
        "recent_alarms": recent,
        "resend_configured": bool(os.environ.get("RESEND_API_KEY", "").strip()),
        "admin_email_configured": bool(os.environ.get("DIGEST_ADMIN_EMAIL", "").strip()),
    }


@api_router.post("/translate/quota-alarm/trigger")
async def translate_quota_alarm_trigger(
    force: bool = False, _: dict = Depends(require_admin)
):
    """Admin manual trigger — evaluates threshold and (optionally) sends an
    alarm right now. Pass `?force=true` to bypass threshold + cooldown for
    verifying the Resend path end-to-end."""
    return await _send_translate_quota_alarm_if_needed(force=force)


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


# v135.14 — Simple in-process DeepL translation cache. Same "Kafes" 9 event'te
# 9 kez API çağırıyor → cache hit ile 1'e düşer. Key: `(text, tuple(langs))`.
# TTL yok (translations are stable), max size 512 (LRU-ish via dict order).
_DEEPL_CACHE: dict = {}
_DEEPL_CACHE_MAX = 512


async def _google_translate_batch(texts: List[str], target_lang: str) -> List[str]:
    """v135.18 — Batch translate up to 128 texts to a single target language
    in ONE Google Cloud API v2 call. Returns list of translations parallel
    to input order; empty string for entries that DeepL rejected. Used by
    the backfill sweep to reduce per-lang round-trips from 9 events × 1
    call each (9 calls) to a single batched call (~9x speedup on backfill).
    Individual event create still uses per-lang single-text call because
    Google's v2 API only batches TEXTS to ONE lang, not vice-versa.
    """
    import asyncio as _asyncio
    if not GOOGLE_TRANSLATION_API_KEY or not texts:
        return [""] * len(texts)
    base = "https://translation.googleapis.com/language/translate/v2"
    gcode = GOOGLE_LANG_MAP.get(target_lang.lower(), target_lang.lower())
    # Chunk into 128 to respect Google's per-request limit.
    out: List[str] = []
    for i in range(0, len(texts), 128):
        chunk = texts[i:i + 128]
        attempts = 0
        while attempts < 4:
            attempts += 1
            try:
                async with httpx.AsyncClient(timeout=60) as client:
                    r = await client.post(
                        base,
                        params={"key": GOOGLE_TRANSLATION_API_KEY},
                        json={"q": chunk, "source": "tr", "target": gcode, "format": "text"},
                    )
                    if r.status_code in (429, 403):
                        wait_s = 2 ** attempts
                        try:
                            ra = int(r.headers.get("Retry-After") or "0")
                            if ra > 0: wait_s = min(ra, 30)
                        except Exception: pass
                        logger.warning(f"Google batch {r.status_code} lang={target_lang} attempt={attempts} — sleeping {wait_s}s")
                        await _asyncio.sleep(wait_s)
                        continue
                    r.raise_for_status()
                    tr_list = ((r.json().get("data") or {}).get("translations") or [])
                    out.extend([(t.get("translatedText") or "").strip() for t in tr_list])
                    # Pad if response shorter than input (defensive).
                    while len(out) < i + len(chunk):
                        out.append("")
                    break
            except Exception as ex:
                if attempts >= 4:
                    logger.warning(f"Google batch final failure lang={target_lang}: {ex}")
                    out.extend([""] * len(chunk))
                    break
                await _asyncio.sleep(1.5 * attempts)
    return out[:len(texts)]


async def _translate_fields(doc: dict, fields: List[tuple]) -> None:
    """v135.20 — Async Translate Manager: merkezi çeviri yöneticisi.

    Multi-field döküman için tek turda TÜM alan çevirilerini yürütür.
    Google aktifken batch API path'ini kullanır (28 API call for N fields,
    her batch içinde N source metin) → serial'a göre ~N kat hız artışı.
    DeepL fallback'te per-field serial fallback yapar (davranış korunur).

    Args:
        doc: In-place güncellenen dict (payload / update dokümanı).
        fields: [(source_field, translations_field), ...] tuple listesi.
                Örn: [("name", "name_translations"), ("group_name", "group_translations")]

    Semantik:
        - Boş/None kaynak alanı atlanır
        - Boş çeviri sonucu (None) mevcut dict'i overwrite ETMEZ → backfill retry
        - Non-empty çeviri sonucu doc[translations_field] = {lang: tr} yazılır

    Gelecekte yeni içerik tipi eklendiğinde:
        await _translate_fields(payload, [("q", "q_translations"), ("desc", "desc_translations")])
    """
    texts: List[str] = []
    slots: List[tuple] = []  # (index_in_texts, translations_field)
    for src_field, tr_field in fields:
        val = (doc.get(src_field) or "").strip() if isinstance(doc.get(src_field), str) else None
        if val:
            slots.append((len(texts), tr_field))
            texts.append(val)
    if not texts:
        return
    try:
        results = await _auto_translate_batch(texts)
        for idx, tr_field in slots:
            tr = results[idx]
            if tr is not None:  # non-destructive on empty
                doc[tr_field] = tr
    except Exception as ex:
        logger.warning(f"_translate_fields failed: {ex}")


async def _auto_translate_batch(texts: List[str]) -> List[Optional[dict]]:
    """v135.19 — Batch multiple TR source texts to all 28 non-TR target langs
    in ~28 API round-trips (one per lang) instead of `len(texts) × 28` per-text
    round-trips. Returns list of translation dicts parallel to `texts`; each
    entry is `{lang: translation}` or `None` if all langs failed for that
    text. Google-only optimization — falls back to per-text serial via
    `_auto_translate_all` when only DeepL is configured.
    """
    if not texts:
        return []
    if not GOOGLE_TRANSLATION_API_KEY:
        results: List[Optional[dict]] = []
        for t in texts:
            r = await _auto_translate_all(t)
            results.append(r)
        return results
    target_langs = [lg for lg in ENABLED_LANGS if lg != "tr"]
    per_text: List[dict] = [{} for _ in texts]
    for lang in target_langs:
        translations = await _google_translate_batch(texts, lang)
        for idx, tr in enumerate(translations):
            if tr:
                per_text[idx][lang] = tr
    return [d if d else None for d in per_text]


async def _translate_one(text: str, target_langs=None):
    """Translate `text` from Turkish to each of the target languages.

    v135.16 — Dispatches to Google Cloud Translation API v2 if
    `GOOGLE_TRANSLATION_API_KEY` is set, otherwise falls back to DeepL for
    backward compatibility. Same signature as the historic DeepL-only
    implementation so no caller changes.

    v135.12 — Robust to rate-limit (429) responses with exponential backoff.
    v135.14 — In-process LRU cache (module-level `_DEEPL_CACHE`).
    """
    import asyncio as _asyncio
    if not text:
        return {}
    if not GOOGLE_TRANSLATION_API_KEY and not DEEPL_API_KEY:
        return {}
    # v135.14 — Cache lookup. Same source + target set → return cached dict.
    _langs_key = tuple(target_langs or ENABLED_LANGS)
    _cache_key = (text, _langs_key)
    if _cache_key in _DEEPL_CACHE:
        _cached = _DEEPL_CACHE.pop(_cache_key)
        _DEEPL_CACHE[_cache_key] = _cached
        return dict(_cached)

    langs = target_langs or ENABLED_LANGS
    out: dict = {}

    # ── Primary path: Google Cloud Translation API v2 ───────────────────────
    if GOOGLE_TRANSLATION_API_KEY:
        base = "https://translation.googleapis.com/language/translate/v2"
        async with httpx.AsyncClient(timeout=30) as client:
            for lang in langs:
                gcode = GOOGLE_LANG_MAP.get(lang.lower(), lang.lower())
                attempts = 0
                max_attempts = 4
                while attempts < max_attempts:
                    attempts += 1
                    try:
                        r = await client.post(
                            base,
                            params={"key": GOOGLE_TRANSLATION_API_KEY},
                            json={"q": [text], "source": "tr", "target": gcode, "format": "text"},
                        )
                        if r.status_code == 429 or r.status_code == 403:
                            # 429 = rate limit; 403 = quota exceeded. Backoff.
                            wait_s = 2 ** attempts
                            try:
                                ra = int(r.headers.get("Retry-After") or "0")
                                if ra > 0: wait_s = min(ra, 30)
                            except Exception:
                                pass
                            logger.warning(f"Google Translate {r.status_code} lang={lang} attempt={attempts} — sleeping {wait_s}s")
                            await _asyncio.sleep(wait_s)
                            continue
                        r.raise_for_status()
                        tr_list = ((r.json().get("data") or {}).get("translations") or [])
                        if tr_list:
                            candidate = (tr_list[0].get("translatedText") or "").strip()
                            if candidate:
                                out[lang] = candidate
                        break
                    except httpx.HTTPStatusError as e:
                        logger.warning(f"Google Translate HTTP {e.response.status_code} lang={lang}: {e.response.text[:120]}")
                        break
                    except Exception as ex:
                        if attempts >= max_attempts:
                            logger.warning(f"Google Translate final failure lang={lang} after {attempts}: {ex}")
                            break
                        await _asyncio.sleep(1.5 * attempts)
        if out:
            if len(_DEEPL_CACHE) >= _DEEPL_CACHE_MAX:
                _DEEPL_CACHE.pop(next(iter(_DEEPL_CACHE)), None)
            _DEEPL_CACHE[_cache_key] = dict(out)
        return out

    # ── Fallback path: DeepL (v135.12 retry/backoff logic preserved) ────────
    base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=30) as client:
        for lang in langs:
            deepl_lang = DEEPL_LANG_MAP.get(lang, lang.upper())
            attempts = 0
            max_attempts = 4
            while attempts < max_attempts:
                attempts += 1
                try:
                    r = await client.post(f"{base}/translate", headers=headers,
                                          json={"text": [text], "target_lang": deepl_lang, "source_lang": "TR"})
                    if r.status_code == 429:
                        wait_s = 2 ** attempts
                        try:
                            ra = int(r.headers.get("Retry-After") or "0")
                            if ra > 0: wait_s = min(ra, 30)
                        except Exception:
                            pass
                        logger.warning(f"DeepL 429 for lang={lang} attempt={attempts} — sleeping {wait_s}s")
                        await _asyncio.sleep(wait_s)
                        continue
                    r.raise_for_status()
                    tr_list = r.json().get("translations", [])
                    if tr_list:
                        candidate = tr_list[0].get("text", "").strip()
                        if candidate: out[lang] = candidate
                    break
                except httpx.HTTPStatusError as e:
                    logger.warning(f"DeepL HTTP {e.response.status_code} for lang={lang}: {e.response.text[:120]}")
                    break
                except Exception as ex:
                    if attempts >= max_attempts:
                        logger.warning(f"DeepL final failure for lang={lang} after {attempts} attempts: {ex}")
                        break
                    await _asyncio.sleep(1.5 * attempts)
    if out:
        if len(_DEEPL_CACHE) >= _DEEPL_CACHE_MAX:
            _DEEPL_CACHE.pop(next(iter(_DEEPL_CACHE)), None)
        _DEEPL_CACHE[_cache_key] = dict(out)
    return out


async def _auto_translate_all(text: Optional[str]) -> Optional[dict]:
    s = (text or "").strip()
    if not s or (not GOOGLE_TRANSLATION_API_KEY and not DEEPL_API_KEY):
        return {}
    target = [lg for lg in ENABLED_LANGS if lg != "tr"]
    result = await _translate_one(s, target_langs=target)
    if not result:
        return None
    return result



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
        result[text] = await _translate_one(text, target_langs=body.target_langs)
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
            tr_map = await _translate_one(src)
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


# v135.23 — Notification preferences enforcement helper.
# The user Profile → "Bildirim Türleri" panel writes per-channel opt-outs
# (`rsvp`, `announcement`, `streak`, `sadiklar`) into `users.notification_prefs`.
# This helper returns the set of user_ids whose pref for `pref_key` is False
# so the push / in-app fan-out can drop them WITHOUT touching the master
# `notification_enabled` flag (that's the nuclear "silence everything" switch).
# Missing keys default to True → existing users keep receiving all channels.
async def _users_disabled_for_pref(pref_key: str) -> set:
    """Return set(user_id) whose `notification_prefs.<pref_key> == False`."""
    if not pref_key:
        return set()
    disabled: set = set()
    cursor = db.users.find(
        {f"notification_prefs.{pref_key}": False},
        {"_id": 0, "id": 1},
    )
    async for u in cursor:
        if u.get("id"):
            disabled.add(u["id"])
    return disabled


async def _broadcast_push(title: str, body: str, url: str = "/", tag: str = "titanxis", group_name: Optional[str] = None, alliance_name: Optional[str] = None, country_iso2: Optional[str] = None, event_id: Optional[str] = None, sound: Optional[str] = None, notif_pref: Optional[str] = None):
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
    # v135.23 — Per-channel opt-out (Profile → Bildirim Türleri panel).
    if notif_pref:
        opted_out_users |= await _users_disabled_for_pref(notif_pref)
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
    # v140.9 — Duplicate guard. Aynı `event_id` için ±60 sn içinde aynı zamana
    # planlanmış (henüz gönderilmemiş) push varsa yenisi yaratılmasın.
    # Bu, `EventReminderDialog`'un çift submit edilmesi veya cron retry gibi
    # senaryolarda çift Telegram + push oluşmasını engeller.
    if body.event_id:
        low = (when - _td(seconds=60)).isoformat()
        high = (when + _td(seconds=60)).isoformat()
        dup = await db.push_scheduled.find_one(
            {
                "event_id": body.event_id,
                "sent": False,
                "scheduled_at": {"$gte": low, "$lte": high},
            },
            {"_id": 0},
        )
        if dup:
            logger.info(f"[push-scheduled] duplicate blocked event={body.event_id} at={body.scheduled_at} existing={dup.get('id')}")
            return dup
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
# DEEPL_LANG_MAP keys so `_translate_one` routes to the correct DeepL
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
                tr_map = await _translate_one(text, target_langs=[target_lang])
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
            # v137.2 — Test mesajı: `is_test=True` ile yalnızca TEST_CHAT_ID'ye
            # yönlenir; asıl kanala/gruba test mesajı gitmez.
            result["telegram_channel_sent"] = await _tg_send(
                os.environ["TELEGRAM_CHANNEL_ID"].strip(),
                f"🧪 *{title}*\n\n{msg}",
                is_test=True,
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
        # v137.2 — Test mesajları: fan_out isteklerini yok say ve yalnızca
        # TEST_CHAT_ID'ye tek DM gönder. Böylece hiçbir üye kazayla test
        # push almaz.
        from telegram_bot import TELEGRAM_TEST_CHAT_ID as _TEST_CID
        targets: List[Dict[str, str]] = [
            {"username": "TEST_GROUP", "chat_id": str(_TEST_CID), "source": "test_override"}
        ]
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


async def _broadcast_group_ids(notif_type: Optional[str] = None) -> list:
    """v140.23 — Bota kayıtlı tüm grup chat_id'lerinin dedup'lı listesi.
    Kaynaklar:
      1. `db.telegram_bot_groups` (bot bir gruba eklendiğinde `process_update`
         auto-upsert yapıyor).
      2. `TELEGRAM_CHANNEL_ID` env var (kayıtlı gruplar boşsa fallback +
         her zaman set'e dahil).
    Yeni etkinlik bildirimleri BU listeyi kullanmaz — o özel olarak
    `TELEGRAM_EVENT_TEST_GROUP`'a gider (bkz. `send_event_notification`).

    v140.25 — Optional `notif_type` filtresi: grup'un
    `notification_settings[notif_type]` false ise o grup listeden çıkarılır.
    Type default'u True (opt-out sistemi)."""
    ids = set()
    settings_map = {}  # chat_id_str → notification_settings dict
    try:
        async for g in db.telegram_bot_groups.find({}, {"_id": 0, "chat_id": 1, "notification_settings": 1}):
            cid = g.get("chat_id")
            if cid is None:
                continue
            cid_str = str(cid)
            ids.add(cid_str)
            settings_map[cid_str] = g.get("notification_settings") or {}
    except Exception as ex:
        logger.debug(f"_broadcast_group_ids db read failed: {ex}")
    fallback = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    if fallback:
        ids.add(fallback)
    if notif_type:
        ids = {cid for cid in ids if settings_map.get(cid, {}).get(notif_type, True)}
    return sorted(ids)


DEFAULT_NOTIFICATION_SETTINGS = {
    "yeni_etkinlik": True,
    "etkinlik_hatirlatma": True,
    "duyurular": True,
    "dogum_gunu": True,
    "streak": True,
    "gorev": True,
}


@api_router.get("/telegram/groups")
async def telegram_groups_list(_: dict = Depends(require_admin)):
    """v140.25 — Bota kayıtlı Telegram grupları + her birinin bildirim ayarları."""
    rows = await db.telegram_bot_groups.find({}, {"_id": 0}).sort("last_seen", -1).to_list(200)
    for r in rows:
        # Backward-compat: eski docs'ta notification_settings yoksa default doldur
        current = r.get("notification_settings") or {}
        r["notification_settings"] = {**DEFAULT_NOTIFICATION_SETTINGS, **current}
    return rows


class NotifSettingsUpdate(BaseModel):
    notification_settings: dict


@api_router.patch("/telegram/groups/{group_id}/notifications")
async def telegram_group_update_notifications(group_id: str, body: NotifSettingsUpdate, _: dict = Depends(require_admin)):
    """v140.25 — Bir grubun bildirim ayarlarını güncelle. `group_id` chat_id (string
    veya int olarak yollanabilir)."""
    # chat_id int veya string olabilir — her ikisiyle de eşleştir
    try:
        cid_int = int(group_id)
    except Exception:
        cid_int = None
    filter_q = {"$or": [{"chat_id": group_id}]}
    if cid_int is not None:
        filter_q["$or"].append({"chat_id": cid_int})
    # Sadece bilinen anahtarlar (bool)
    clean = {k: bool(v) for k, v in (body.notification_settings or {}).items()
             if k in DEFAULT_NOTIFICATION_SETTINGS}
    if not clean:
        raise HTTPException(400, "notification_settings boş veya geçersiz")
    res = await db.telegram_bot_groups.update_one(
        filter_q,
        {"$set": {f"notification_settings.{k}": v for k, v in clean.items()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Grup bulunamadı")
    return {"updated": True, "notification_settings": clean}


async def _send_tg_channel(doc: dict) -> dict:
    """Broadcast the scheduled push to EVERY registered Telegram group.

    v140.23 — Fan-out via `_broadcast_group_ids()`. Her grup için tek gönderim
    (dedupe DB'de zaten set olarak yapılıyor); ayrıca çağrıyı yalnızca 1 kez
    tetikleyen `push_scheduled_loop`'un idempotent claim'i çift göndermeyi
    engelliyor.

    When `doc.image_url` is provided we use `sendPhoto` (caption up to 1024
    chars) so announcements render as a rich card in the group; otherwise
    fall back to plain `sendMessage`."""
    from telegram_bot import send_message as _tg_send, send_photo as _tg_photo
    out = {"channel_sent": False, "channel_delivered": 0, "channel_targets": 0}
    if not os.environ.get("TELEGRAM_BOT_TOKEN", "").strip():
        return out
    if not doc.get("send_channel", True):
        return out
    # v140.25 — Notification type filter (opt-out per grup).
    notif_type = (doc.get("notif_type") or "duyurular").strip() or None
    targets = await _broadcast_group_ids(notif_type=notif_type)
    out["channel_targets"] = len(targets)
    if not targets:
        return out
    title = (doc.get("title") or "").strip()
    body_txt = (doc.get("body") or "").strip()
    text_lines = [f"🔔 *{title}*"] if title else []
    if body_txt:
        text_lines.append("")
        text_lines.append(body_txt)
    text = "\n".join(text_lines) or "🔔 Etkinlik hatırlatması"
    img = (doc.get("image_url") or "").strip()
    for chat_id in targets:
        try:
            ok = await (_tg_photo(chat_id, img, caption=text) if img else _tg_send(chat_id, text))
            if ok:
                out["channel_delivered"] += 1
        except Exception as ex:
            logger.warning(f"_send_tg_channel: broadcast to {chat_id} failed: {ex}")
    out["channel_sent"] = out["channel_delivered"] > 0
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


async def _broadcast_in_app(doc: dict, notif_pref: Optional[str] = None) -> dict:
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
    # v135.23 — Per-channel pref (Profile → Bildirim Türleri): drop users
    # who explicitly opted out of this channel BEFORE we insert bell rows.
    if notif_pref:
        disabled_for_channel = await _users_disabled_for_pref(notif_pref)
        if disabled_for_channel:
            target_user_ids -= disabled_for_channel
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
    # v140.9 — Startup: eski bekleyen `push_scheduled` docs'unda duplicate
    # varsa (aynı `event_id` + aynı `scheduled_at`) sadece en eskisini bırak,
    # diğerlerini sil. Bu, önceki (guardsız) sürümde yaratılmış çift job'ları
    # temizler ve bir daha 2× Telegram/DM/push atılmamasını garanti eder.
    try:
        pipeline = [
            {"$match": {"sent": False, "event_id": {"$ne": None}}},
            {"$group": {
                "_id": {"event_id": "$event_id", "scheduled_at": "$scheduled_at"},
                "ids": {"$push": "$id"},
                "count": {"$sum": 1},
            }},
            {"$match": {"count": {"$gt": 1}}},
        ]
        removed_total = 0
        async for grp in db.push_scheduled.aggregate(pipeline):
            ids = grp.get("ids", [])
            keep = ids[0]  # first insertion order
            drop = [x for x in ids if x != keep]
            if drop:
                r = await db.push_scheduled.delete_many({"id": {"$in": drop}})
                removed_total += r.deleted_count or 0
        if removed_total:
            logger.warning(f"[startup] cleaned {removed_total} duplicate push_scheduled job(s)")
    except Exception as ex:
        logger.warning(f"[startup] push_scheduled dedupe failed: {ex}")
    asyncio.create_task(_push_scheduler_loop())
    asyncio.create_task(_announcement_scheduler_loop())
    asyncio.create_task(_trend_alert_loop())
    # v135.26 — Pre-event reminder ticker (Telegram channel + web push to
    # RSVP yes/maybe, honouring `notification_prefs.reminder`).
    asyncio.create_task(_event_reminder_loop())
    # v140.47 — Reminder dedup index: (event_id, minutes_before, channel) unique.
    try:
        await db.event_reminder_sends.create_index(
            [("event_id", 1), ("minutes_before", 1), ("channel", 1)],
            unique=True,
            name="uniq_event_reminder_sends",
        )
    except Exception as _e:
        logger.warning(f"event_reminder_sends index ensure: {_e}")
    # v135.28 — Daily birthday greeting ticker (Telegram + admin push).
    asyncio.create_task(_birthday_celebration_loop())
    # v135.33 — Admin todo due-date reminder ticker.
    asyncio.create_task(_admin_todo_due_reminder_loop())


# v135.26 — Automated pre-event reminder scheduler.
# Every 45 seconds we scan for events whose lead time is due:
#   * `reminder_minutes` in {15, 30, 60, 120}
#   * `reminder_enabled` != False
#   * `archived` != True
#   * `reminder_sent_at` is missing/empty
#   * `date - reminder_minutes` window is now in the past
# For each match we (a) post a rich Telegram channel message showing event
# name + Turkey-time start + group + minutes remaining, and (b) push web
# notifications to every user who RSVP'd yes/maybe. Both paths respect the
# `reminder` per-channel opt-out. After the fanout we stamp
# `reminder_sent_at` so the same event never re-fires.
ALLOWED_REMINDER_MINUTES = (15, 30, 60, 120)


async def _fire_event_reminder(ev: dict) -> dict:
    """Fire the pre-event reminder for a single event. Returns fanout stats.

    v140.47 — 3 kritik güncelleme:
      (1) Mesaj metni artık `{lead} dk kaldı` biçiminde — 15/30/60/120 hepsi
          için doğru gözüksün. Push başlığı da aynı formatı kullanır.
      (2) Per-channel dedup: (event_id, minutes_before, channel) benzersiz
          index'li `event_reminder_sends` koleksiyonu üzerinden atomic claim.
          Aynı kombinasyon 2× fire edilmez — sürücü loop tekrar çalışsa bile.
      (3) Test modu: `REMINDER_TEST_MODE=true` (VEYA `REMINDER_TEST_USERNAME`
          set) → Telegram channel + web push + DM fanout DEVREDIŞI, sadece
          `telegram_username == PasHaReisBen` olan üyenin DM'ine gönderilir.
    """
    stats = {"telegram": False, "push_sent": 0, "test_mode": False}
    lead = int(ev.get("reminder_minutes") or 0)
    if lead <= 0:
        return stats
    ev_id = ev.get("id")
    ev_name = (ev.get("name") or "").strip() or "Etkinlik"
    ev_group = (ev.get("group_name") or "").strip() or "—"
    ev_date_raw = ev.get("date") or ""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    try:
        _dtu = _dt.fromisoformat(str(ev_date_raw).replace("Z", "+00:00"))
        if _dtu.tzinfo is None:
            _dtu = _dtu.replace(tzinfo=_tz.utc)
        dt_tr = _dtu.astimezone(_tz(_td(hours=3)))
        tr_time_line = dt_tr.strftime("%Y-%m-%d %H:%M")
    except Exception:
        tr_time_line = str(ev_date_raw)[:16]

    # v140.47 — Test modu: sadece PasHaReisBen'e DM.
    test_username = (os.environ.get("REMINDER_TEST_USERNAME", "").strip() or "PasHaReisBen")
    test_mode_flag = (os.environ.get("REMINDER_TEST_MODE", "true").strip().lower() in ("1", "true", "yes", "on"))
    if test_mode_flag:
        stats["test_mode"] = True
        # Sebep-etiketli dedup: aynı (event, lead) tekrar fire olmasın.
        try:
            await db.event_reminder_sends.insert_one({
                "event_id": ev_id, "minutes_before": lead, "channel": "test_dm",
                "sent_at": _dt.now(_tz.utc).isoformat(),
            })
        except Exception:
            logger.info(f"[event-reminder][test] dedup hit event={ev_id} lead={lead}")
            return stats
        try:
            from telegram_bot import send_message as _tg_send_msg
            # Kullanıcıyı users tablosunda veya telegram_chat_map'te bul.
            uname_lc = test_username.lower()
            chat_id = None
            u = await db.users.find_one(
                {"telegram_username": {"$regex": f"^{test_username}$", "$options": "i"}},
                {"_id": 0, "telegram_chat_id": 1},
            )
            if u and u.get("telegram_chat_id"):
                chat_id = str(u["telegram_chat_id"])
            if not chat_id:
                m = await db.telegram_chat_map.find_one(
                    {"username_lc": uname_lc}, {"_id": 0, "chat_id": 1}
                )
                if m and m.get("chat_id"):
                    chat_id = str(m["chat_id"])
            if chat_id:
                msg = (
                    f"⏰ *{lead} dk kaldı* — Etkinlik başlıyor\n\n"
                    f"📅 *{ev_name}*\n"
                    f"🗓 Başlangıç: `{tr_time_line} (TR)`\n"
                    f"📊 Grup: {ev_group}\n\n"
                    f"_🧪 test modu — sadece @{test_username}_"
                )
                stats["telegram"] = bool(await _tg_send_msg(chat_id, msg))
                logger.info(f"[event-reminder][test] DM'd @{test_username} event={ev_id} lead={lead} → {stats['telegram']}")
            else:
                logger.warning(f"[event-reminder][test] @{test_username} chat_id bulunamadı; skip")
        except Exception as ex:
            logger.warning(f"[event-reminder][test] failed for {ev_id}: {ex}")
        return stats

    # ---- Normal path (test modu kapalı) ----
    lead_line = f"⏰ *{lead} dk kaldı* — Etkinlik başlıyor."
    # 1) Telegram channel — per-channel dedup.
    try:
        from telegram_bot import send_message as _tg_send
        channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        if channel and token:
            try:
                await db.event_reminder_sends.insert_one({
                    "event_id": ev_id, "minutes_before": lead, "channel": f"tg:{channel}",
                    "sent_at": _dt.now(_tz.utc).isoformat(),
                })
                lines = [
                    lead_line,
                    "",
                    f"📅 *{ev_name}*",
                    f"🗓 Başlangıç: `{tr_time_line} (TR)`",
                    f"📊 Grup: {ev_group}",
                ]
                base = (os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
                if ev_id:
                    lines.append(f"\n🔗 [Etkinliğe Katıl]({base}/etkinlikler#event-{ev_id})")
                stats["telegram"] = bool(await _tg_send(channel, "\n".join(lines)))
            except Exception:
                logger.info(f"[event-reminder] tg dedup hit event={ev_id} lead={lead} channel={channel}")
    except Exception as ex:
        logger.warning(f"[event-reminder] tg channel failed for {ev_id}: {ex}")
    # 2) Web push — per-channel dedup (subscription endpoint).
    try:
        scope = ev.get("alliance_scope")
        rsvps = await db.event_rsvps.find(
            {"event_id": ev_id, "status": {"$in": ["yes", "maybe"]}, **_rsvp_alliance_query(scope)},
            {"_id": 0, "user_id": 1},
        ).to_list(1000)
        rsvps = await _filter_rsvps_by_current_alliance(rsvps, scope)
        user_ids = list({r["user_id"] for r in rsvps if r.get("user_id")})
        disabled = await _users_disabled_for_pref("reminder")
        if disabled:
            user_ids = [u for u in user_ids if u not in disabled]
        if user_ids:
            private_pem, _pub = await _get_or_create_vapid()
            subs = await db.push_subscriptions.find(
                {"user_id": {"$in": user_ids}}, {"_id": 0},
            ).to_list(1000)
            payload = json.dumps({
                "title": f"⏰ {lead} dk kaldı — {ev_name}",
                "body": f"Başlangıç: {tr_time_line} (TR) · Grup: {ev_group}",
                "url": f"/etkinlikler#event-{ev_id}" if ev_id else "/etkinlikler",
                "tag": f"event-reminder-{ev_id}",
                "sound": "rally",
            }, ensure_ascii=False)
            sent = 0
            for s in subs:
                endpoint_hash = s.get("endpoint", "")[:200]
                try:
                    await db.event_reminder_sends.insert_one({
                        "event_id": ev_id, "minutes_before": lead,
                        "channel": f"push:{endpoint_hash}",
                        "sent_at": _dt.now(_tz.utc).isoformat(),
                    })
                except Exception:
                    continue  # dedup: bu subscription için zaten gönderilmiş
                try:
                    webpush(
                        subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                        data=payload,
                        vapid_private_key=private_pem,
                        vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
                    )
                    sent += 1
                except WebPushException as _wex:
                    code = getattr(_wex.response, "status_code", None) if hasattr(_wex, "response") else None
                    if code in (404, 410):
                        await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                except Exception:
                    pass
            stats["push_sent"] = sent
    except Exception as ex:
        logger.warning(f"[event-reminder] push failed for {ev_id}: {ex}")
    return stats


async def _event_reminder_loop():
    import asyncio
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    while True:
        try:
            now = _dt.now(_tz.utc)
            # Widest window we ever look ahead is the largest allowed lead;
            # we still verify per-doc that the specific lead is due.
            horizon = now + _td(minutes=max(ALLOWED_REMINDER_MINUTES))
            q = {
                "archived": {"$ne": True},
                "reminder_enabled": {"$ne": False},
                "reminder_minutes": {"$in": list(ALLOWED_REMINDER_MINUTES)},
                "reminder_sent_at": {"$in": [None, ""]},
                "date": {"$gte": now.isoformat(), "$lte": horizon.isoformat()},
            }
            events = await db.events.find(q, {"_id": 0}).to_list(100)
            for ev in events:
                try:
                    lead = int(ev.get("reminder_minutes") or 0)
                    if lead not in ALLOWED_REMINDER_MINUTES:
                        continue
                    ev_dt = _dt.fromisoformat(str(ev.get("date") or "").replace("Z", "+00:00"))
                    if ev_dt.tzinfo is None:
                        ev_dt = ev_dt.replace(tzinfo=_tz.utc)
                    trigger_at = ev_dt - _td(minutes=lead)
                    if now < trigger_at:
                        continue
                    # v140.9 — Yarış koşullu duplicate guard. `_event_reminder_loop`
                    # herhangi bir sebeple 2× çalışırsa (backend restart sırasında
                    # önceki task henüz cancel olmadan yeni task başlarsa vs.), her
                    # ikisi de aynı event doc'unu okuyup iki kez fire etmesin diye
                    # ATOMIC update kullanıyoruz: sadece `reminder_sent_at` boşsa
                    # ve şu anda dolduran biz olduğumuzda fire ediyoruz.
                    claim = await db.events.update_one(
                        {
                            "id": ev.get("id"),
                            "$or": [
                                {"reminder_sent_at": {"$exists": False}},
                                {"reminder_sent_at": None},
                                {"reminder_sent_at": ""},
                            ],
                        },
                        {"$set": {"reminder_sent_at": now.isoformat()}},
                    )
                    if claim.modified_count == 0:
                        # Başka bir loop / daha önceki tick zaten fire etti.
                        continue
                    fanout = await _fire_event_reminder(ev)
                    await db.events.update_one(
                        {"id": ev.get("id")},
                        {"$set": {"reminder_fanout": fanout}},
                    )
                    logger.info(f"[event-reminder] fired event={ev.get('id')} lead={lead}m → {fanout}")
                except Exception as _iex:
                    logger.warning(f"[event-reminder] per-event failure: {_iex}")
        except Exception as ex:
            logger.warning(f"[event-reminder] loop error: {ex}")
        await asyncio.sleep(45)


# v135.28 — Daily birthday celebration ticker.
# Users optionally set `birthday_mmdd` in MM-DD form (no year — privacy).
# Every 30 minutes we look at Turkey-local today, and for every user whose
# `birthday_mmdd` equals today AND `birthday_celebrated_year != this year`,
# we post a Telegram channel greeting mentioning them (falling back to
# username if their linked member name isn't set) and push an admin bell so
# the guild leadership can @-tag them in voice. `birthday_celebrated_year`
# is stamped to make the loop idempotent — nobody gets two greetings in a
# calendar year even if the pod restarts mid-day.
async def _fire_birthday_greeting(u: dict, year: int) -> dict:
    stats = {"telegram": False, "admin_push": 0}
    display_name = (u.get("display_name")
                    or u.get("username")
                    or "Komutan").strip() or "Komutan"
    # 1) Telegram channel greeting.
    try:
        from telegram_bot import send_message as _tg_send
        channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        if channel and token:
            msg = (
                "🎂 *Doğum Günün Kutlu Olsun!*\n\n"
                f"Bugün *{display_name}*'in doğum günü — hep beraber TiTaNXiS ailesi olarak kutluyoruz! 🎉\n"
                "Kaleyi sağlam tut, saflar bozulmasın Komutan. 🛡️"
            )
            stats["telegram"] = bool(await _tg_send(channel, msg))
    except Exception as ex:
        logger.warning(f"[birthday] tg channel failed for {u.get('id')}: {ex}")
    # 2) Admin push — bell rowu her admin için.
    try:
        admin_ids = [
            a["id"] async for a in db.users.find(
                {"role": "admin"}, {"_id": 0, "id": 1}
            )
        ]
        if admin_ids:
            title = "🎂 Doğum günü hatırlatması"
            body_txt = f"Bugün {display_name} doğdu — sohbette tebrik etmeyi unutma!"
            rows = [{
                "id": str(uuid.uuid4()),
                "user_id": aid,
                "title": title,
                "body": body_txt,
                "url": "/uyeler",
                "event_id": None,
                "sched_id": f"birthday-{u.get('id')}-{year}",
                "created_at": now_iso(),
                "read": False,
            } for aid in admin_ids]
            await db.in_app_notifications.insert_many(rows)
            for aid in admin_ids:
                _publish_notif(aid, {
                    "id": f"birthday-{u.get('id')}-{year}",
                    "title": title, "body": body_txt, "url": "/uyeler",
                    "created_at": now_iso(), "read": False,
                })
            stats["admin_push"] = len(admin_ids)
    except Exception as ex:
        logger.warning(f"[birthday] admin fanout failed for {u.get('id')}: {ex}")
    return stats


async def _birthday_celebration_loop():
    import asyncio
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    while True:
        try:
            # Turkey local calendar — matches how members set their date.
            now_tr = _dt.now(_tz(_td(hours=3)))
            today = now_tr.strftime("%m-%d")
            year = now_tr.year
            cursor = db.users.find(
                {
                    "birthday_mmdd": today,
                    "$or": [
                        {"birthday_celebrated_year": {"$exists": False}},
                        {"birthday_celebrated_year": {"$ne": year}},
                    ],
                },
                {"_id": 0, "id": 1, "username": 1, "display_name": 1, "birthday_mmdd": 1},
            )
            async for u in cursor:
                try:
                    fanout = await _fire_birthday_greeting(u, year)
                    await db.users.update_one(
                        {"id": u["id"]},
                        {"$set": {
                            "birthday_celebrated_year": year,
                            "birthday_celebrated_at": _dt.now(_tz.utc).isoformat(),
                            "birthday_last_fanout": fanout,
                        }},
                    )
                    logger.info(f"[birthday] fired user={u.get('id')} → {fanout}")
                except Exception as _iex:
                    logger.warning(f"[birthday] per-user failure: {_iex}")
        except Exception as ex:
            logger.warning(f"[birthday] loop error: {ex}")
        await asyncio.sleep(1800)  # 30 dakika


# v135.28 — Admin manual trigger for the daily birthday greeting. Handy to
# preview a message ahead of time without waiting for midnight-TR.
@api_router.post("/admin/birthday/fire-now")
async def admin_birthday_fire_now(
    user_id: str, _: dict = Depends(require_admin),
):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(404, "user not found")
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    year = _dt.now(_tz(_td(hours=3))).year
    fanout = await _fire_birthday_greeting(u, year)
    return {"ok": True, "fanout": fanout}


# v135.28 — Public guild profile. No-auth endpoint powering /lonca so
# potential recruits can see the guild's basic stats + latest events before
# creating an account. Only surfaces admin-approved surface data (no members
# list, no scores). Newest active invite is returned so the recruit can
# jump straight to /kayit if the alliance keeps signup public.
@api_router.get("/guild/public")
async def guild_public_profile():
    # Guild name lives in `guild_settings` under `guild_name` (fallback to
    # env brand or a static default so a fresh install still renders).
    name_doc = await db.guild_settings.find_one({"key": "guild_name"}, {"_id": 0})
    guild_name = ((name_doc or {}).get("value")
                  or os.environ.get("GUILD_NAME", "").strip()
                  or "TiTaNXiS")
    logo_doc = await db.guild_settings.find_one({"key": "guild_logo_url"}, {"_id": 0})
    logo_url = ((logo_doc or {}).get("value")
                or "/brand/titanxis-logo.jpg")
    tagline_doc = await db.guild_settings.find_one({"key": "guild_tagline"}, {"_id": 0})
    tagline = ((tagline_doc or {}).get("value")
               or "Alevden doğan lonca — 29 dil, tek çatı.")
    member_count = await db.members.count_documents({})
    from datetime import datetime as _dt2, timezone as _tz2, timedelta as _td2
    now = _dt2.now(_tz2.utc)
    active_events_count = await db.events.count_documents({
        "archived": {"$ne": True},
        "date": {"$gte": now.isoformat()},
    })
    # Recent (or upcoming) events for showcase. Prefer upcoming; fall back
    # to freshly archived if the calendar is empty so the page never looks
    # dead.
    upcoming = await db.events.find(
        {"archived": {"$ne": True},
         "date": {"$gte": now.isoformat()},
         "hidden_from_leaderboard": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "date": 1, "group_name": 1, "multiplier": 1},
    ).sort("date", 1).to_list(5)
    if not upcoming:
        upcoming = await db.events.find(
            {"hidden_from_leaderboard": {"$ne": True}},
            {"_id": 0, "id": 1, "name": 1, "date": 1, "group_name": 1, "multiplier": 1},
        ).sort("date", -1).to_list(5)
    # Newest active invite link — expose only the token so the frontend
    # can build the /kayit/{token} URL without leaking metadata.
    inv = await db.invites.find_one(
        {"disabled": {"$ne": True},
         "$or": [{"expires_at": None}, {"expires_at": {"$gte": now.isoformat()}}]},
        {"_id": 0, "token": 1},
        sort=[("created_at", -1)],
    )
    return {
        "guild_name": guild_name,
        "logo_url": logo_url,
        "tagline": tagline,
        "member_count": member_count,
        "active_events_count": active_events_count,
        "recent_events": upcoming,
        "invite_token": (inv or {}).get("token") or None,
        "generated_at": _dt2.now(_tz2.utc).isoformat(),
    }


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
                    notif_pref="announcement",
                )
                channel_task = _send_tg_channel(push_doc)
                dm_task = _send_tg_dms(push_doc)
                app_task = _broadcast_in_app(push_doc, notif_pref="announcement")
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
    storms — errors are logged server-side.

    v140.26 — `process_update` fire-and-forget: bazı ağır update'ler (LLM
    NLP, DB batch) 60sn'yi geçebiliyor → Telegram Read timeout expired
    → pending_updates şişiyor. Şimdi handler <200ms'de dönüyor, iş
    background task'ta yürüyor."""
    import asyncio as _aio
    try:
        body = await request.json()
        # Capture chat_id ↔ Telegram @username mapping (fast, keep inline)
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
        # Callback queries (inline attendance) — handled fast; bail before PTB.
        try:
            cbq = (body or {}).get("callback_query")
            if cbq:
                _aio.create_task(_handle_attendance_callback(cbq))
                return {"ok": True}
        except Exception as _cbe:
            logging.getLogger("telegram").warning(f"callback dispatch failed: {_cbe}")
        # Fire-and-forget PTB processing. Errors logged inside process_update.
        _aio.create_task(process_update(body))
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
    elif f == "archived":
        # v135.35 — Admin arşiv görünümü. active=False duyuruları listeler.
        q["active"] = False
    cursor = db.announcements.find(q, {"_id": 0}).sort("created_at", -1).limit(max(1, min(limit, 100)))
    return {"items": [r async for r in cursor]}


class AnnouncementBody(BaseModel):
    title: str
    body: str
    url: Optional[str] = None
    image_url: Optional[str] = None
    broadcast: Optional[bool] = True
    urgent: Optional[bool] = False
    pinned: Optional[bool] = False  # v135 — sticky banner on home page
    pinned_until: Optional[str] = None  # v135.8 — ISO8601 UTC — banner auto-hides after this
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
        "pinned": bool(body.pinned),  # v135 — home banner sticky flag
        "pinned_until": (body.pinned_until or "").strip() or None,  # v135.8 — auto-expire timestamp
    }
    # v127 — Auto-translate title + body to all 28 non-TR languages so
    # the Duyurular list and push notifications can render in the user's
    # language without a round-trip.
    # v135.20 — Async translate manager: tek çağrıda title + body çevrilir.
    try:
        await _translate_fields(doc, [
            ("title", "title_translations"),
            ("body", "body_translations"),
        ])
    except Exception as _tx_ex:
        logger.warning(f"announcement auto-translate failed: {_tx_ex}")
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
            notif_pref="announcement",
        )
        channel_task = _send_tg_channel(push_doc)
        dm_task = _send_tg_dms(push_doc)
        app_task = _broadcast_in_app(push_doc, notif_pref="announcement")
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


# v135.36 — Bulk actions for archived announcements (active=False).
class AnnouncementBulkBody(BaseModel):
    ids: List[str]


@api_router.post("/announcements/bulk-delete")
async def announcements_bulk_delete(body: AnnouncementBulkBody, _: dict = Depends(require_admin)):
    ids = [i for i in (body.ids or []) if i]
    if not ids:
        return {"deleted": 0}
    r = await db.announcements.delete_many({"id": {"$in": ids}})
    return {"deleted": r.deleted_count}


@api_router.post("/announcements/bulk-restore")
async def announcements_bulk_restore(body: AnnouncementBulkBody, _: dict = Depends(require_admin)):
    """Un-archive many at once: flips active=True on every provided id."""
    ids = [i for i in (body.ids or []) if i]
    if not ids:
        return {"restored": 0}
    r = await db.announcements.update_many(
        {"id": {"$in": ids}},
        {"$set": {"active": True, "restored_at": now_iso()}},
    )
    return {"restored": r.modified_count}


class AnnouncementPatch(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    url: Optional[str] = None
    image_url: Optional[str] = None
    urgent: Optional[bool] = None
    active: Optional[bool] = None
    pinned: Optional[bool] = None
    pinned_until: Optional[str] = None


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

# v135.29 — Auto-generated event share image.
# Composes a 1200×630 PNG poster using Pillow with the event name (top),
# TR-local date/time (middle), group / multiplier (bottom). Admin's manually
# uploaded banner_url is used as background when set; otherwise we render a
# dark gradient with a subtle amber accent bar. Endpoint is cheap (no cache)
# — invoked on-demand by the modal + Telegram sendPhoto path.
def _load_font(size: int, bold: bool = False):
    """Try DejaVu (best CJK/Turkish coverage) → FreeSans → PIL default."""
    from PIL import ImageFont
    candidates = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" if bold
        else "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _load_emoji_font():
    """Noto Color Emoji is a CBDT bitmap font — Pillow requires a specific
    fixed size (109) at load time; we then draw with `embedded_color=True`.
    Returns None if the font isn't available so callers can gracefully skip
    the emoji glyph."""
    from PIL import ImageFont
    try:
        return ImageFont.truetype(
            "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", 109,
        )
    except Exception:
        return None


import re as _re_emoji
# Broad emoji unicode ranges — enough to cover 📅 ⚡ 📊 🔥 🎉 etc used in posters.
_EMOJI_RE = _re_emoji.compile(
    r"[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F0FF]"
)


def _draw_text_with_emoji(draw, xy, text, main_font, emoji_font,
                           fill, target_h):
    """Draw text left-to-right, swapping to color emoji font for glyphs the
    main font would render as tofu. Emoji glyphs are drawn onto a temp
    RGBA image at Noto's native 109px, then resized to match text height
    for a visually consistent baseline. Falls back to plain draw when the
    emoji font is missing."""
    from PIL import Image
    x, y = xy
    if not emoji_font:
        draw.text(xy, text, fill=fill, font=main_font)
        return
    # Segment into runs of emoji vs regular text.
    pos = 0
    segments = []
    for m in _EMOJI_RE.finditer(text):
        if m.start() > pos:
            segments.append(("text", text[pos:m.start()]))
        segments.append(("emoji", m.group(0)))
        pos = m.end()
    if pos < len(text):
        segments.append(("text", text[pos:]))
    for kind, chunk in segments:
        if kind == "text":
            draw.text((x, y), chunk, fill=fill, font=main_font)
            x += int(draw.textlength(chunk, font=main_font))
        else:
            # Render each emoji onto its own transparent tile, then resize.
            tile = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
            from PIL import ImageDraw as _ID
            td = _ID.Draw(tile)
            try:
                td.text((0, 20), chunk, font=emoji_font, embedded_color=True)
            except Exception:
                # Older Pillow — fall back to plain draw (tofu is still OK).
                td.text((0, 20), chunk, font=emoji_font)
            resized = tile.resize((target_h, target_h), Image.LANCZOS)
            draw._image.paste(resized, (x, y), resized)
            x += target_h + 6  # small kerning


# v135.30 — Six poster themes. Each theme drives (gradient_from, gradient_to,
# accent_bar_rgb, kicker_rgb, title_rgb, meta_rgb) so a single composer can
# render Fire / Onyx / Amber / Buz / Zümrüt / Boşluk variants without any
# duplicated draw code.
SHARE_THEMES = {
    "fire": {  # Existing default — ember red/orange
        "grad_a": (36, 12, 6), "grad_b": (68, 20, 8),
        "accent": (231, 76, 26), "kicker": (245, 166, 35),
        "title": (245, 240, 232), "meta": (240, 200, 160),
        "label_tr": "Ateş",
    },
    "onyx": {  # Deep black / silver
        "grad_a": (8, 8, 12), "grad_b": (22, 22, 30),
        "accent": (180, 180, 190), "kicker": (200, 200, 210),
        "title": (255, 255, 255), "meta": (170, 170, 180),
        "label_tr": "Oniks",
    },
    "amber": {  # Warm amber gold
        "grad_a": (28, 18, 4), "grad_b": (62, 44, 10),
        "accent": (245, 166, 35), "kicker": (255, 200, 80),
        "title": (255, 240, 200), "meta": (230, 190, 120),
        "label_tr": "Kehribar",
    },
    "buz": {  # Ice blue
        "grad_a": (4, 12, 30), "grad_b": (12, 40, 90),
        "accent": (96, 176, 255), "kicker": (150, 210, 255),
        "title": (230, 245, 255), "meta": (180, 220, 255),
        "label_tr": "Buz",
    },
    "zumrut": {  # Emerald green
        "grad_a": (4, 20, 14), "grad_b": (10, 60, 40),
        "accent": (52, 211, 153), "kicker": (110, 231, 183),
        "title": (230, 255, 244), "meta": (170, 220, 200),
        "label_tr": "Zümrüt",
    },
    "bosluk": {  # Mystic purple / void
        "grad_a": (16, 6, 30), "grad_b": (44, 20, 80),
        "accent": (168, 85, 247), "kicker": (196, 130, 255),
        "title": (240, 232, 255), "meta": (200, 180, 230),
        "label_tr": "Boşluk",
    },
}


async def _compose_event_share_image(event: dict, theme: str = "fire") -> bytes:
    """Return PNG bytes for the share poster. Non-blocking-safe (pure PIL)."""
    from PIL import Image, ImageDraw
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    import io as _io
    W, H = 1200, 630
    palette = SHARE_THEMES.get(theme) or SHARE_THEMES["fire"]
    ga = palette["grad_a"]; gb = palette["grad_b"]
    # Base canvas — themed vertical gradient.
    img = Image.new("RGB", (W, H), ga)
    draw = ImageDraw.Draw(img, "RGBA")
    for y in range(H):
        t = y / max(1, H - 1)
        r = int(ga[0] + (gb[0] - ga[0]) * t)
        g = int(ga[1] + (gb[1] - ga[1]) * t)
        b = int(ga[2] + (gb[2] - ga[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))
    # Overlay admin's banner_url when present (paste with 65% opacity).
    banner_url = (event.get("banner_url") or "").strip()
    if banner_url:
        try:
            import httpx as _hx
            fetch_url = banner_url
            if fetch_url.startswith("/"):
                fetch_url = f"http://127.0.0.1:8001{fetch_url}"
            async with _hx.AsyncClient(timeout=8.0) as c:
                r = await c.get(fetch_url)
                if r.status_code == 200:
                    bg = Image.open(_io.BytesIO(r.content)).convert("RGB")
                    bw, bh = bg.size
                    scale = max(W / bw, H / bh)
                    nw, nh = int(bw * scale), int(bh * scale)
                    bg = bg.resize((nw, nh), Image.LANCZOS)
                    off = ((nw - W) // 2, (nh - H) // 2)
                    bg = bg.crop((off[0], off[1], off[0] + W, off[1] + H))
                    dark = Image.new("RGB", (W, H), ga)
                    img = Image.blend(bg, dark, 0.55)
                    draw = ImageDraw.Draw(img, "RGBA")
        except Exception:
            pass
    # Themed accent bar on the left edge.
    ar, ag, ab = palette["accent"]
    draw.rectangle([(0, 0), (14, H)], fill=(ar, ag, ab, 255))
    # Top kicker
    kicker_font = _load_font(28, bold=True)
    kf = palette["kicker"]
    draw.text((60, 60), "TITANXIS · GAMING GUILD",
              fill=(kf[0], kf[1], kf[2], 255), font=kicker_font)
    # Event name — wrap to fit 1080px width.
    name = (event.get("name") or "Etkinlik").strip()
    name_font = _load_font(84, bold=True)
    lines = []
    words = name.split(" ")
    line = ""
    for w in words:
        cand = f"{line} {w}".strip()
        if draw.textlength(cand, font=name_font) > 1080 and line:
            lines.append(line); line = w
        else:
            line = cand
    if line:
        lines.append(line)
    tf = palette["title"]
    y = 130
    for ln in lines[:2]:
        draw.text((60, y), ln, fill=(tf[0], tf[1], tf[2], 255), font=name_font)
        y += 96
    # Date/time line (TR) + group/multiplier — with color emoji fallback.
    ev_date = (event.get("date") or "").strip()
    try:
        _dtu = _dt.fromisoformat(ev_date.replace("Z", "+00:00"))
        if _dtu.tzinfo is None:
            _dtu = _dtu.replace(tzinfo=_tz.utc)
        dt_tr = _dtu.astimezone(_tz(_td(hours=3)))
        date_line = dt_tr.strftime("%d.%m.%Y · %H:%M (TR)")
    except Exception:
        date_line = ev_date[:16]
    emoji_font = _load_emoji_font()
    date_font = _load_font(42, bold=False)
    _draw_text_with_emoji(
        draw, (60, max(y + 12, 380)),
        f"📅  {date_line}",
        date_font, emoji_font,
        fill=(kf[0], kf[1], kf[2], 255), target_h=42,
    )
    grp = (event.get("group_name") or "").strip() or "—"
    mult = event.get("multiplier") or 1
    meta_font = _load_font(34, bold=False)
    mf = palette["meta"]
    _draw_text_with_emoji(
        draw, (60, max(y + 12 + 60, 440)),
        f"📊  {grp}    ⚡  ×{mult}",
        meta_font, emoji_font,
        fill=(mf[0], mf[1], mf[2], 255), target_h=34,
    )
    # Footer domain
    footer_font = _load_font(24, bold=True)
    domain = os.environ.get("PUBLIC_DOMAIN", "").strip() or "titanxis.com"
    draw.text((60, H - 60), domain,
              fill=(tf[0], tf[1], tf[2], 220), font=footer_font)
    buf = _io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@api_router.get("/events/{event_id}/share-image.png")
async def event_share_image(event_id: str, theme: str = "fire"):
    from fastapi.responses import Response
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "event not found")
    if theme not in SHARE_THEMES:
        theme = "fire"
    png = await _compose_event_share_image(ev, theme=theme)
    return Response(
        content=png, media_type="image/png",
        headers={"Cache-Control": "public, max-age=60"},
    )


@api_router.post("/events/{event_id}/share-image/send-telegram")
async def event_share_image_send_tg(
    event_id: str, theme: str = "fire",
    _: dict = Depends(require_admin),
):
    """Compose the themed share PNG and post it to TELEGRAM_CHANNEL_ID via
    sendPhoto with a Markdown caption. Returns 400 if channel/token missing."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "event not found")
    channel = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not channel or not token:
        raise HTTPException(400, "TELEGRAM_CHANNEL_ID / TELEGRAM_BOT_TOKEN tanımlı değil")
    if theme not in SHARE_THEMES:
        theme = "fire"
    png = await _compose_event_share_image(ev, theme=theme)
    from datetime import datetime as _dt2, timezone as _tz2, timedelta as _td2
    try:
        _dtu = _dt2.fromisoformat((ev.get("date") or "").replace("Z", "+00:00"))
        if _dtu.tzinfo is None:
            _dtu = _dtu.replace(tzinfo=_tz2.utc)
        dt_tr = _dtu.astimezone(_tz2(_td2(hours=3)))
        date_line = dt_tr.strftime("%d.%m.%Y · %H:%M (TR)")
    except Exception:
        date_line = (ev.get("date") or "")[:16]
    caption_lines = [
        f"📅 *{ev.get('name') or 'Etkinlik'}*",
        f"🗓 Tarih: `{date_line}`",
        f"📊 Grup: {ev.get('group_name') or '—'}",
    ]
    if ev.get("multiplier") and ev.get("multiplier") != 1:
        caption_lines.append(f"⚡ Çarpan: ×{ev.get('multiplier')}")
    base = (os.environ.get("PUBLIC_BASE_URL", "") or "https://titanxis.com").rstrip("/")
    caption_lines.append(f"\n🔗 {base}/etkinlikler#event-{ev.get('id')}")
    caption = "\n".join(caption_lines)
    import httpx as _hx
    files = {"photo": (f"event-{event_id}-{theme}.png", png, "image/png")}
    data = {"chat_id": channel, "caption": caption, "parse_mode": "Markdown"}
    async with _hx.AsyncClient(timeout=20.0) as c:
        r = await c.post(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data=data, files=files,
        )
    if r.status_code != 200:
        raise HTTPException(502, f"Telegram sendPhoto failed: {r.text[:200]}")
    return {"ok": True, "message_id": r.json().get("result", {}).get("message_id"),
            "theme": theme}


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


class EventRsvpBody(BaseModel):
    status: Optional[str] = None  # "yes" | "maybe" | "no" | None to clear


async def _resolve_user_alliances(user: dict) -> set[str]:
    """Return the set of alliance names (uppercased) that any of the user's
    linked members belong to. Used to gate RSVPs by `event.alliance_scope` so
    only members of the target alliance can respond to an event.

    Aggregates ids from three sources for backwards-compat:
      * `user.member_ids` (list) — newest schema, may contain 0-N ids.
      * `user.member_id` (str) — legacy single-link column.
      * `members.user_id` — reverse index (member self-attached).
    """
    mids: set[str] = set()
    for m in (user.get("member_ids") or []):
        if m:
            mids.add(m)
    if user.get("member_id"):
        mids.add(user["member_id"])
    uid = user.get("id") or user.get("username")
    if uid:
        reverse = await db.members.find({"user_id": uid}, {"_id": 0, "id": 1}).to_list(50)
        for r in reverse:
            if r.get("id"):
                mids.add(r["id"])
    if not mids:
        return set()
    docs = await db.members.find({"id": {"$in": list(mids)}}, {"_id": 0, "alliance_name": 1}).to_list(200)
    # v61 — CASE PRESERVED. `GOW` (ana), `GoW` / `GOw` (akademi) are
    # stratejik olarak farklı ittifaklardır. Merge YASAK.
    return {(d.get("alliance_name") or "").strip() for d in docs if d.get("alliance_name")}


def _rsvp_alliance_query(event_scope: Optional[str]) -> dict:
    """Extra Mongo filter for listing/summarizing RSVPs based on the event's
    alliance scope. `"all"` (or empty) matches every RSVP; a specific scope
    matches only stored RSVPs whose `alliance` field equals that scope.

    v61 — EXACT MATCH mühürlemesi: `GOW`, `GoW`, `GOw` birbirinden farklıdır
    ve hiçbir şekilde birleştirilmez."""
    scope = (event_scope or "").strip()
    if not scope or scope.lower() == "all":
        return {}
    return {"alliance": scope}


async def _filter_rsvps_by_current_alliance(rows: list, event_scope: Optional[str]) -> list:
    """Belt-and-suspenders alliance filter for RSVP rows (v55). Even after
    the stored-`alliance` field lookup in `_rsvp_alliance_query`, a legacy
    RSVP (pre-v54) or a user who switched alliances after voting could still
    leak through. This helper re-resolves each RSVP user's CURRENT linked
    alliance via a `users → members.alliance_name` join and drops anyone
    whose live alliance doesn't match the event's `alliance_scope`.

    For `alliance_scope == "all"` (or empty) it's a passthrough.
    """
    scope = (event_scope or "").strip()
    if not scope or scope.lower() == "all":
        return rows
    uids = [r.get("user_id") for r in rows if r.get("user_id")]
    if not uids:
        return []
    # Fetch link maps in one shot: user.member_ids/member_id + reverse members.user_id.
    users = await db.users.find(
        {"id": {"$in": uids}},
        {"_id": 0, "id": 1, "member_ids": 1, "member_id": 1},
    ).to_list(5000)
    by_uid = {u["id"]: u for u in users}
    reverse = await db.members.find(
        {"user_id": {"$in": uids}},
        {"_id": 0, "id": 1, "user_id": 1},
    ).to_list(5000)
    reverse_by_uid: dict = {}
    for m in reverse:
        reverse_by_uid.setdefault(m.get("user_id"), set()).add(m.get("id"))
    per_uid_mids: dict = {}
    all_mids: set = set()
    for uid in uids:
        u = by_uid.get(uid) or {}
        mids: set = set()
        for mid in (u.get("member_ids") or []):
            if mid:
                mids.add(mid)
        if u.get("member_id"):
            mids.add(u["member_id"])
        mids |= reverse_by_uid.get(uid, set())
        per_uid_mids[uid] = mids
        all_mids |= mids
    if not all_mids:
        return []
    docs = await db.members.find(
        {"id": {"$in": list(all_mids)}},
        {"_id": 0, "id": 1, "alliance_name": 1},
    ).to_list(5000)
    # v61 — case-preserved comparison. `GOW`, `GoW`, `gow` are distinct.
    alliance_by_mid = {
        d["id"]: (d.get("alliance_name") or "").strip()
        for d in docs
    }
    allowed: set = set()
    for uid, mids in per_uid_mids.items():
        for mid in mids:
            if alliance_by_mid.get(mid) == scope:
                allowed.add(uid)
                break
    return [r for r in rows if r.get("user_id") in allowed]


@api_router.post("/events/{event_id}/rsvp")
async def event_rsvp(event_id: str, body: EventRsvpBody, user: dict = Depends(require_auth)):
    """Member RSVP for an event. Stored in a `event_rsvps` collection so it's
    indexable both ways (event → members, user → events). Passing status=null
    (or an unknown status) clears the user's response.

    ALLIANCE GATE (v54): Only users whose linked members belong to the
    event's `alliance_scope` may RSVP. Events default to `alliance_scope="GOW"`
    so out of the box only GOW members can participate; admins can widen to
    "all" or point to a different alliance via the event form."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "id": 1, "alliance_scope": 1})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    scope = (ev.get("alliance_scope") or "GOW").strip()
    user_alliances = await _resolve_user_alliances(user)
    # v61 — EXACT case-sensitive match. `GOW` (ana) ile `GoW` / `GOw` (akademi)
    # birbirinden bağımsızdır; birleştirme YASAK.
    if scope.lower() != "all" and scope not in user_alliances:
        raise HTTPException(403, f"Bu etkinlik yalnızca {scope} ittifakı üyelerine açık.")
    user_id = user.get("id") or user.get("username")
    valid = {"yes", "maybe", "no"}
    if body.status in valid:
        await db.event_rsvps.update_one(
            {"event_id": event_id, "user_id": user_id},
            {"$set": {
                "event_id": event_id,
                "user_id": user_id,
                "username": user.get("username"),
                "status": body.status,
                # v61 — store the exact scope casing so 'GOW' / 'GoW' / 'GOw'
                # RSVP kayıtları asla birleştirilmez.
                "alliance": scope if scope.lower() != "all" else None,
                "updated_at": now_iso(),
            }},
            upsert=True,
        )
        # v135.24 — Streak milestone celebration. When a "yes" RSVP pushes
        # the user's consecutive-yes streak across a milestone (5, 10, 15,
        # 20, 25, 50, 100), fire a push + in-app bell with the "streak"
        # channel so the Profile → Bildirim Türleri toggle can silence it.
        if body.status == "yes":
            try:
                await _fire_streak_celebration(user_id, user.get("username") or "")
            except Exception as _stex:
                logger.warning(f"[streak-celebrate] failed: {_stex}")
        return {"event_id": event_id, "status": body.status}
    await db.event_rsvps.delete_one({"event_id": event_id, "user_id": user_id})
    return {"event_id": event_id, "status": None}


STREAK_MILESTONES = (5, 10, 15, 20, 25, 50, 100)


async def _compute_user_yes_streak(user_id: str) -> int:
    """Consecutive 'yes' RSVPs anchored at the newest attendance-enabled
    event. Mirrors the logic in `/api/auth/me/rsvp-streak` — a 'no' or
    'maybe' resets the count. Non-attendance events are skipped so joke
    quick-polls don't inflate the number."""
    rsvps = await db.event_rsvps.find(
        {"user_id": user_id}, {"_id": 0, "event_id": 1, "status": 1},
    ).to_list(2000)
    if not rsvps:
        return 0
    ev_ids = list({r["event_id"] for r in rsvps if r.get("event_id")})
    events = await db.events.find(
        {"id": {"$in": ev_ids}, "attendance_enabled": {"$ne": False}},
        {"_id": 0, "id": 1, "date": 1},
    ).to_list(2000)
    by_ev = {e["id"]: e for e in events}
    rows = []
    for r in rsvps:
        ev = by_ev.get(r.get("event_id"))
        if not ev or not ev.get("date"):
            continue
        rows.append({"status": r.get("status"), "date": ev["date"]})
    rows.sort(key=lambda x: x["date"], reverse=True)
    streak = 0
    for r in rows:
        if r["status"] == "yes":
            streak += 1
        else:
            break
    return streak


async def _fire_streak_celebration(user_id: str, username: str) -> None:
    """Called after every 'yes' RSVP. If the fresh streak lands on a
    milestone (5, 10, …) AND we haven't already congratulated the user
    at that exact number, fan out a push + bell row. The `rsvp_streak_state`
    collection tracks the last-celebrated milestone per user so users don't
    get spammed when they flip yes ↔ no on the same event."""
    streak = await _compute_user_yes_streak(user_id)
    if streak < STREAK_MILESTONES[0] or streak not in STREAK_MILESTONES:
        return
    state = await db.rsvp_streak_state.find_one({"user_id": user_id}, {"_id": 0}) or {}
    if int(state.get("last_celebrated") or 0) >= streak:
        return
    title = "🔥 Streak Serisi!"
    body = f"Üst üste {streak} etkinliğe Evet dedin — {username or 'Komutan'}, seri bozulmasın!"
    url = "/profil"
    tag = f"streak-{user_id}-{streak}"
    # Push: filter subscriptions down to just this user so the celebration
    # is a personal DM, not a channel-wide broadcast.
    try:
        private_pem, _pub = await _get_or_create_vapid()
        # Respect per-channel opt-out.
        disabled = await _users_disabled_for_pref("streak")
        if user_id in disabled:
            await db.rsvp_streak_state.update_one(
                {"user_id": user_id},
                {"$set": {"last_celebrated": streak, "silenced_at": now_iso()}},
                upsert=True,
            )
            return
        subs = await db.push_subscriptions.find(
            {"user_id": user_id}, {"_id": 0},
        ).to_list(50)
        payload = json.dumps({"title": title, "body": body, "url": url,
                              "tag": tag, "sound": "rally"}, ensure_ascii=False)
        for s in subs:
            try:
                webpush(
                    subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                    data=payload,
                    vapid_private_key=private_pem,
                    vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
                )
            except WebPushException as ex:
                code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
                if code in (404, 410):
                    await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
            except Exception:
                pass
    except Exception as _pex:
        logger.warning(f"[streak-celebrate] push failed for {user_id}: {_pex}")
    # In-app bell row (also honours the "streak" pref via _broadcast_in_app
    # semantics — we insert directly here since we only target one user).
    try:
        await db.in_app_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": title,
            "body": body,
            "url": url,
            "event_id": None,
            "sched_id": tag,
            "created_at": now_iso(),
            "read": False,
        })
        _publish_notif(user_id, {
            "id": tag, "title": title, "body": body, "url": url,
            "event_id": None, "sched_id": tag,
            "created_at": now_iso(), "read": False,
        })
    except Exception as _bex:
        logger.warning(f"[streak-celebrate] bell insert failed: {_bex}")
    # Persist the milestone so we don't refire on the next yes RSVP.
    await db.rsvp_streak_state.update_one(
        {"user_id": user_id},
        {"$set": {"last_celebrated": streak, "celebrated_at": now_iso(),
                  "username": username}},
        upsert=True,
    )
    logger.info(f"[streak-celebrate] user={user_id} streak={streak} fired")


@api_router.get("/events/{event_id}/rsvp/me")
async def event_rsvp_me(event_id: str, user: dict = Depends(require_auth)):
    user_id = user.get("id") or user.get("username")
    doc = await db.event_rsvps.find_one({"event_id": event_id, "user_id": user_id}, {"_id": 0, "status": 1})
    return {"event_id": event_id, "status": doc.get("status") if doc else None}


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
    """Return the list of member_ids marked as attended for an event.

    v58 — Filtered by `event.alliance_scope`: only attendance rows whose
    member is currently in the event's target alliance are returned so the
    frontend can never render a bogus "X/255" ratio again."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0, "alliance_scope": 1})
    scope = ((ev or {}).get("alliance_scope") or "GOW").strip()
    docs = await db.event_attendance.find({"event_id": event_id}, {"_id": 0}).to_list(5000)
    member_ids = [d["member_id"] for d in docs]
    if scope and scope.lower() != "all" and member_ids:
        # v61 — case-sensitive alliance match (GOW ≠ GoW ≠ gow).
        matched = await db.members.find(
            {"id": {"$in": member_ids}, "alliance_name": scope},
            {"_id": 0, "id": 1},
        ).to_list(5000)
        allowed = {m["id"] for m in matched}
        member_ids = [mid for mid in member_ids if mid in allowed]
    if not scope or scope.lower() == "all":
        scoped_total = await db.members.count_documents({})
    else:
        scoped_total = await db.members.count_documents({"alliance_name": scope})
    return {
        "event_id": event_id,
        "count": len(member_ids),
        "member_ids": member_ids,
        "alliance_scope": scope,
        "scoped_total_members": scoped_total,
    }


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


# ---------- Guild Health Score (v62) ----------
@api_router.get("/health-scores")
async def health_scores(days: int = 90, user: dict = Depends(require_admin)):
    """Guild Health Score — üye başına 0-100 puan.
    Karışım: RSVP oranı (%35) + Katılım oranı (%35) + Puan tutarlılığı (%30).

    - RSVP oranı: eligible etkinliklerin yüzde kaçına Evet/Geç yanıtı verildi
    - Katılım oranı: yanıtladıklarının yüzde kaçına gerçekten check-in yapıldı
    - Puan tutarlılığı: puan varyasyon katsayısı ne kadar düşükse o kadar yüksek

    v62 — Alliance case-sensitive: `GOW` (ana) ile `GoW`/`GOw` (akademi)
    üyeleri sadece kendi ittifaklarına scope'lu etkinlikler üzerinden değerlendirilir.
    """
    days = max(30, min(int(days or 90), 365))
    cutoff_iso = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()

    events = await db.events.find({"date": {"$gte": cutoff_iso}}, {"_id": 0, "id": 1, "alliance_scope": 1}).to_list(5000)
    ev_scope = {e["id"]: (e.get("alliance_scope") or "GOW").strip() for e in events}
    event_ids = list(ev_scope.keys())
    if not event_ids:
        return []

    members = await db.members.find({}, {"_id": 0, "id": 1, "name": 1, "alliance_name": 1}).to_list(5000)

    # RSVPs
    rsvps = await db.event_rsvps.find(
        {"event_id": {"$in": event_ids}}, {"_id": 0, "member_id": 1, "event_id": 1, "status": 1}
    ).to_list(50000)
    rsvp_by_member: dict = {}
    for r in rsvps:
        mid_r = r.get("member_id")
        eid_r = r.get("event_id")
        if not mid_r or not eid_r:
            continue
        rsvp_by_member.setdefault(mid_r, {})[eid_r] = r.get("status")

    # Attendance
    attendance = await db.event_attendance.find(
        {"event_id": {"$in": event_ids}}, {"_id": 0, "member_id": 1, "event_id": 1}
    ).to_list(50000)
    att_set = {(a.get("member_id"), a.get("event_id")) for a in attendance if a.get("member_id") and a.get("event_id")}

    # Points
    points = await db.points.find(
        {"event_id": {"$in": event_ids}}, {"_id": 0, "member_id": 1, "event_id": 1, "points": 1}
    ).to_list(200000)
    pts_by_member: dict = {}
    for p in points:
        pmid = p.get("member_id")
        if not pmid:
            continue
        pts_by_member.setdefault(pmid, []).append((p.get("event_id"), p.get("points") or 0))

    out = []
    for m in members:
        mid = m.get("id")
        alliance = (m.get("alliance_name") or "").strip()
        # Case-sensitive eligibility: `GOW` scope only matches `GOW` alliance.
        eligible = [eid for eid, sc in ev_scope.items() if sc.lower() == "all" or sc == alliance]
        n_eligible = len(eligible)
        if n_eligible == 0:
            continue
        elig_set = set(eligible)

        member_rsvps = rsvp_by_member.get(mid, {})
        yes_late = sum(1 for eid in eligible if member_rsvps.get(eid) in ("attending", "late"))
        rsvp_rate = (yes_late / n_eligible) * 100

        attended = sum(1 for eid in eligible if (mid, eid) in att_set)
        # Attendance rate = attended / yes_late (kişi söz verdiğinde ne kadar tuttu)
        # If member never RSVP'd yes, fall back to attended/eligible to avoid inflated 0.
        if yes_late > 0:
            att_rate = min(100.0, (attended / yes_late) * 100)
        else:
            att_rate = (attended / n_eligible) * 100

        # Point consistency = 1 - (stddev/mean), clamped to [0, 100]
        m_pts = [pts for (eid_p, pts) in pts_by_member.get(mid, []) if eid_p in elig_set]
        m_pts = [x for x in m_pts if x is not None]
        if len(m_pts) >= 2 and sum(m_pts) > 0:
            mean = sum(m_pts) / len(m_pts)
            variance = sum((x - mean) ** 2 for x in m_pts) / len(m_pts)
            stddev = variance ** 0.5
            cv = (stddev / mean) if mean > 0 else 1.0
            consistency = max(0.0, min(100.0, (1 - cv) * 100))
        else:
            # Not enough data → neutral 50 so a single-event member isn't punished.
            consistency = 50.0

        score = 0.35 * rsvp_rate + 0.35 * att_rate + 0.30 * consistency
        score = max(0.0, min(100.0, score))

        out.append({
            "member_id": mid,
            "name": m.get("name"),
            "alliance_name": alliance,
            "score": round(score, 1),
            "breakdown": {
                "rsvp_rate": round(rsvp_rate, 1),
                "attendance_rate": round(att_rate, 1),
                "consistency": round(consistency, 1),
                "eligible_events": n_eligible,
                "yes_late": yes_late,
                "attended": attended,
                "point_events": len(m_pts),
            },
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return out




# ---------- Raporlar Merkezi (Phase 3) ----------

def _reports_period_cutoff(period: str) -> Optional[str]:
    """Return an ISO date string cutoff for the given `period` selector, or
    None for `all`. `30d` / `90d` / `180d` supported. Any other value falls
    back to `all`."""
    from datetime import datetime as _dt_r, timezone as _tz_r, timedelta as _td_r
    p = (period or "all").lower()
    if p == "all":
        return None
    m = {"1d": 1, "7d": 7, "30d": 30, "90d": 90, "180d": 180, "1y": 365}
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
        # v61 — case-sensitive: `GOW` ≠ `GoW` ≠ `gow`.
        member_query["alliance_name"] = alliance
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
        # v61 — case-sensitive.
        member_query["alliance_name"] = alliance
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
    has access before the real Sunday digest lands.
    v137.2 — Verilen chat_id yok sayılır; test mesajı yalnızca
    `TELEGRAM_TEST_CHAT_ID`'ye yönlenir."""
    try:
        from telegram_bot import send_message as _tg_send
        ok = await _tg_send(str(chat_id),
            f"🧪 TiTaNXiS Digest Bağlantı Testi — hedef `{chat_id}` haftalık özeti alacak.",
            is_test=True)
        return {"ok": bool(ok), "chat_id": chat_id, "test_routed": True}
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
            # v137.2 — Test dispatch: her koşulda TEST_CHAT_ID'ye yönlenir,
            # admin'in kendi DM'i kirletilmez.
            from telegram_bot import send_message as _tg_send
            ok = await _tg_send(str(chat_id), body, is_test=True)
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
    ev_query: dict = {"archived": False, "attendance_enabled": {"$ne": False}}
    if cutoff:
        ev_query["date"] = {"$gte": cutoff}
    events = await db.events.find(ev_query, {"_id": 0}).sort("date", -1).to_list(20000)
    if not events:
        return {"period": period, "items": [], "member_pool": 0}
    # v60 — per-event member pool now respects each event's alliance_scope.
    # v61 — case-SENSITIVE match: `GOW`, `GoW`, `gow` are DISTINCT alliances.
    scope_counts: dict = {}
    async def _pool_for_scope(scope: str) -> int:
        s = (scope or "GOW").strip()
        if s in scope_counts:
            return scope_counts[s]
        if not s or s.lower() == "all":
            n = await db.members.count_documents({})
        else:
            n = await db.members.count_documents({"alliance_name": s})
        scope_counts[s] = n
        return n
    default_pool = await _pool_for_scope("GOW")
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
        ev_pool = await _pool_for_scope(e.get("alliance_scope") or "GOW")
        rate = round(showed_up / ev_pool * 100, 1) if ev_pool else 0.0
        items.append({
            "id": e["id"],
            "name": e.get("name"),
            "group_name": e.get("group_name"),
            "date": e.get("date"),
            "series_id": e.get("series_id"),
            "alliance_scope": e.get("alliance_scope") or "GOW",
            "attending": stats["attending"],
            "declined": stats["declined"],
            "maybe": stats["maybe"],
            "late": stats["late"],
            "no_response": max(0, ev_pool - responded),
            "responded": responded,
            "member_pool": ev_pool,
            "participation_rate": rate,
        })
    return {"period": period, "items": items, "member_pool": default_pool}


@api_router.get("/reports/events/{event_id}/attendance")
async def reports_event_attendance_detail(event_id: str, user: dict = Depends(require_admin)):
    """Per-member attendance rows for a single event so the frontend can
    render the editable status dropdown. Returns every member (even those
    without a doc) so admins can promote a no-response to a status inline.

    v58 — Members list is now restricted to `event.alliance_scope` so the
    "X/N" total never leaks non-scoped members. `all` scope still returns
    everyone; a specific scope (e.g. "GOW") returns only that alliance."""
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(404, "Etkinlik bulunamadı")
    scope = (ev.get("alliance_scope") or "GOW").strip()
    mfilter: dict = {}
    if scope and scope.lower() != "all":
        # v61 — case-SENSITIVE exact match. `GOW`, `GoW`, `gow` are distinct.
        mfilter["alliance_name"] = scope
    members = await db.members.find(mfilter, {"_id": 0, "id": 1, "name": 1,
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
                      "group_name": ev.get("group_name"),
                      "alliance_scope": scope},
            "items": items,
            "total_scoped_members": len(members)}


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



# =========================================================================
# v138.8 — LiveKit Sesli Kanallar
# =========================================================================
# Endpoints:
#   POST /api/voice/rooms         (admin) — oda oluştur
#   GET  /api/voice/rooms         (auth)  — erişim yetkisi olan odaları listele
#   DELETE /api/voice/rooms/{id}  (admin) — oda sil
#   POST /api/voice/token         (auth)  — LiveKit access token üret
#
# Data model (`voice_rooms` koleksiyonu):
#   id, name, created_by, created_at, password_hash
# v140.7 — Davet sistemi kaldırıldı. Herkes (üye veya ziyaretçi) şifreyi
# doğru girerse katılabilir. Admin bypass korunuyor.
try:
    from livekit import api as _lk_api  # noqa: F401
    _LK_OK = True
except Exception:
    _LK_OK = False


class VoiceRoomCreate(BaseModel):
    name: str
    password: str  # v139 — zorunlu; şifresiz oda yok
    # v140.35 — Davetli üye ID listesi. Davetli olan üyeler şifre girmeden
    # doğrudan odaya katılabilir. Boş bırakılırsa oda "sadece şifre" modunda
    # kalır (mevcut davranış).
    invited_user_ids: Optional[List[str]] = None


class VoiceRoomInviteUpdate(BaseModel):
    invited_user_ids: List[str]


@api_router.post("/voice/rooms")
async def voice_room_create(body: VoiceRoomCreate, u: dict = Depends(require_admin)):
    if not (body.name or "").strip():
        raise HTTPException(400, "Oda adı boş olamaz")
    if not (body.password or "").strip():
        raise HTTPException(400, "Oda şifresi zorunludur")
    pw = body.password.strip()
    invited = list({(x or "").strip() for x in (body.invited_user_ids or []) if (x or "").strip()})
    doc = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip()[:80],
        "created_by": u["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "password_hash": _hash_password(pw),
        # v140.8 — Admin, kanal şifresini üyelere DM/chat üzerinden paylaşmak
        # istiyor. Plaintext admin-only endpoint (`GET /voice/rooms/{id}/password`)
        # üzerinden döndürülüyor; asla `voice_rooms_list` yanıtında çıkmıyor.
        "password_plain": pw,
        # v140.35 — Davetli listesi (invite bypass, ayrı sistem değil).
        "invited_user_ids": invited,
    }
    await db.voice_rooms.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    doc.pop("password_plain", None)
    return doc


@api_router.patch("/voice/rooms/{room_id}/invited")
async def voice_room_update_invited(room_id: str, body: VoiceRoomInviteUpdate,
                                     admin: dict = Depends(require_admin)):
    """v140.35 — Odanın davetli listesini güncelle. Admin yetkisi zorunlu.
    v140.44 — Yeni davet edilen (delta) her üyeye "Bir sesli odaya davet
    edildin: {roomName}" bildirim çanı + web push gönder."""
    invited = list({(x or "").strip() for x in (body.invited_user_ids or []) if (x or "").strip()})
    room = await db.voice_rooms.find_one({"id": room_id}, {"_id": 0, "id": 1, "name": 1, "invited_user_ids": 1})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    prev = set(room.get("invited_user_ids") or [])
    newly_added = [uid for uid in invited if uid not in prev]
    await db.voice_rooms.update_one(
        {"id": room_id},
        {"$set": {"invited_user_ids": invited}},
    )

    # v140.44 — Yeni davetlileri bilgilendir (bell + web push + SSE).
    if newly_added:
        room_name = room.get("name") or "Sesli Oda"
        admin_uname = (admin.get("username") or "").strip() or "Yönetici"
        title = "🎫 Sesli oda davetin var"
        body_txt = f"Bir sesli odaya davet edildin: {room_name}"
        url_target = "/sesli-kanallar"
        now_iso_str = now_iso()

        # Bell rows (bulk insert).
        try:
            notif_docs = [{
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "title": title,
                "body": body_txt,
                "url": url_target,
                "event_id": None,
                "sched_id": f"voice-invite-{room_id}",
                "kind": "voice_room_invite",
                "meta": {"room_id": room_id, "room_name": room_name, "invited_by": admin_uname},
                "created_at": now_iso_str,
                "read": False,
            } for uid in newly_added]
            if notif_docs:
                await db.in_app_notifications.insert_many(notif_docs)
                for doc in notif_docs:
                    try:
                        _publish_notif(doc["user_id"], {
                            "id": doc["id"], "title": title, "body": body_txt,
                            "url": url_target, "event_id": None,
                            "sched_id": doc["sched_id"],
                            "kind": "voice_room_invite",
                            "created_at": now_iso_str, "read": False,
                        })
                    except Exception:
                        pass
        except Exception as _bex:
            logger.warning(f"voice_invite bell insert failed: {_bex}")

        # Web push (VAPID) to all matching user subscriptions.
        try:
            subs = await db.push_subscriptions.find(
                {"user_id": {"$in": newly_added}}, {"_id": 0}
            ).to_list(500)
            if subs:
                private_pem, _pub = await _get_or_create_vapid()
                payload = json.dumps({
                    "title": title,
                    "body": body_txt,
                    "url": url_target,
                    "tag": f"voice-invite-{room_id}",
                }, ensure_ascii=False)
                for s in subs:
                    try:
                        webpush(
                            subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                            data=payload,
                            vapid_private_key=private_pem,
                            vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
                        )
                    except WebPushException as ex:
                        code = getattr(ex.response, "status_code", None) if hasattr(ex, "response") else None
                        if code in (404, 410):
                            await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})
                    except Exception:
                        pass
        except Exception as _pex:
            logger.warning(f"voice_invite web push failed: {_pex}")

    return {"ok": True, "invited_user_ids": invited, "notified_new": len(newly_added)}


@api_router.get("/voice/rooms/{room_id}")
async def voice_room_detail(room_id: str, _: dict = Depends(require_admin)):
    """v140.36 — Admin oda detayı (davetli listesi dahil). Sadece admin."""
    room = await db.voice_rooms.find_one(
        {"id": room_id},
        {"_id": 0, "password_hash": 0},
    )
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    room["invited_user_ids"] = list(room.get("invited_user_ids") or [])
    return room


class VoiceKickBody(BaseModel):
    identity: str
    # v140.42 — Kick sebebi (opsiyonel). Ban listesinde admin yasağı kaldırırken
    # neden atıldığını görebilsin diye kayıt altında tutulur.
    reason: Optional[str] = None


class VoiceRoomPasswordUpdate(BaseModel):
    password: str


# v140.42 — Public SEO URL list. Yeni public sayfa eklerken buraya bir satır
# ekle → hem `/api/sitemap.xml` hem de container startup'ta üretilen static
# `/sitemap.xml` otomatik güncellenir.
PUBLIC_SEO_URLS: List[dict] = [
    {"loc": "https://titanxis.com/", "priority": "1.0"},
    {"loc": "https://titanxis.com/tanitim", "priority": "0.8"},
    {"loc": "https://titanxis.com/lonca", "priority": "0.7"},
    {"loc": "https://titanxis.com/kurallar", "priority": "0.6"},
    {"loc": "https://titanxis.com/sesli-kanallar", "priority": "0.6"},
]


def _build_sitemap_xml() -> str:
    lines = [
        "<?xml version='1.0' encoding='UTF-8'?>",
        "<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>",
    ]
    for u in PUBLIC_SEO_URLS:
        lines.append(f"  <url><loc>{u['loc']}</loc><priority>{u['priority']}</priority></url>")
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines)


@api_router.get("/sitemap.xml")
async def sitemap_xml():
    """v140.42 — Runtime sitemap. `PUBLIC_SEO_URLS` listesinden anlık üretilir;
    yeni public sayfa eklenince otomatik dahil olur."""
    from fastapi.responses import Response as _Resp
    return _Resp(content=_build_sitemap_xml(), media_type="application/xml")


def _write_static_sitemap():
    """v140.42 — Container startup'ta static `/sitemap.xml`'i tazele. Runtime
    endpoint (`/api/sitemap.xml`) ile aynı listeden üretilir; single source of
    truth `PUBLIC_SEO_URLS`."""
    try:
        import os as _os
        path = "/app/frontend/public/sitemap.xml"
        if _os.path.isdir("/app/frontend/public"):
            with open(path, "w", encoding="utf-8") as f:
                f.write(_build_sitemap_xml())
    except Exception as e:
        logging.getLogger("seo").warning(f"static sitemap write failed: {e}")


def _extract_user_id_prefix(identity: str) -> Optional[str]:
    """v140.37 — Kick edilen kişinin identity'sinden user id prefix'ini çıkar.
    Kimlik formatı: `{username}-{id[:6]}` (üye) veya `guest-{hex8}` (ziyaretçi).
    Ziyaretçi için None döner (ban etkisiz)."""
    if not identity or identity.startswith("guest-"):
        return None
    if "-" not in identity:
        return None
    tail = identity.rsplit("-", 1)[-1]
    return tail if len(tail) >= 4 else None


@api_router.post("/voice/rooms/{room_id}/kick")
async def voice_room_kick(room_id: str, body: VoiceKickBody,
                          admin: dict = Depends(require_admin)):
    """v140.36 — Admin bir katılımcıyı odadan çıkarır (LiveKit removeParticipant).
    v140.37 — Kick edilen üye otomatik olarak bu odanın `banned_user_ids`
    listesine eklenir. Ziyaretçiler için ban etkisizdir (identity her join'de
    yenilenir); yalnızca üye tabanlı ban uygulanır."""
    identity = (body.identity or "").strip()
    if not identity:
        raise HTTPException(400, "identity gerekli")
    room = await db.voice_rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    if not _LK_OK:
        raise HTTPException(500, "LiveKit SDK yüklü değil")
    lk_key = os.environ.get("LIVEKIT_API_KEY", "").strip()
    lk_secret = os.environ.get("LIVEKIT_API_SECRET", "").strip()
    lk_url = os.environ.get("LIVEKIT_URL", "").strip()
    if not (lk_key and lk_secret and lk_url):
        raise HTTPException(500, "LiveKit credentials .env'de eksik")
    http_url = lk_url.replace("wss://", "https://").replace("ws://", "http://")
    try:
        from livekit.api import LiveKitAPI, RoomParticipantIdentity
    except Exception as e:
        raise HTTPException(500, f"LiveKit import failed: {e}")
    lkapi = LiveKitAPI(http_url, lk_key, lk_secret)
    try:
        await lkapi.room.remove_participant(
            RoomParticipantIdentity(room=room["name"], identity=identity),
        )
    except Exception as e:
        try: await lkapi.aclose()
        except Exception: pass
        raise HTTPException(502, f"remove_participant başarısız: {str(e)[:200]}")
    finally:
        try: await lkapi.aclose()
        except Exception: pass

    # v140.37 — Ban listesine ekle (mümkünse user_id ile).
    # v140.42 — Sebep (opsiyonel) kaydediliyor; ban listesi UI'ında görünür.
    banned_user_id = None
    banned_username = None
    reason = ((body.reason or "").strip() or None)
    uid_prefix = _extract_user_id_prefix(identity)
    if uid_prefix:
        u = await db.users.find_one(
            {"id": {"$regex": f"^{uid_prefix}"}},
            {"_id": 0, "id": 1, "username": 1},
        )
        if u:
            banned_user_id = u.get("id")
            banned_username = u.get("username")
            ban_record = {
                "user_id": banned_user_id,
                "username": banned_username,
                "reason": reason,
                "banned_at": datetime.now(timezone.utc).isoformat(),
                "banned_by_username": admin.get("username") or "",
            }
            # Aynı kullanıcı için mevcut kayıt varsa değiştir; yoksa ekle.
            await db.voice_rooms.update_one(
                {"id": room_id},
                {"$pull": {"banned_users": {"user_id": banned_user_id}}},
            )
            await db.voice_rooms.update_one(
                {"id": room_id},
                {
                    "$push": {"banned_users": ban_record},
                    "$addToSet": {"banned_user_ids": banned_user_id},  # geri uyumluluk
                },
            )
    return {
        "ok": True, "kicked": identity, "room": room["name"],
        "banned_user_id": banned_user_id, "banned_username": banned_username,
        "reason": reason,
        "is_guest": identity.startswith("guest-"),
    }


@api_router.patch("/voice/rooms/{room_id}/password")
async def voice_room_update_password(room_id: str, body: VoiceRoomPasswordUpdate,
                                     _: dict = Depends(require_admin)):
    """v140.37 — Admin oda şifresini değiştirir. Mevcut katılımcılar etkilenmez
    (LiveKit session zaten açık); sonraki `/voice/token` çağrılarında yeni şifre
    doğrulanır."""
    pw = (body.password or "").strip()
    if not pw:
        raise HTTPException(400, "Yeni şifre boş olamaz")
    if len(pw) < 4:
        raise HTTPException(400, "Şifre en az 4 karakter olmalı")
    r = await db.voice_rooms.update_one(
        {"id": room_id},
        {"$set": {
            "password_hash": _hash_password(pw),
            "password_plain": pw,
            "password_updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Oda bulunamadı")
    return {"ok": True}


@api_router.get("/voice/rooms/{room_id}/bans")
async def voice_room_list_bans(room_id: str, _: dict = Depends(require_admin)):
    """v140.37 — Admin oda yasaklıları listesini görür.
    v140.42 — Ban objesi artık `reason`, `banned_at`, `banned_by_username` içerir;
    legacy `banned_user_ids` (sadece id listesi) de dahil edilir (username join)."""
    room = await db.voice_rooms.find_one(
        {"id": room_id},
        {"_id": 0, "banned_users": 1, "banned_user_ids": 1},
    )
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    items = list(room.get("banned_users") or [])
    seen = {b.get("user_id") for b in items}
    # Legacy id-only ban kayıtlarını da göster (reason yok).
    legacy_ids = [uid for uid in (room.get("banned_user_ids") or []) if uid not in seen]
    if legacy_ids:
        users = await db.users.find(
            {"id": {"$in": legacy_ids}},
            {"_id": 0, "id": 1, "username": 1},
        ).to_list(len(legacy_ids) + 5)
        umap = {u["id"]: u.get("username") for u in users}
        for uid in legacy_ids:
            items.append({
                "user_id": uid,
                "username": umap.get(uid) or "(silinmiş)",
                "reason": None,
                "banned_at": None,
                "banned_by_username": None,
            })
    return {"items": items}


@api_router.delete("/voice/rooms/{room_id}/bans/{user_id}")
async def voice_room_unban(room_id: str, user_id: str,
                           _: dict = Depends(require_admin)):
    """v140.37 — Yasaklı üyenin banını kaldır. v140.42 — hem yeni `banned_users`
    hem de legacy `banned_user_ids` alanından çeker."""
    r = await db.voice_rooms.update_one(
        {"id": room_id},
        {
            "$pull": {
                "banned_user_ids": user_id,
                "banned_users": {"user_id": user_id},
            },
        },
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Oda bulunamadı")
    return {"ok": True, "unbanned": user_id}


@api_router.get("/voice/rooms")
async def voice_rooms_list(u: Optional[dict] = Depends(_optional_auth)):
    """v140.35 — Davet sistemi geri geldi (opsiyonel bypass). Odalar herkese
    görünür; her authed user için `is_invited: bool` hesaplanır. Adminler için
    `invited_user_ids` de döner (yönetim UI'ı için)."""
    projection = {"_id": 0, "password_hash": 0, "password_plain": 0}
    is_admin = bool(u) and u.get("role") == "admin"
    rows = await db.voice_rooms.find({}, projection).sort("created_at", 1).to_list(200)
    uid = (u or {}).get("id")
    for r in rows:
        invited = list(r.get("invited_user_ids") or [])
        r["is_invited"] = bool(uid and uid in invited)
        r["invited_count"] = len(invited)
        if not is_admin:
            # Sadece admine tam listeyi göster; diğerlerine sadece flag+count yeter.
            r.pop("invited_user_ids", None)
    return rows


@api_router.get("/voice/rooms/{room_id}/password")
async def voice_room_password_reveal(room_id: str, _: dict = Depends(require_admin)):
    """v140.8 — Sadece admin. Odanın plaintext şifresini döner (paylaşabilsin diye).
    Eski docs `password_plain` içermiyorsa "•••••" yollar (admin şifreyi resetleyebilir)."""
    room = await db.voice_rooms.find_one({"id": room_id}, {"password_plain": 1, "_id": 0})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    return {"password": room.get("password_plain") or ""}


@api_router.delete("/voice/rooms/{room_id}")
async def voice_room_delete(room_id: str, _: dict = Depends(require_admin)):
    res = await db.voice_rooms.delete_one({"id": room_id})
    return {"deleted": res.deleted_count}


# v140.5 — Aktif katılımcı sayısı için modül-seviyesi cache. LiveKit REST API
# ağ çağrısı, her istekte yapmak istemeyiz; FAB her 20 sn'de bir polling yaptığı
# için 8 sn'lik pencere yeterince taze.
_VOICE_ACTIVE_CACHE = {"ts": 0.0, "total": 0, "per_room": {}}


@api_router.get("/voice/active-count")
async def voice_active_count():
    """v140.5 — Sesli kanallarda aktif katılımcı sayısı.

    LiveKit `RoomService.list_rooms` çağrısıyla her odanın `num_participants`
    değeri toplanır. Frontend'deki FAB canlı "🔴 N" rozeti için polling yapar.
    8 sn'lik yumuşak cache; LiveKit servisi ulaşılamazsa 0 döner (rozet gizlenir)."""
    import time
    now_ts = time.time()
    if now_ts - _VOICE_ACTIVE_CACHE["ts"] < 8:
        return {"total": _VOICE_ACTIVE_CACHE["total"], "per_room": _VOICE_ACTIVE_CACHE["per_room"]}
    total = 0
    per_room: dict = {}
    try:
        if _LK_OK:
            lk_key = os.environ.get("LIVEKIT_API_KEY", "").strip()
            lk_secret = os.environ.get("LIVEKIT_API_SECRET", "").strip()
            lk_url = os.environ.get("LIVEKIT_URL", "").strip()
            if lk_key and lk_secret and lk_url:
                # LiveKit REST endpoint = wss URL'nin http karşılığı
                http_url = lk_url.replace("wss://", "https://").replace("ws://", "http://")
                from livekit.api import LiveKitAPI, ListRoomsRequest
                lkapi = LiveKitAPI(http_url, lk_key, lk_secret)
                try:
                    resp = await lkapi.room.list_rooms(ListRoomsRequest())
                    for r in getattr(resp, "rooms", []) or []:
                        n = int(getattr(r, "num_participants", 0) or 0)
                        per_room[r.name] = n
                        total += n
                finally:
                    await lkapi.aclose()
    except Exception as e:
        logging.getLogger("voice").debug(f"/voice/active-count LiveKit fetch failed: {e}")
    _VOICE_ACTIVE_CACHE["ts"] = now_ts
    _VOICE_ACTIVE_CACHE["total"] = total
    _VOICE_ACTIVE_CACHE["per_room"] = per_room
    return {"total": total, "per_room": per_room}


class VoiceTokenBody(BaseModel):
    room_id: str
    password: Optional[str] = None
    guest_name: Optional[str] = None  # ziyaretçi için görünen ad


@api_router.post("/voice/token")
async def voice_token(body: VoiceTokenBody, u: Optional[dict] = Depends(_optional_auth)):
    """v140.35 — Erişim mantığı:
      • Admin → şifre/davet gerekmez.
      • Authed user + davetli → şifre gerekmez.
      • Authed user + davetsiz → şifre gerekli.
      • Ziyaretçi (auth yok) → şifre gerekli (biliyorsa girer).
    """
    if not _LK_OK:
        raise HTTPException(500, "LiveKit SDK yüklü değil")
    lk_key = os.environ.get("LIVEKIT_API_KEY", "").strip()
    lk_secret = os.environ.get("LIVEKIT_API_SECRET", "").strip()
    lk_url = os.environ.get("LIVEKIT_URL", "").strip()
    if not (lk_key and lk_secret and lk_url):
        raise HTTPException(500, "LiveKit credentials .env'de eksik")
    room = await db.voice_rooms.find_one({"id": body.room_id})
    if not room:
        raise HTTPException(404, "Oda bulunamadı")
    is_admin = bool(u) and u.get("role") == "admin"
    invited_ids = list(room.get("invited_user_ids") or [])
    banned_ids = list(room.get("banned_user_ids") or [])
    # v140.37 — Ban kontrolü: Admin bile ban listesindeyse geçemez (ancak
    # normalde admin'ler kick edilmemeli). Bu, güvenli-varsayılan davranıştır.
    if u and u.get("id") in banned_ids:
        raise HTTPException(403, "Bu odadan yasaklandınız")
    is_invited = bool(u) and u.get("id") in invited_ids
    if not (is_admin or is_invited):
        # Şifre kontrolü zorunlu (davetsiz üye VEYA ziyaretçi).
        from auth import verify_password as _verify_password
        if not body.password or not _verify_password(body.password, room.get("password_hash", "")):
            raise HTTPException(403, "Şifre yanlış")
    if u:
        identity_base = u.get("username") or u["id"]
        identity = f"{identity_base}-{u['id'][:6]}"
        display = u.get("username") or u.get("email") or "Komutan"
    else:
        gn = (body.guest_name or "Ziyaretçi").strip()[:32] or "Ziyaretçi"
        identity = f"guest-{uuid.uuid4().hex[:8]}"
        display = f"{gn} (ziyaretçi)"
    from livekit.api import AccessToken, VideoGrants
    at = AccessToken(lk_key, lk_secret) \
        .with_identity(identity) \
        .with_name(display) \
        .with_grants(VideoGrants(room_join=True, room=room["name"], can_publish=True, can_subscribe=True))
    return {"token": at.to_jwt(), "url": lk_url, "room": room["name"], "identity": identity}


async def _voice_rooms_seed():
    """v139 — 3 default oda default şifre `titanxis` ile."""
    default_pw = "titanxis"
    default_pw_hash = _hash_password(default_pw)
    for name in ("Genel", "SvS Savaşı", "Strateji Odası"):
        existing = await db.voice_rooms.find_one({"name": name})
        if not existing:
            await db.voice_rooms.insert_one({
                "id": str(uuid.uuid4()),
                "name": name,
                "created_by": "system",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "password_hash": default_pw_hash,
                "password_plain": default_pw,
            })
        elif not existing.get("password_plain"):
            # v140.8 — Eski seed'lerde plaintext yok; admin göz ikonundan görebilsin diye backfill.
            await db.voice_rooms.update_one(
                {"_id": existing["_id"]},
                {"$set": {"password_plain": default_pw}},
            )


@app.on_event("startup")
async def _voice_seed_hook():
    try:
        await _voice_rooms_seed()
    except Exception as e:
        logger.warning(f"voice_rooms_seed failed: {e}")
    # v140.42 — Static /sitemap.xml'i public path listesinden tazele.
    try:
        _write_static_sitemap()
    except Exception as e:
        logger.warning(f"sitemap refresh failed: {e}")


app.include_router(api_router)
app.include_router(make_auth_router(db))
from routes.polls import make_polls_router
app.include_router(make_polls_router(db, require_auth, require_admin, on_poll_created=_poll_broadcast, on_poll_closed=_poll_broadcast_closed, auto_translate=lambda t: globals()["_auto_translate_all"](t)), prefix="/api")
from routes.invites import make_invites_router
from routes.svs import make_svs_router
from auth import hash_password as _hash_password, create_token as _create_token, parse_user_agent as _parse_user_agent, public_user as _public_user
app.include_router(
    make_invites_router(db, require_admin, _hash_password, _create_token, _parse_user_agent, now_iso, _public_user),
    prefix="/api",
)
# v140.34 — Basit davet KODU (8-karakter alfanümerik) + /auth/register akışı.
from routes.invite_codes import make_invite_codes_router
app.include_router(
    make_invite_codes_router(db, require_admin, _hash_password, _create_token, _parse_user_agent, now_iso, _public_user),
    prefix="/api",
)
app.include_router(make_svs_router(db, require_auth, require_admin), prefix="/api")
from routes.ocr import make_ocr_router
app.include_router(make_ocr_router(db, require_edit, require_auth), prefix="/api")
# v135.51 — OCR Audit Log + Undo
from routes.ocr_audit import make_ocr_audit_router, ensure_ocr_audit_indexes as _eoai
app.include_router(make_ocr_audit_router(db, require_admin), prefix="/api")
try:
    import asyncio as _oc_ai
    _oc_ai.get_event_loop().create_task(_eoai(db))
except Exception:
    pass
from routes.alliances import make_alliances_router
app.include_router(make_alliances_router(db, require_edit), prefix="/api")
from routes.badges import make_badges_router, ensure_badges_indexes, seed_preset_badges
app.include_router(make_badges_router(db, require_auth, require_admin), prefix="/api")
from routes.event_templates import make_event_templates_router, ensure_event_templates_indexes
app.include_router(make_event_templates_router(db, require_auth, require_admin), prefix="/api")
from routes.rollcalls import make_rollcalls_router, ensure_rollcalls_indexes
app.include_router(
    make_rollcalls_router(
        db, require_auth, require_admin,
        broadcast_push=_broadcast_push,
        broadcast_in_app=_broadcast_in_app,
    ),
    prefix="/api",
)
from routes.admin_notes import make_admin_notes_router
app.include_router(make_admin_notes_router(db, require_admin), prefix="/api")
from routes.telegram_templates import make_telegram_templates_router, ensure_telegram_templates_indexes
app.include_router(make_telegram_templates_router(db, require_admin), prefix="/api")
# v135.38 — RSVP hatırlatma şablonları hub'ı.
from routes.rsvp_templates import make_rsvp_templates_router, ensure_rsvp_templates_indexes
app.include_router(make_rsvp_templates_router(db, require_admin), prefix="/api")
from routes.admin_todos import make_admin_todos_router, ensure_admin_todos_indexes
app.include_router(make_admin_todos_router(db, require_admin), prefix="/api")
from routes.certificates import (
    make_certificates_router, make_performance_router,
    ensure_certificates_indexes,
)
app.include_router(make_certificates_router(
    db, require_admin, require_auth,
    _compose_event_share_image, SHARE_THEMES,
), prefix="/api")
app.include_router(make_performance_router(db, require_auth), prefix="/api")


# v135.36 — Auto-issue certificates to attendees when an event archives.
# Called from PATCH/{id}, /events/bulk-archive, /events/archive-group and
# /events/auto-archive-sweep. Safe to call repeatedly — inserts one cert
# per (event_id, member_id) using an idempotency check.
async def _auto_issue_certs_for_event(event_id: str) -> int:
    ev = await db.events.find_one({"id": event_id}, {"_id": 0})
    if not ev or not ev.get("auto_certificate"):
        return 0
    # Pull attendees from event_attendance rows; each row = one member.
    att_rows = await db.event_attendance.find(
        {"event_id": event_id}, {"_id": 0, "member_id": 1},
    ).to_list(5000)
    member_ids = list({r.get("member_id") for r in att_rows if r.get("member_id")})
    if not member_ids:
        return 0
    title = (ev.get("auto_certificate_title") or "").strip() or (ev.get("name") or "Sertifika")
    theme = ev.get("auto_certificate_theme") or "amber"
    if theme not in (SHARE_THEMES or {}):
        theme = "amber"
    created = 0
    for mid in member_ids:
        existing = await db.certificates.find_one(
            {"event_id": event_id, "member_id": mid}, {"_id": 0, "id": 1},
        )
        if existing:
            continue
        m = await db.members.find_one({"id": mid}, {"_id": 0, "name": 1})
        if not m:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "verify_token": uuid.uuid4().hex[:12],
            "member_id": mid,
            "member_name": m.get("name"),
            "event_id": event_id,
            "event_name": ev.get("name"),
            "event_date": ev.get("date"),
            "title": title,
            "theme": theme,
            "issued_at": datetime.now(timezone.utc).isoformat(),
            "issued_by": "auto",
        }
        await db.certificates.insert_one(doc)
        created += 1
    return created


# v135.36 — Public certificate verification endpoint (no-auth). Recipients
# share the /sertifika/{token} link so third parties can prove authenticity.
@app.get("/api/certificates/verify/{token}")
async def _cert_verify(token: str):
    cert = await db.certificates.find_one(
        {"verify_token": token}, {"_id": 0},
    )
    if not cert:
        raise HTTPException(404, "certificate not found")
    return {
        "valid": True,
        "title": cert.get("title"),
        "member_name": cert.get("member_name"),
        "event_name": cert.get("event_name"),
        "event_date": cert.get("event_date"),
        "issued_at": cert.get("issued_at"),
        "issued_by": cert.get("issued_by"),
        "theme": cert.get("theme"),
        "id": cert.get("id"),
    }


# v135.31 — Guild rules page (public read + admin edit). Stored as a single
# free-form Markdown-lite blob in `guild_settings.guild_rules`. New members
# get a welcome bell + toast pointing here on signup (see invites.py).
# NOTE: registered on `app` directly (not `api_router`) because these lines
# execute AFTER `app.include_router(api_router)` — the router's routes are
# already frozen by then.
@app.get("/api/guild/rules")
async def get_guild_rules():
    doc = await db.guild_settings.find_one({"key": "guild_rules"}, {"_id": 0})
    return {
        "body": ((doc or {}).get("value") or "").strip(),
        "updated_at": (doc or {}).get("updated_at"),
        "updated_by": (doc or {}).get("updated_by"),
    }


@app.put("/api/guild/rules")
async def put_guild_rules(body: dict, user: dict = Depends(require_admin)):
    raw = (body or {}).get("body") or ""
    if not isinstance(raw, str):
        raise HTTPException(400, "body must be a string")
    raw = raw.strip()
    if len(raw) > 20000:
        raise HTTPException(400, "rules max 20000 karakter")
    await db.guild_settings.update_one(
        {"key": "guild_rules"},
        {"$set": {
            "key": "guild_rules",
            "value": raw,
            "updated_at": now_iso(),
            "updated_by": (user or {}).get("username") or "admin",
        }},
        upsert=True,
    )
    return {"ok": True, "body": raw}


# v135.33 — Guild rules acceptance endpoints. Registered on `app` for the
# same reason as get/put rules (mounted after api_router include).
@app.post("/api/auth/me/rules-accept")
async def _rules_accept(user: dict = Depends(require_auth)):
    now = now_iso()
    await db.users.update_one({"id": user["id"]},
                               {"$set": {"rules_accepted_at": now}})
    return {"ok": True, "rules_accepted_at": now}


@app.get("/api/auth/me/rules-status")
async def _my_rules_status(user: dict = Depends(require_auth)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "rules_accepted_at": 1})
    return {"rules_accepted_at": (u or {}).get("rules_accepted_at")}


@app.get("/api/admin/users/rules-status")
async def _admin_users_rules_status(_: dict = Depends(require_admin)):
    rows = await db.users.find(
        {}, {"_id": 0, "id": 1, "username": 1, "display_name": 1,
             "role": 1, "rules_accepted_at": 1, "created_at": 1},
    ).sort("username", 1).to_list(2000)
    accepted = [r for r in rows if r.get("rules_accepted_at")]
    pending = [r for r in rows if not r.get("rules_accepted_at")]
    return {
        "accepted": accepted, "pending": pending,
        "accepted_count": len(accepted), "pending_count": len(pending),
    }


# v135.33 — Bulk RSVP counts. Single round-trip so the events list can show
# `✅ 8 · 🤔 4 · ❌ 2` chips on every card without N+1 lookups.
@app.get("/api/events/rsvp/counts")
async def _events_rsvp_counts(_: dict = Depends(require_edit)):
    pipeline = [
        {"$match": {"status": {"$in": ["yes", "maybe", "no"]}}},
        {"$group": {"_id": {"event_id": "$event_id", "status": "$status"},
                    "count": {"$sum": 1}}},
    ]
    out: dict = {}
    async for r in db.event_rsvps.aggregate(pipeline):
        eid = r["_id"]["event_id"]
        st = r["_id"]["status"]
        out.setdefault(eid, {"yes_count": 0, "maybe_count": 0, "no_count": 0})
        out[eid][f"{st}_count"] = r["count"]
    return {"counts": out}


# v135.33 — Admin todo due-date reminder loop. Every 15 minutes we look for
# todos due today (or overdue) that have an `assigned_to` username, aren't
# `done`, and haven't been reminded today yet. For each match we push a
# web-push notification to the assignee's linked user + optionally DM their
# telegram_chat_id, then stamp `due_notified_at` so the same todo isn't
# reminded twice on the same day.
async def _admin_todo_due_reminder_loop():
    import asyncio
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    while True:
        try:
            now_tr = _dt.now(_tz(_td(hours=3)))
            today = now_tr.strftime("%Y-%m-%d")
            cursor = db.admin_todos.find({
                "done": {"$ne": True},
                "assigned_to": {"$nin": [None, ""]},
                "due_date": {"$lte": today, "$nin": [None, ""]},
                "$or": [
                    {"due_notified_at": {"$exists": False}},
                    {"due_notified_at": {"$ne": today}},
                ],
            }, {"_id": 0})
            async for todo in cursor:
                try:
                    assignee = (todo.get("assigned_to") or "").strip()
                    user = await db.users.find_one(
                        {"username": assignee},
                        {"_id": 0, "id": 1, "telegram_chat_id": 1},
                    )
                    if not user:
                        # Still stamp so we don't hammer logs — invalid assignee.
                        await db.admin_todos.update_one(
                            {"id": todo["id"]},
                            {"$set": {"due_notified_at": today}},
                        )
                        continue
                    is_overdue = todo["due_date"] < today
                    title = ("⚠️ Gecikmiş görev" if is_overdue
                             else "⏰ Görev bugün son teslim")
                    body_txt = (f"'{todo.get('title')}' — son tarih "
                                f"{todo.get('due_date')}"
                                + (" (gecikti!)" if is_overdue else ""))
                    # Web push
                    try:
                        private_pem, _pub = await _get_or_create_vapid()
                        subs = await db.push_subscriptions.find(
                            {"user_id": user["id"]}, {"_id": 0},
                        ).to_list(20)
                        payload = json.dumps({
                            "title": title, "body": body_txt,
                            "url": "/admin/gorevler",
                            "tag": f"todo-due-{todo['id']}",
                            "sound": "rally",
                        }, ensure_ascii=False)
                        for s in subs:
                            try:
                                webpush(
                                    subscription_info={"endpoint": s["endpoint"], "keys": s["keys"]},
                                    data=payload,
                                    vapid_private_key=private_pem,
                                    vapid_claims={"sub": os.environ.get("VAPID_SUB", "mailto:admin@titanxis.local")},
                                )
                            except Exception:
                                pass
                    except Exception:
                        pass
                    # Telegram DM (if linked chat)
                    try:
                        chat_id = (user.get("telegram_chat_id") or "").strip()
                        if chat_id:
                            from telegram_bot import send_message as _tg_send
                            await _tg_send(chat_id, f"*{title}*\n\n{body_txt}")
                    except Exception:
                        pass
                    # Bell rowu
                    try:
                        await db.in_app_notifications.insert_one({
                            "id": uuid.uuid4().hex,
                            "user_id": user["id"],
                            "title": title, "body": body_txt,
                            "url": "/admin/gorevler",
                            "sched_id": f"todo-due-{todo['id']}-{today}",
                            "created_at": now_iso(),
                            "read": False,
                        })
                    except Exception:
                        pass
                    await db.admin_todos.update_one(
                        {"id": todo["id"]},
                        {"$set": {"due_notified_at": today,
                                  "due_notified_overdue": is_overdue}},
                    )
                    logger.info(f"[todo-due] fired todo={todo['id']} assignee={assignee} overdue={is_overdue}")
                except Exception as _iex:
                    logger.warning(f"[todo-due] per-todo failure: {_iex}")
        except Exception as ex:
            logger.warning(f"[todo-due] loop error: {ex}")
        await asyncio.sleep(900)  # 15 min


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
    # v140.34 — Invite codes (short 8-char) indexes
    try:
        from routes.invite_codes import ensure_invite_codes_indexes
        await ensure_invite_codes_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"invite_codes index ensure: {_e}")
    # SvS indexes
    try:
        from routes.svs import ensure_svs_indexes
        await ensure_svs_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"svs index ensure: {_e}")
    # v135.27 — Telegram templates indexes
    try:
        await ensure_telegram_templates_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"telegram_templates index ensure: {_e}")
    # v135.38 — RSVP templates indexes
    try:
        from routes.rsvp_templates import ensure_rsvp_templates_indexes as _errti, make_scheduler_loop as _ersl
        await _errti(db)
        # v135.39 — Zamanlanmış hatırlatmaları 60 sn'de bir kontrol et.
        _asyncio_cron.create_task(_ersl(db))
    except Exception as _e:
        logging.getLogger("server").warning(f"rsvp_templates index ensure: {_e}")
    # v135.31 — Admin todos indexes
    try:
        await ensure_admin_todos_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"admin_todos index ensure: {_e}")
    # v135.34 — Certificates indexes
    try:
        await ensure_certificates_indexes(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"certificates index ensure: {_e}")

    # One-shot legacy `/app/uploads/*` → Emergent Object Store migration.
    # Idempotent (per-file), so it re-runs safely on every startup and
    # only touches files that haven't been registered in `files` yet.
    try:
        from scripts.migrate_legacy_uploads import migrate_legacy_uploads
        summary = await migrate_legacy_uploads(db)
        if summary.get("migrated") or summary.get("failed"):
            logging.getLogger("server").info(
                f"legacy uploads migration: {summary}"
            )
    except Exception as _e:
        logging.getLogger("server").warning(f"legacy uploads migration: {_e}")

    # F10 / Aşama seed — every (slug, level, stage) combination gets an empty
    # unit-cost doc if missing so admins can jump straight into editing. Also
    # migrates legacy `bina_{slug}_{lvl}` (no stage suffix) → `_a1` variant
    # so existing F6-F9 data still surfaces on Aşama 1.
    try:
        _building_slugs = [
            "komuta_merkezi", "kalkan_kislasi", "bombaci_kislasi",
            "tetikci_kislasi", "revir", "iletisim_merkezi", "forticlad_lab",
        ]
        _levels = ["f6", "f7", "f8", "f9", "f10"]
        _empty = {"yemek": 0, "odun": 0, "celik": 0, "benzin": 0,
                  "sure_saniye": 0, "forticlad": 0, "gelismis_forticlad": 0}
        migrated = 0
        seeded = 0
        for slug in _building_slugs:
            for lvl in _levels:
                # Migrate old-format doc into `_a1` if the new key is absent.
                legacy_key = f"bina_{slug}_{lvl}"
                legacy_doc = await db.unit_costs.find_one({"category": legacy_key})
                if legacy_doc:
                    a1_key = f"{legacy_key}_a1"
                    a1_doc = await db.unit_costs.find_one({"category": a1_key})
                    if not a1_doc:
                        payload = {k: legacy_doc.get(k, 0) for k in _empty.keys()}
                        payload["category"] = a1_key
                        await db.unit_costs.update_one(
                            {"category": a1_key},
                            {"$setOnInsert": payload},
                            upsert=True,
                        )
                        migrated += 1
                # Seed empty docs for every stage that doesn't exist yet.
                for stage in range(1, 6):
                    cat = f"bina_{slug}_{lvl}_a{stage}"
                    res = await db.unit_costs.update_one(
                        {"category": cat},
                        {"$setOnInsert": {"category": cat, **_empty}},
                        upsert=True,
                    )
                    if res.upserted_id:
                        seeded += 1
        if migrated or seeded:
            logging.getLogger("server").info(
                f"unit-cost seed: migrated={migrated} seeded={seeded} (5 stages × F6-F10)"
            )
    except Exception as _e:
        logging.getLogger("server").warning(f"F10/stage seed: {_e}")

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

    # v135 — Badges + Event templates + Rollcalls indexes & preset badge seed.
    try:
        from routes.badges import ensure_badges_indexes as _ebi, seed_preset_badges as _spb
        from routes.event_templates import ensure_event_templates_indexes as _eeti
        from routes.rollcalls import ensure_rollcalls_indexes as _eri
        await _ebi(db)
        await _spb(db)
        await _eeti(db)
        await _eri(db)
    except Exception as _e:
        logging.getLogger("server").warning(f"v135 feature index/seed: {_e}")

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
