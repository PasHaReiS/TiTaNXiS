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
from typing import List, Optional, Dict, Union
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
    # Fire-and-forget push notification (respects per-user subscriptions via group filter)
    try:
        fn = globals().get("_broadcast_push")
        if fn:
            await fn(title="Yeni Etkinlik", body=e.name, url="/etkinlikler", tag=f"event-{e.id}", group_name=e.group_name)
    except Exception as ex:
        logger.warning(f"Push broadcast failed: {ex}")
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
        # Combine optional group_name + optional archived/active scope into a single
        # events-collection query so both filters can apply together.
        event_query = {}
        if group_name:
            event_query["group_name"] = group_name
        if scope in ("active", "archived"):
            event_query["archived"] = (scope == "archived")
        if event_query:
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
    "pl": "PL", "pt": "PT-PT", "ro": "RO", "sk": "SK", "sl": "SL", "sv": "SV", "uk": "UK",
    "zh": "ZH",
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


async def _broadcast_push(title: str, body: str, url: str = "/", tag: str = "titanxis", group_name: Optional[str] = None, alliance_name: Optional[str] = None, sound: Optional[str] = None):
    """Broadcast a push. When group_name is provided, only send to users whose prefs include this group
    (users without any saved prefs receive everything by default). When alliance_name is provided,
    only send to subscribers whose linked member document has the matching alliance."""
    private_pem, _ = await _get_or_create_vapid()
    subs = await db.push_subscriptions.find({}, {"_id": 0}).to_list(1000)
    allowed_users: Optional[set] = None
    if group_name:
        prefs = await db.push_prefs.find({}, {"_id": 0}).to_list(2000)
        prefs_by_user = {p["user_id"]: (p.get("groups") or []) for p in prefs}
        allowed_users = set()
        for uid, grps in prefs_by_user.items():
            if not grps or group_name in grps:
                allowed_users.add(uid)
    if alliance_name:
        # Build the set of user_ids whose linked member has this alliance.
        member_docs = await db.members.find({"alliance_name": alliance_name}, {"_id": 0, "id": 1, "user_id": 1}).to_list(5000)
        member_ids = {m["id"] for m in member_docs if m.get("id")}
        alliance_user_ids: set = set()
        # A user may be linked to a member either via users.member_id or member.user_id
        user_docs = await db.users.find({}, {"_id": 0, "id": 1, "member_id": 1}).to_list(5000)
        for u in user_docs:
            if u.get("member_id") and u["member_id"] in member_ids:
                alliance_user_ids.add(u["id"])
        for m in member_docs:
            if m.get("user_id"):
                alliance_user_ids.add(m["user_id"])
        allowed_users = alliance_user_ids if allowed_users is None else (allowed_users & alliance_user_ids)
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
        if allowed_users is not None:
            uid = s.get("user_id")
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
    sound: Optional[str] = "rally"  # rally | victory | dungeon | alarm


@api_router.get("/push/scheduled")
async def push_scheduled_list(_: dict = Depends(require_admin)):
    cursor = db.push_scheduled.find({"sent": False}, {"_id": 0}).sort("scheduled_at", 1).limit(100)
    return await cursor.to_list(100)


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
        "sound": sound,
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
                    await _broadcast_push(
                        doc["title"], doc["body"], doc.get("url", "/"),
                        tag=f"scheduled-{doc['id']}",
                        group_name=doc.get("group_name"),
                        alliance_name=doc.get("alliance_name"),
                        sound=doc.get("sound") or "rally",
                    )
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

app.include_router(api_router)
app.include_router(make_auth_router(db))

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
