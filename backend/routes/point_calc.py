"""Puan Hesaplama (Point Calculator) — pre / diger etkinlik tabloları için
FULL modül: CRUD + paylaşım linki + versiyon geçmişi + DeepL toplu çevirisi +
XLSX export/import. Ana bağımlılıklar (DeepL çevirisi, dil listesi) callable/
value olarak inject edilir (`translate_one`, `enabled_langs`, `deepl_api_key`)."""
import hmac as _hmac
import hashlib as _hashlib
import io
import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
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


def make_point_calc_router(db, require_edit, require_auth, require_admin=None,
                            translate_one=None, enabled_langs=None,
                            deepl_api_key: Optional[str] = None):
    """Args:
        require_admin/translate_one/enabled_langs/deepl_api_key are only needed
        for the DeepL translate-all + Excel export/import endpoints. If any is
        missing, those endpoints raise 503 so we never crash on wiring gaps.
    """
    router = APIRouter()
    _enabled_langs = list(enabled_langs or [])

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

    # ---------- DeepL toplu çevirisi (translate-all) ----------
    @router.post("/point-calc/translate-all")
    async def translate_all_pc(kind: str = Query(...), _: dict = Depends(require_admin)):
        if kind not in ("pre", "diger"):
            raise HTTPException(400, "invalid kind")
        if not (deepl_api_key and translate_one and _enabled_langs):
            raise HTTPException(503, "translation engine not configured")
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
            missing = [s for s in strings if not current.get(s) or len(current.get(s, {})) < len(_enabled_langs)]
            if not missing:
                continue
            for src in missing:
                tr_map = await translate_one(src)
                if tr_map:
                    current[src] = {**(current.get(src) or {}), **tr_map}
                    translated_strings += 1
            await db.point_calc_days.update_one(
                {"id": day["id"]},
                {"$set": {"translations": current, "updated_at": _now_iso()}},
            )
        return {"days_processed": len(days), "strings_translated": translated_strings}

    # ---------- Excel export ----------
    @router.get("/point-calc/export")
    async def export_point_calc(kind: str = Query(...), _: dict = Depends(require_auth)):
        if kind not in ("pre", "diger"):
            raise HTTPException(400, "invalid kind")
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment

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
                    continue
                for mat in mats:
                    try:
                        amt = float(mat.get("amount") or 0)
                    except Exception:
                        amt = 0
                    ws.append([title, mult_name, mult_val, miktar, total_points, mat.get("name", ""), amt, miktar * amt])
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions

        # Translations sheet
        trs = wb.create_sheet(title="_Ceviriler")
        apply_header(trs, ["Etkinlik", "Kaynak (TR)"] + [l.upper() for l in _enabled_langs])
        days_cursor2 = db.point_calc_days.find({"kind": kind}).sort([("order", 1)])
        async for day in days_cursor2:
            day.pop("_id", None)
            for src, tr_map in (day.get("translations") or {}).items():
                row_vals = [day.get("name", ""), src] + [tr_map.get(l, "") for l in _enabled_langs]
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

    # ---------- Excel import (round-trip) ----------
    @router.post("/point-calc/import")
    async def import_point_calc(
        kind: str = Query(...),
        file: UploadFile = File(...),
        _: dict = Depends(require_admin),
    ):
        """Round-trip import of an edited Puan Hesaplama Excel export."""
        if kind not in ("pre", "diger"):
            raise HTTPException(400, "invalid kind")
        from openpyxl import load_workbook
        raw = await file.read()
        try:
            wb = load_workbook(filename=io.BytesIO(raw), data_only=True)
        except Exception as e:
            raise HTTPException(400, f"Excel açılamadı: {e}")

        days_cursor = db.point_calc_days.find({"kind": kind}).sort([("order", 1), ("created_at", 1)])
        all_days = []
        async for d in days_cursor:
            d.pop("_id", None)
            all_days.append(d)

        def _norm(s: str) -> str:
            return (s or "").strip().lower()

        name_to_day = {_norm((d.get("name") or "")[:28]): d for d in all_days}
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
            groups: List[dict] = []
            group_index: Dict[tuple, int] = {}
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
                    groups.append({"title": title, "mult_name": mult_name, "mult_val": mult_val,
                                   "miktar": miktar, "mats": []})
                if mat_name or (mat_amt not in ("", None)):
                    groups[group_index[key]]["mats"].append(
                        {"name": mat_name, "amount": str(mat_amt) if mat_amt != "" else ""}
                    )

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

            current = await db.point_calc_days.find_one({"id": day["id"]})
            if current:
                current.pop("_id", None)
                await db.point_calc_history.insert_one({
                    "version_id": str(uuid.uuid4()),
                    "day_id": day["id"],
                    "saved_at": _now_iso(),
                    "changed_fields": ["tables"],
                    "snapshot": current,
                    "source": "excel_import",
                })
            await db.point_calc_days.update_one(
                {"id": day["id"]},
                {"$set": {"tables": tables, "updated_at": _now_iso()}},
            )
            updated += 1

        return {"updated": updated, "skipped": skipped, "errors": errors}

    return router
