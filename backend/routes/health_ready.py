"""Zero-downtime deploy — Kubernetes readiness probe endpoint.

`/api/health/ready` — DB bağlantısı ping + kritik koleksiyonlar OK ise 200,
aksi 503. Load balancer bunu kullanarak trafiği yeni pod'a geçirmez ta ki
uygulama tam warm olana kadar."""
from fastapi import APIRouter, HTTPException


def make_health_ready_router(db):
    router = APIRouter()

    @router.get("/health/ready")
    async def readiness():
        """Deploy sırasında trafiği yeni sürüme geçirmeden önce çağrılır.
        DB ping + members koleksiyonu okunabilirlik testi. Fail → 503."""
        try:
            # 1) DB ping
            await db.command("ping")
            # 2) Kritik koleksiyon smoke test
            await db.members.find_one({}, {"_id": 1})
            return {"status": "ready", "db": "up"}
        except Exception as e:
            raise HTTPException(503, f"not ready: {e}")

    @router.get("/health/live")
    async def liveness():
        """Uygulama süreci ayakta mı? DB gerekmez — sadece process pulse."""
        return {"status": "alive"}

    return router
