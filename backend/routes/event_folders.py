"""Event archive folder taxonomy + templates + per-group win/loose badges.

Extracted from `server.py` (Feb 18, 2026 refactor). Groups all endpoints
that manage the folder structure surfaced under Events > Arşiv and the
Leaderboard > Arşiv views. Registered from server.py via
`register_event_folders(api_router, db, require_edit)`.

Endpoints (all mounted under `/api/*` via the shared `api_router`):
- GET    /event-folders                           list folders + counts
- POST   /event-folders                           create folder
- PATCH  /event-folders/{folder_id}               update folder metadata
- DELETE /event-folders/{folder_id}               delete folder (events keep)
- POST   /event-folders/assign                    move events into a folder
- POST   /event-folders/reorder                   drag-drop folder order
- POST   /event-folders/{folder_id}/bulk-archive  toggle archived on folder
- POST   /event-folders/{folder_id}/reorder-events per-folder event order
- GET    /event-folder-templates                  colour/icon presets
- POST   /event-folder-templates                  create preset
- DELETE /event-folder-templates/{template_id}    delete preset
- GET    /event-group-results                     per-group Win/Loose badges
- PUT    /event-group-results/{group_name}        set / clear a badge
"""
from datetime import datetime, timezone
from typing import Optional, List
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class EventFolder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    order: int = 0
    event_order: List[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now_iso)


class EventFolderCreate(BaseModel):
    name: str
    color: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = 0


class EventFolderUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    order: Optional[int] = None
    event_order: Optional[List[str]] = None


class FolderAssignBody(BaseModel):
    event_ids: List[str]
    folder_id: Optional[str] = None


class FolderReorderBody(BaseModel):
    ids: List[str]


class FolderBulkArchiveBody(BaseModel):
    archived: bool


class FolderReorderEventsBody(BaseModel):
    event_ids: List[str]


class FolderTemplate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    folder_name_default: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


class FolderTemplateCreate(BaseModel):
    name: str
    folder_name_default: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class GroupOutcomeBody(BaseModel):
    outcome: Optional[str] = None  # "win" | "loose" | None


