"""Puan Hesaplama (Point Calculator) — pre / diger etkinlik tabloları CRUD +
paylaşım linki + versiyon geçmişi. `translate-all` / `export` / `import`
endpoint'leri server.py'de kalır (DeepL çeviri + openpyxl bağımlılıkları).
"""
import hmac as _hmac
import hashlib as _hashlib
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def _pc_sign(day_id: str) -> str:
    secret = os.environ.get("JWT_SECRET", "dev-secret").encode()
    return _hmac.new(secret, day_id.encode(), _hashlib.sha256).hexdigest()[:32]


async def _seed_default_pc_days(db, kind: str):
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
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    await db.point_calc_days.insert_many(docs)


def make_point_calc_router(db, require_edit, require_auth):
    router = APIRouter()

    @router.get("/point-calc")
    async def list_point_calc(kind: str = Query(...)):
        if kind not in ("pre", "diger"):
            raise HTTPException(400, "invalid kind")
        await _seed_default_pc_days(db, kind)
        cursor = db.point_calc_days.find({"kind": kind}).sort([("order", 1), ("created_at", 1)])
        out = []
        async for d in cursor:
            d.pop("_id", None)
            out.append(d)
        return out

    @router.post("/point-calc")
    async def create_point_calc(body: PCDayCreate, _: dict = Depends(require_edit)):
        if body.kind not in ("pre", "diger"):
            raise HTTPException(400, "invalid kind")
        doc = body.model_dump()
        if doc.get("unit_labels") is None:
            doc["unit_labels"] = PCUnitLabels().model_dump()
        doc["id"] = str(uuid.uuid4())
        doc["created_at"] = _now_iso()
        doc["updated_at"] = _now_iso()
        await db.point_calc_days.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.patch("/point-calc/{day_id}")
    async def update_point_calc(day_id: str, body: PCDayUpdate, _: dict = Depends(require_edit)):
        upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if not upd:
            raise HTTPException(400, "no fields")
        current = await db.point_calc_days.find_one({"id": day_id})
        if not current:
            raise HTTPException(404, "not found")
        current.pop("_id", None)
        await db.point_calc_history.insert_one({
            "version_id": str(uuid.uuid4()),
            "day_id": day_id,
            "saved_at": _now_iso(),
            "changed_fields": list(upd.keys()),
            "snapshot": current,
        })
        upd["updated_at"] = _now_iso()
        r = await db.point_calc_days.update_one({"id": day_id}, {"$set": upd})
        if r.matched_count == 0:
            raise HTTPException(404, "not found")
        d = await db.point_calc_days.find_one({"id": day_id})
        d.pop("_id", None)
        return d

    @router.delete("/point-calc/{day_id}")
    async def delete_point_calc(day_id: str, _: dict = Depends(require_edit)):
        r = await db.point_calc_days.delete_one({"id": day_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "not found")
        return {"deleted": True}

    @router.get("/point-calc/{day_id}/share")
    async def make_share_link(day_id: str, _: dict = Depends(require_edit)):
        doc = await db.point_calc_days.find_one({"id": day_id})
        if not doc:
            raise HTTPException(404, "not found")
        return {"id": day_id, "sig": _pc_sign(day_id)}

    @router.get("/public/point-calc/{day_id}")
    async def public_point_calc(day_id: str, sig: str = Query(...)):
        expected = _pc_sign(day_id)
        if not _hmac.compare_digest(expected, sig):
            raise HTTPException(403, "invalid signature")
        doc = await db.point_calc_days.find_one({"id": day_id})
        if not doc:
            raise HTTPException(404, "not found")
        doc.pop("_id", None)
        return doc

    @router.get("/point-calc/{day_id}/history")
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

    @router.post("/point-calc/{day_id}/revert/{version_id}")
    async def revert_history(day_id: str, version_id: str, _: dict = Depends(require_edit)):
        snap = await db.point_calc_history.find_one({"day_id": day_id, "version_id": version_id})
        if not snap:
            raise HTTPException(404, "version not found")
        prev = snap.get("snapshot") or {}
        current = await db.point_calc_days.find_one({"id": day_id})
        if current:
            current.pop("_id", None)
            await db.point_calc_history.insert_one({
                "version_id": str(uuid.uuid4()),
                "day_id": day_id,
                "saved_at": _now_iso(),
                "changed_fields": ["revert"],
                "snapshot": current,
            })
        prev.pop("id", None)
        prev["updated_at"] = _now_iso()
        await db.point_calc_days.update_one({"id": day_id}, {"$set": prev})
        doc = await db.point_calc_days.find_one({"id": day_id})
        doc.pop("_id", None)
        return doc

    return router
