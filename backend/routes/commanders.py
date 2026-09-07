"""Komutan (Commander) CRUD — kod ekstre yükseklerinden hero/lider kartlarını
sunar. Bağımsız router; sadece `db` + `require_edit` dep'ine ihtiyacı vardır.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    created_at: str = Field(default_factory=_now_iso)


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


def make_commanders_router(db, require_edit):
    router = APIRouter()

    @router.get("/commanders")
    async def list_commanders(category: Optional[str] = None):
        query = {}
        if category:
            query["category"] = category
        docs = await db.commanders.find(query, {"_id": 0}).to_list(1000)
        return docs

    @router.post("/commanders")
    async def create_commander(body: CommanderCreate, _: dict = Depends(require_edit)):
        c = Commander(**body.model_dump())
        await db.commanders.insert_one(c.model_dump())
        return c.model_dump()

    @router.patch("/commanders/{commander_id}")
    async def update_commander(commander_id: str, body: CommanderUpdate, _: dict = Depends(require_edit)):
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        res = await db.commanders.update_one({"id": commander_id}, {"$set": update})
        if res.matched_count == 0:
            raise HTTPException(404, "Komutan bulunamadı")
        doc = await db.commanders.find_one({"id": commander_id}, {"_id": 0})
        return doc

    @router.delete("/commanders/{commander_id}")
    async def delete_commander(commander_id: str, _: dict = Depends(require_edit)):
        res = await db.commanders.delete_one({"id": commander_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Komutan bulunamadı")
        return {"ok": True}

    return router