def register_event_folders(api_router: APIRouter, db, require_edit):
    """Attach folder / template / group-result routes to the shared router."""

    @api_router.get("/event-folders")
    async def list_event_folders():
        docs = await db.event_folders.find({}, {"_id": 0}).sort("order", 1).to_list(500)
        ids = [d["id"] for d in docs]
        counts = {i: 0 for i in ids}
        if ids:
            pipeline = [
                {"$match": {"folder_id": {"$in": ids}, "archived": True}},
                {"$group": {"_id": "$folder_id", "n": {"$sum": 1}}},
            ]
            async for row in db.events.aggregate(pipeline):
                counts[row["_id"]] = int(row.get("n") or 0)
        for d in docs:
            d["archived_count"] = counts.get(d["id"], 0)
        return docs

    @api_router.post("/event-folders")
    async def create_event_folder(body: EventFolderCreate, _: dict = Depends(require_edit)):
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        f = EventFolder(name=name, color=body.color, icon=body.icon, order=int(body.order or 0))
        await db.event_folders.insert_one(f.model_dump())
        return {**f.model_dump(), "archived_count": 0}

    @api_router.patch("/event-folders/{folder_id}")
    async def update_event_folder(folder_id: str, body: EventFolderUpdate, _: dict = Depends(require_edit)):
        update = {k: v for k, v in body.model_dump().items() if v is not None}
        if "name" in update:
            n = str(update["name"]).strip()
            if not n:
                raise HTTPException(400, "name cannot be empty")
            update["name"] = n
        if not update:
            return {"modified": 0}
        res = await db.event_folders.update_one({"id": folder_id}, {"$set": update})
        return {"modified": res.modified_count}

    @api_router.delete("/event-folders/{folder_id}")
    async def delete_event_folder(folder_id: str, _: dict = Depends(require_edit)):
        await db.events.update_many({"folder_id": folder_id}, {"$set": {"folder_id": None}})
        res = await db.event_folders.delete_one({"id": folder_id})
        return {"deleted": res.deleted_count}

    @api_router.post("/event-folders/assign")
    async def assign_events_to_folder(body: FolderAssignBody, _: dict = Depends(require_edit)):
        ids = [i for i in (body.event_ids or []) if i]
        if not ids:
            return {"modified": 0}
        if body.folder_id is not None:
            exists = await db.event_folders.find_one({"id": body.folder_id}, {"_id": 0, "id": 1})
            if not exists:
                raise HTTPException(404, "folder not found")
        res = await db.events.update_many(
            {"id": {"$in": ids}},
            {"$set": {"folder_id": body.folder_id}},
        )
        return {"modified": res.modified_count, "folder_id": body.folder_id}

    @api_router.post("/event-folders/{folder_id}/bulk-archive")
    async def bulk_archive_folder(folder_id: str, body: FolderBulkArchiveBody, _: dict = Depends(require_edit)):
        exists = await db.event_folders.find_one({"id": folder_id}, {"_id": 0, "id": 1})
        if not exists:
            raise HTTPException(404, "folder not found")
        res = await db.events.update_many(
            {"folder_id": folder_id},
            {"$set": {"archived": bool(body.archived)}},
        )
        return {"modified": res.modified_count, "archived": bool(body.archived)}

    @api_router.post("/event-folders/reorder")
    async def reorder_event_folders(body: FolderReorderBody, _: dict = Depends(require_edit)):
        ids = [i for i in (body.ids or []) if i]
        if not ids:
            return {"modified": 0}
        modified = 0
        for idx, fid in enumerate(ids):
            res = await db.event_folders.update_one({"id": fid}, {"$set": {"order": idx}})
            modified += res.modified_count
        return {"modified": modified}

    @api_router.post("/event-folders/{folder_id}/reorder-events")
    async def reorder_folder_events(folder_id: str, body: FolderReorderEventsBody, _: dict = Depends(require_edit)):
        exists = await db.event_folders.find_one({"id": folder_id}, {"_id": 0, "id": 1})
        if not exists:
            raise HTTPException(404, "folder not found")
        ids = [i for i in (body.event_ids or []) if i]
        await db.event_folders.update_one({"id": folder_id}, {"$set": {"event_order": ids}})
        return {"count": len(ids)}

    @api_router.get("/event-folder-templates")
    async def list_folder_templates():
        docs = await db.folder_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return docs

    @api_router.post("/event-folder-templates")
    async def create_folder_template(body: FolderTemplateCreate, _: dict = Depends(require_edit)):
        name = (body.name or "").strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        t = FolderTemplate(
            name=name, folder_name_default=body.folder_name_default,
            color=body.color, icon=body.icon,
        )
        await db.folder_templates.insert_one(t.model_dump())
        return t.model_dump()

    @api_router.delete("/event-folder-templates/{template_id}")
    async def delete_folder_template(template_id: str, _: dict = Depends(require_edit)):
        res = await db.folder_templates.delete_one({"id": template_id})
        return {"deleted": res.deleted_count}

    @api_router.get("/event-group-results")
    async def list_group_results():
        docs = await db.group_results.find({}, {"_id": 0}).to_list(1000)
        return docs

    @api_router.put("/event-group-results/{group_name}")
    async def set_group_result(group_name: str, body: GroupOutcomeBody, _: dict = Depends(require_edit)):
        if body.outcome not in ("win", "loose", None):
            raise HTTPException(400, "outcome must be win|loose|null")
        if body.outcome is None:
            await db.group_results.delete_one({"group_name": group_name})
        else:
            await db.group_results.update_one(
                {"group_name": group_name},
                {"$set": {"group_name": group_name, "outcome": body.outcome}},
                upsert=True,
            )
        return {"group_name": group_name, "outcome": body.outcome}
