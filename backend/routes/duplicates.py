"""Duplicate member detection + merge + ignore-list — fuzzy string similarity.

`difflib.SequenceMatcher.ratio()` ile isim benzerliği ≥ threshold olan üyeleri
gruplar. Admin merge yapabilir veya "yoksay" (duplicate değil) olarak
işaretleyebilir. Yoksayılanlar `duplicate_ignores` collection'ında tutulur,
sorgudan filtrelenir ve ayrı endpoint'ten geri alınabilir.
"""
import difflib
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _norm(s: str) -> str:
    return "".join((s or "").lower().split())


def _pair_key(id_a: str, id_b: str) -> str:
    """Order-independent key so (A,B) ve (B,A) aynı çift sayılır."""
    return "|".join(sorted([str(id_a), str(id_b)]))


class MergeBody(BaseModel):
    primary_id: str
    secondary_id: str


class IgnoreBody(BaseModel):
    id_a: str
    id_b: str
    reason: str | None = None


def make_duplicates_router(db, require_admin):
    router = APIRouter()

    async def _get_ignored_keys() -> set[str]:
        docs = await db.duplicate_ignores.find({}, {"_id": 0, "pair_key": 1}).to_list(5000)
        return {d["pair_key"] for d in docs if d.get("pair_key")}

    @router.get("/duplicates/members")
    async def find_duplicates(threshold: float = 0.80):
        """Fuzzy tespit — SequenceMatcher(a,b).ratio() ≥ threshold.
        Yoksayılan çiftler (duplicate_ignores) sonuçtan filtrelenir."""
        threshold = max(0.60, min(1.0, float(threshold)))
        members = await db.members.find(
            {}, {"_id": 0, "id": 1, "name": 1, "alliance_name": 1, "power": 1, "country": 1},
        ).to_list(5000)
        if len(members) < 2:
            return []
        ignored = await _get_ignored_keys()
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
                    if _pair_key(a["id"], b["id"]) in ignored:
                        continue
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
        pts_updated = await db.points.update_many(
            {"member_id": body.secondary_id},
            {"$set": {"member_id": body.primary_id, "member_name": primary.get("name")}},
        )
        try:
            await db.member_changes.update_many({"member_id": body.secondary_id},
                                                {"$set": {"member_id": body.primary_id}})
            await db.activity_log.update_many({"member_id": body.secondary_id},
                                              {"$set": {"member_id": body.primary_id}})
        except Exception:
            pass
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
        # Merge sonrası, aynı çift için varsa ignore kaydını temizle (artık gereksiz)
        try:
            await db.duplicate_ignores.delete_one(
                {"pair_key": _pair_key(body.primary_id, body.secondary_id)}
            )
        except Exception:
            pass
        return {
            "ok": True,
            "primary": primary.get("name"),
            "merged": secondary.get("name"),
            "points_moved": pts_updated.modified_count,
        }

    @router.post("/duplicates/ignore")
    async def ignore_pair(body: IgnoreBody, user: dict = Depends(require_admin)):
        """Bir çifti 'duplicate değil' olarak işaretle — sonraki sorgularda gizlenir."""
        if body.id_a == body.id_b:
            raise HTTPException(400, "same member")
        # Üyelerin hâlâ var olduğunu doğrula (snapshot için)
        a = await db.members.find_one({"id": body.id_a}, {"_id": 0, "id": 1, "name": 1})
        b = await db.members.find_one({"id": body.id_b}, {"_id": 0, "id": 1, "name": 1})
        if not a or not b:
            raise HTTPException(404, "member not found")
        pkey = _pair_key(body.id_a, body.id_b)
        existing = await db.duplicate_ignores.find_one({"pair_key": pkey})
        if existing:
            return {"ok": True, "already_ignored": True, "pair_key": pkey}
        doc = {
            "pair_key": pkey,
            "id_a": body.id_a,
            "id_b": body.id_b,
            "name_a": a.get("name"),
            "name_b": b.get("name"),
            "reason": (body.reason or "").strip() or None,
            "ignored_by": user.get("username"),
            "ignored_by_id": user.get("id"),
            "ignored_at": _now_iso(),
        }
        await db.duplicate_ignores.insert_one(doc)
        await db.audit_log.insert_one({
            "action": "ignore_duplicate_pair",
            "pair_key": pkey,
            "id_a": body.id_a,
            "id_b": body.id_b,
            "actor_id": user.get("id"),
            "actor_username": user.get("username"),
            "ts": _now_iso(),
        })
        doc.pop("_id", None)
        return {"ok": True, "already_ignored": False, "entry": doc}

    @router.get("/duplicates/ignored")
    async def list_ignored():
        """Yoksayılan çiftler — en yeni en üstte. Üyeler silinmişse de gösterilir."""
        docs = await db.duplicate_ignores.find({}, {"_id": 0}).sort("ignored_at", -1).to_list(500)
        member_ids: set[str] = set()
        for d in docs:
            if d.get("id_a"): member_ids.add(d["id_a"])
            if d.get("id_b"): member_ids.add(d["id_b"])
        current = {}
        if member_ids:
            async for m in db.members.find(
                {"id": {"$in": list(member_ids)}},
                {"_id": 0, "id": 1, "name": 1, "alliance_name": 1, "power": 1, "country": 1},
            ):
                current[m["id"]] = m
        for d in docs:
            d["a_exists"] = d.get("id_a") in current
            d["b_exists"] = d.get("id_b") in current
            d["a"] = current.get(d.get("id_a")) or {"id": d.get("id_a"), "name": d.get("name_a"), "deleted": True}
            d["b"] = current.get(d.get("id_b")) or {"id": d.get("id_b"), "name": d.get("name_b"), "deleted": True}
        return docs

    @router.delete("/duplicates/ignore/{pair_key}")
    async def unignore_pair(pair_key: str, user: dict = Depends(require_admin)):
        """Yoksayma kaydını geri al — çift tekrar duplicate önerilerinde görünebilir."""
        res = await db.duplicate_ignores.delete_one({"pair_key": pair_key})
        if res.deleted_count == 0:
            raise HTTPException(404, "ignore entry not found")
        await db.audit_log.insert_one({
            "action": "unignore_duplicate_pair",
            "pair_key": pair_key,
            "actor_id": user.get("id"),
            "actor_username": user.get("username"),
            "ts": _now_iso(),
        })
        return {"ok": True, "pair_key": pair_key}

    return router
