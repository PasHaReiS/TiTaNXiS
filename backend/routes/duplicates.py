"""Duplicate member detection + merge — fuzzy string similarity.

`difflib.SequenceMatcher.ratio()` ile isim benzerliği ≥ 0.80 olan üyeleri
gruplar. Merge işlemi ikincil üyenin puanlarını + audit izini birincile
aktarır, sonra ikincili siler.
"""
import difflib
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(s: str) -> str:
    return "".join((s or "").lower().split())


class MergeBody(BaseModel):
    primary_id: str
    secondary_id: str


def make_duplicates_router(db, require_admin):
    router = APIRouter()

    @router.get("/duplicates/members")
    async def find_duplicates(threshold: float = 0.80):
        """Fuzzy tespit — SequenceMatcher(a,b).ratio() ≥ threshold."""
        threshold = max(0.60, min(1.0, float(threshold)))
        members = await db.members.find(
            {}, {"_id": 0, "id": 1, "name": 1, "alliance_name": 1, "power": 1, "country": 1},
        ).to_list(5000)
        if len(members) < 2:
            return []
        # Basit O(n²) — 5k üye için ~12M kıyaslama, difflib hızlı.
        pairs = []
        for i in range(len(members)):
            a = members[i]
            an = _norm(a.get("name") or "")
            if not an or len(an) < 3:
                continue
            for j in range(i + 1, len(members)):
                b = members[j]
                bn = _norm(b.get("name") or "")
                if not bn or abs(len(an) - len(bn)) > max(4, len(an) // 2):
                    continue
                ratio = difflib.SequenceMatcher(None, an, bn).ratio()
                if ratio >= threshold:
                    pairs.append({"a": a, "b": b, "similarity": round(ratio, 3)})
        pairs.sort(key=lambda p: -p["similarity"])
        return pairs[:200]

    @router.post("/duplicates/merge")
    async def merge_members(body: MergeBody, user: dict = Depends(require_admin)):
        if body.primary_id == body.secondary_id:
            raise HTTPException(400, "same member")
        primary = await db.members.find_one({"id": body.primary_id}, {"_id": 0})
        secondary = await db.members.find_one({"id": body.secondary_id}, {"_id": 0})
        if not primary or not secondary:
            raise HTTPException(404, "member not found")
        # Puanları taşı
        pts_updated = await db.points.update_many(
            {"member_id": body.secondary_id},
            {"$set": {"member_id": body.primary_id, "member_name": primary.get("name")}},
        )
        # Audit izlerini taşı (member_changes + activity_log)
        try:
            await db.member_changes.update_many({"member_id": body.secondary_id},
                                                {"$set": {"member_id": body.primary_id}})
            await db.activity_log.update_many({"member_id": body.secondary_id},
                                              {"$set": {"member_id": body.primary_id}})
        except Exception:
            pass
        # Snapshot before deletion (for audit)
        await db.audit_log.insert_one({
            "action": "merge_members",
            "primary_id": body.primary_id,
            "secondary_snapshot": secondary,
            "points_moved": pts_updated.modified_count,
            "actor_id": user.get("id"),
            "actor_username": user.get("username"),
            "ts": _now_iso(),
        })
        await db.members.delete_one({"id": body.secondary_id})
        return {
            "ok": True,
            "primary": primary.get("name"),
            "merged": secondary.get("name"),
            "points_moved": pts_updated.modified_count,
        }

    return router
