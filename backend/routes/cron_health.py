"""Cron sağlık dashboard'u — .emergent/crons.yml'ı okur ve DB'de tutulan
son çalışma zamanlarıyla birleştirir. Sadece admin.

Ek olarak `/cron-health/log` cron endpoint'lerinin kendi tetiklendiğinde
`cron_health_log` koleksiyonuna kayıt bırakmasına izin verir; ancak bu
tamamen opsiyoneldir — mevcut cron kodu değişmese bile dashboard okuma
tarafından çalışır.
"""
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_crons_yml() -> list:
    """Basit YAML parse — 3rd-party lib olmadan (pyyaml gerekmez).
    Sadece bilinen alanları çıkarır: name, description, cron, endpoint, method, enabled.
    """
    path = "/app/.emergent/crons.yml"
    if not os.path.exists(path):
        return []
    text = open(path, "r", encoding="utf-8").read()
    entries = []
    current: Optional[dict] = None
    for line in text.splitlines():
        s = line.rstrip()
        if s.startswith("  - name:"):
            if current:
                entries.append(current)
            current = {"name": s.split(":", 1)[1].strip().strip('"').strip("'")}
        elif current is not None:
            for k in ("description", "cron", "endpoint", "method", "enabled"):
                prefix = f"    {k}:"
                if s.startswith(prefix):
                    val = s.split(":", 1)[1].strip().strip('"').strip("'")
                    if k == "enabled":
                        current[k] = val.lower() == "true"
                    else:
                        current[k] = val
                    break
    if current:
        entries.append(current)
    return entries


def make_cron_health_router(db, require_admin):
    router = APIRouter()

    @router.get("/admin/cron-health")
    async def cron_health(_: dict = Depends(require_admin)):
        entries = _parse_crons_yml()
        # DB tarafında last-run bilgisi (opsiyonel — mevcut cron kodu yazıyorsa okur)
        docs = await db.cron_health_log.find({}, {"_id": 0}).to_list(500)
        by_name = {d.get("name"): d for d in docs}
        now = datetime.now(timezone.utc)
        for e in entries:
            log = by_name.get(e["name"]) or {}
            last_run = log.get("last_run_at")
            e["last_run_at"] = last_run
            e["last_status"] = log.get("last_status")
            e["success_count"] = int(log.get("success_count") or 0)
            e["failure_count"] = int(log.get("failure_count") or 0)
            # Kaç dakika oldu?
            if last_run:
                try:
                    lr = datetime.fromisoformat(last_run.replace("Z", "+00:00"))
                    if lr.tzinfo is None:
                        lr = lr.replace(tzinfo=timezone.utc)
                    delta = int((now - lr).total_seconds() / 60)
                    e["minutes_since_last_run"] = delta
                except Exception:
                    e["minutes_since_last_run"] = None
            else:
                e["minutes_since_last_run"] = None
        return {"crons": entries, "checked_at": now.isoformat()}

    return router