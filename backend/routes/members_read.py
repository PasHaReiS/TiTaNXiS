"""Küçük self-contained member/alliance read endpoint'leri — Phase 6.

- GET /alliances       — distinct alliance names (autocomplete için)
- GET /members/{id}    — tek üye + bio join (users.member_ids lookup)

`_record_member_changes` gerektirmez; sadece db.
"""
from fastapi import APIRouter, HTTPException


def make_members_read_router(db):
    router = APIRouter()

    @router.get("/alliances")
    async def list_alliances():
        """Distinct alliance name'leri sıralı liste olarak döndürür."""
        names = await db.members.distinct("alliance_name")
        return sorted([n for n in names if n])

    @router.get("/members/{member_id}")
    async def get_member(member_id: str):
        """Tek üye + varsa `users.member_ids` üzerinden bağlı hesabın bio'sunu
        surface eder. MemberProfileDialog second round-trip yapmaz."""
        doc = await db.members.find_one({"id": member_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Üye bulunamadı")
        try:
            linked = await db.users.find_one(
                {"$or": [
                    {"member_ids": member_id},
                    {"member_id": member_id},
                ]},
                {"_id": 0, "bio": 1, "username": 1},
            )
            if linked and (linked.get("bio") or "").strip():
                doc["bio"] = linked["bio"]
                doc["bio_author_username"] = linked.get("username")
        except Exception:
            pass
        return doc

    return router
