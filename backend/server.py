from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import io
import csv
import random
import mimetypes
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Dict
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


class Event(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    group_name: str = "SvS vs 10007"
    multiplier: float = 1.0
    date: str
    subtitle: Optional[str] = None
    archived: bool = False
    created_at: str = Field(default_factory=now_iso)


class EventCreate(BaseModel):
    name: str
    group_name: Optional[str] = "SvS vs 10007"
    multiplier: Optional[float] = 1.0
    date: str
    subtitle: Optional[str] = None
    archived: Optional[bool] = False


class EventUpdate(BaseModel):
    name: Optional[str] = None
    group_name: Optional[str] = None
    multiplier: Optional[float] = None
    date: Optional[str] = None
    subtitle: Optional[str] = None
    archived: Optional[bool] = None


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
async def list_members(search: Optional[str] = None):
    query = {}
    if search:
        query = {"$or": [
            {"name": {"$regex": search, "$options": "i"}},
            {"member_id": {"$regex": search, "$options": "i"}},
            {"alliance_name": {"$regex": search, "$options": "i"}}
        ]}
    docs = await db.members.find(query, {"_id": 0}).to_list(1000)
    return docs


@api_router.get("/alliances")
async def list_alliances():
    """Return distinct alliance names for autocomplete."""
    names = await db.members.distinct("alliance_name")
    return sorted([n for n in names if n])


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


@api_router.post("/members")
async def create_member(body: MemberCreate, _: dict = Depends(require_edit)):
    m = Member(**body.model_dump())
    await db.members.insert_one(m.model_dump())
    return m.model_dump()


@api_router.patch("/members/{member_id}")
async def update_member(member_id: str, body: MemberUpdate, _: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    res = await db.members.update_one({"id": member_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Üye bulunamadı")
    doc = await db.members.find_one({"id": member_id}, {"_id": 0})
    return doc


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
    e = Event(**body.model_dump())
    await db.events.insert_one(e.model_dump())
    return e.model_dump()


@api_router.patch("/events/{event_id}")
async def update_event(event_id: str, body: EventUpdate, _: dict = Depends(require_edit)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Değişiklik yok")
    res = await db.events.update_one({"id": event_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Etkinlik bulunamadı")
    doc = await db.events.find_one({"id": event_id}, {"_id": 0})
    return doc


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, _: dict = Depends(require_edit)):
    res = await db.events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Etkinlik bulunamadı")
    return {"ok": True}


@api_router.post("/events/archive-group")
async def archive_group(group_name: str, _: dict = Depends(require_edit)):
    res = await db.events.update_many({"group_name": group_name, "archived": False}, {"$set": {"archived": True}})
    return {"modified": res.modified_count}


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
async def leaderboard(event_id: Optional[str] = None, group_name: Optional[str] = None):
    match_stage = {}
    if event_id:
        match_stage["event_id"] = event_id
    elif group_name:
        events = await db.events.find({"group_name": group_name}, {"_id": 0, "id": 1}).to_list(1000)
        event_ids = [e["id"] for e in events]
        match_stage["event_id"] = {"$in": event_ids}
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
    result = [{"name": g["_id"], "count": g["count"], "active": g["active"]} for g in groups]
    if active_only:
        result = [g for g in result if g["active"] > 0]
    result.sort(key=lambda g: g["name"].lower())
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
            existing_members_by_name[m["name"].lower()] = m
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

            # Prefer matching by member_id, fall back to name (case-insensitive)
            existing = None
            if excel_member_id and excel_member_id in existing_members_by_mid:
                existing = existing_members_by_mid[excel_member_id]
            elif name.lower() in existing_members_by_name:
                existing = existing_members_by_name[name.lower()]

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
                existing_members_by_name[name.lower()] = new_m
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

    members_by_name = {m["name"].lower(): m for m in await db.members.find({}, {"_id": 0}).to_list(10000) if m.get("name")}
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
                    m = members_by_name.get(str(mn).lower().strip())
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


class PCDayCreate(BaseModel):
    kind: str
    name: str
    order: int = 0
    title: str = ""
    miktar: float = 0
    multipliers: List[PCMultiplier] = []
    unit_labels: Optional[PCUnitLabels] = None
    materials: List[PCMaterial] = []


class PCDayUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    title: Optional[str] = None
    miktar: Optional[float] = None
    multipliers: Optional[List[PCMultiplier]] = None
    unit_labels: Optional[PCUnitLabels] = None
    materials: Optional[List[PCMaterial]] = None


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


app.include_router(api_router)
app.include_router(make_auth_router(db))
app.mount("/api/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    await ensure_indexes(db)
    await seed_admin(db)
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
    # Auto-seed disabled: guild leaders now populate their own members.
    # To manually populate demo data, POST /api/seed?force=true with admin token.


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
