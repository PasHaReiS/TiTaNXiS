"""Kubernetes cron endpoints (DeepL log prune, weekly digest email).

Cron endpoints must ack 2xx immediately; the actual work is enqueued as a
background asyncio task. Auth: HMAC bearer token from WEBHOOK_CRON_SECRET.
"""
import os
import hmac as _hmac
import asyncio
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def register_cron(api_router: APIRouter, db, logger: logging.Logger):
    """Register /cron/* endpoints on api_router."""
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "").strip()

    def _check_auth(request: Request) -> None:
        auth = request.headers.get("authorization", "")
        expected = f"Bearer {secret}"
        if not secret or not _hmac.compare_digest(auth, expected):
            raise HTTPException(401, "unauthorized")

    async def _prune_deepl_log_task():
        try:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()
            await db.deepl_translate_log.delete_many({"ts": {"$lt": cutoff}})
        except Exception as ex:
            logger.warning(f"[cron:prune-deepl-log] {ex}")

    async def _weekly_digest_task():
        resend_key = os.environ.get("RESEND_API_KEY", "").strip()
        admin_email = os.environ.get("DIGEST_ADMIN_EMAIL", "").strip()
        sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
        if not resend_key or not admin_email:
            return
        try:
            import resend as _resend
            _resend.api_key = resend_key
            cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            logs = await db.deepl_translate_log.find({"ts": {"$gte": cutoff}}, {"_id": 0}).to_list(20000)
            chars = sum(int(r.get("chars", 0) or 0) for r in logs)
            reqs = len(logs)
            lang_counts: dict = {}
            text_counts: dict = {}
            for r in logs:
                for l in r.get("targets", []) or []:
                    lang_counts[l] = lang_counts.get(l, 0) + 1
                for tx in r.get("texts", []) or []:
                    if tx:
                        text_counts[tx] = text_counts.get(tx, 0) + 1
            top_langs = sorted(lang_counts.items(), key=lambda x: -x[1])[:5]
            top_keys = sorted(text_counts.items(), key=lambda x: -x[1])[:10]
            lang_rows = "".join(
                f"<tr><td style='padding:4px 8px;color:#F5A623'>{l}</td>"
                f"<td style='padding:4px 8px;color:#F5F0E8;text-align:right'>{c}</td></tr>"
                for l, c in top_langs
            ) or "<tr><td colspan='2' style='padding:8px;color:#888'>—</td></tr>"
            key_rows = "".join(
                f"<tr><td style='padding:4px 8px;color:#E74C1A;font-family:monospace'>×{c}</td>"
                f"<td style='padding:4px 8px;color:#F5F0E8'>{(tx[:80]).replace('<','&lt;')}</td></tr>"
                for tx, c in top_keys
            ) or "<tr><td colspan='2' style='padding:8px;color:#888'>—</td></tr>"
            today_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            html = (
                "<div style='background:#0F0806;color:#F5F0E8;font-family:Arial,sans-serif;padding:24px'>"
                "<h2 style='color:#C4B5FD;margin:0 0 4px 0;font-family:Georgia,serif'>TiTaNXiS · Haftalık DeepL Raporu</h2>"
                f"<div style='color:#888;font-size:12px;margin-bottom:20px'>Son 7 gün · {today_str}</div>"
                "<table style='width:100%;margin-bottom:20px'><tr>"
                f"<td style='background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);padding:12px;border-radius:8px'>"
                f"<div style='color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.14em'>Karakter</div>"
                f"<div style='color:#C4B5FD;font-size:20px;font-weight:bold;font-family:monospace'>{chars:,}</div></td>"
                "<td style='width:12px'></td>"
                f"<td style='background:rgba(139,92,246,.1);border:1px solid rgba(139,92,246,.3);padding:12px;border-radius:8px'>"
                f"<div style='color:#888;font-size:10px;text-transform:uppercase;letter-spacing:.14em'>İstek</div>"
                f"<div style='color:#C4B5FD;font-size:20px;font-weight:bold;font-family:monospace'>{reqs}</div></td>"
                "</tr></table>"
                "<div style='color:#F5A623;font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:8px 0'>Hedef Diller</div>"
                f"<table style='width:100%;border-collapse:collapse'>{lang_rows}</table>"
                "<div style='color:#E74C1A;font-size:11px;text-transform:uppercase;letter-spacing:.14em;margin:20px 0 8px'>En Çok Çevrilenler</div>"
                f"<table style='width:100%;border-collapse:collapse'>{key_rows}</table>"
                "</div>"
            )
            params = {
                "from": sender, "to": [admin_email],
                "subject": f"TiTaNXiS Haftalık DeepL Raporu · {chars:,} char / {reqs} req",
                "html": html,
            }
            result = await asyncio.to_thread(_resend.Emails.send, params)
            logger.info(f"[weekly-digest] Resend send OK id={result.get('id') if isinstance(result, dict) else result}")
        except Exception as e:
            logger.error(f"[weekly-digest] send failed: {e}")

    @api_router.post("/cron/prune-deepl-log")
    async def cron_prune_deepl_log(request: Request):
        _check_auth(request)
        asyncio.create_task(_prune_deepl_log_task())
        return {"accepted": True}

    @api_router.post("/cron/weekly-digest-email")
    async def cron_weekly_digest_email(request: Request):
        _check_auth(request)
        asyncio.create_task(_weekly_digest_task())
        return {"accepted": True}
