"""Asker Eğitim kalkülatörü için birim maliyet + kaydedilmiş hesaplama CRUD.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    # v141 — Round-trip parity with GET /api/unit-costs/{category}: those
    # responses expose forticlad + gelismis_forticlad, so a POST must accept
    # them too. Optional with 0 defaults so old clients keep working.
    forticlad: float = 0
    gelismis_forticlad: float = 0


def make_unit_costs_router(db, require_edit, require_admin):
    router = APIRouter()

    @router.get("/unit-costs/{category}")
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

    @router.put("/unit-costs/{category}")
    async def put_unit_costs(category: str, body: UnitCostBody, _: dict = Depends(require_admin)):
        doc = {"category": category, **body.model_dump(), "updated_at": _now_iso()}
        await db.unit_costs.update_one({"category": category}, {"$set": doc}, upsert=True)
        return doc

    @router.get("/calculations")
    async def list_calculations(category: str = Query(...), limit: int = 50):
        cursor = db.calculations.find({"category": category}).sort("created_at", -1).limit(min(200, max(1, limit)))
        out = []
        async for d in cursor:
            d.pop("_id", None)
            out.append(d)
        return out

    @router.post("/calculations")
    async def create_calculation(body: CalculationBody, _: dict = Depends(require_edit)):
        doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": _now_iso()}
        await db.calculations.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @router.delete("/calculations/{calc_id}")
    async def delete_calculation(calc_id: str, _: dict = Depends(require_edit)):
        r = await db.calculations.delete_one({"id": calc_id})
        if r.deleted_count == 0:
            raise HTTPException(404, "not found")
        return {"deleted": True}

    return router
