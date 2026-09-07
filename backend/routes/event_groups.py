"""Event group-level bulk operations — rename/delete/archive/unarchive/hide.
`_auto_translate_all` (DeepL bulk group name translate) callable inject.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException


def make_event_groups_router(db, require_edit, auto_translate_all=None, auto_issue_certs_for_event=None):
    router = APIRouter()
    log = logging.getLogger(__name__)

    @router.post("/events/archive-group")
    async def archive_group(group_name: str, _: dict = Depends(require_edit)):
        targets = await db.events.find(
            {"group_name": group_name, "archived": False},
            {"_id": 0, "id": 1, "auto_certificate": 1},
        ).to_list(2000)
        res = await db.events.update_many(
            {"group_name": group_name, "archived": False},
            {"$set": {"archived": True}},
        )
        if auto_issue_certs_for_event:
            for ev in targets:
                if ev.get("auto_certificate"):
                    try:
                        await auto_issue_certs_for_event(ev["id"])
                    except Exception as ex:
                        log.warning(f"auto-cert on archive-group failed for {ev.get('id')}: {ex}")
        return {"modified": res.modified_count}

    @router.post("/events/unarchive-group")
    async def unarchive_group(group_name: str, _: dict = Depends(require_edit)):
        res = await db.events.update_many(
            {"group_name": group_name, "archived": True},
            {"$set": {"archived": False}},
        )
        return {"modified": res.modified_count}

    @router.post("/events/rename-group")
    async def rename_group(old_name: str, new_name: str, _: dict = Depends(require_edit)):
        new_name = (new_name or "").strip()
        if not new_name:
            raise HTTPException(400, "new_name cannot be empty")
        if new_name == old_name:
            return {"modified": 0}
        translations = None
        if auto_translate_all:
            try:
                translations = await auto_translate_all(new_name)
            except Exception as ex:
                log.warning(f"auto-translate rename failed: {ex}")
        set_doc: dict = {"group_name": new_name}
        if translations:
            set_doc["group_translations"] = translations
        res = await db.events.update_many(
            {"group_name": old_name},
            {"$set": set_doc},
        )
        return {"modified": res.modified_count, "new_name": new_name}

    @router.delete("/events/group/{group_name}")
    async def delete_group(group_name: str, _: dict = Depends(require_edit)):
        events = await db.events.find({"group_name": group_name}, {"_id": 0, "id": 1}).to_list(2000)
        event_ids = [e["id"] for e in events]
        points_deleted = 0
        if event_ids:
            pr = await db.points.delete_many({"event_id": {"$in": event_ids}})
            points_deleted = pr.deleted_count
        er = await db.events.delete_many({"group_name": group_name})
        return {"events_deleted": er.deleted_count, "points_deleted": points_deleted}

    return router
