"""Yasal doküman servisi — TR kaynak + on-demand DeepL çeviri cache'i.
`translate_one` callable dep olarak enjekte edilir (server.py'deki
`_translate_one`).
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException


logger = logging.getLogger(__name__)


def make_legal_router(db, translate_one):
    router = APIRouter()

    @router.get("/legal/{doc}")
    async def get_legal(doc: str, lang: str = "tr"):
        from legal_content import LEGAL_SOURCES, LEGAL_UPDATED
        if doc not in LEGAL_SOURCES:
            raise HTTPException(404, "unknown legal doc")
        lang = (lang or "tr").lower()
        src = LEGAL_SOURCES[doc]
        if lang == "tr":
            return {"doc": doc, "lang": "tr", "updated": LEGAL_UPDATED,
                    "title": src["title"], "sections": src["sections"]}
        # Cache hit?
        cached = await db.legal_translations.find_one({"doc": doc, "lang": lang}, {"_id": 0})
        if cached:
            return cached["content"]
        # Cache miss → translate via DeepL.
        try:
            title_tr = (await translate_one(src["title"], target_langs=[lang])).get(lang, src["title"])
            sections_tr = []
            for s in src["sections"]:
                h_tr = (await translate_one(s["heading"], target_langs=[lang])).get(lang, s["heading"])
                b_tr = (await translate_one(s["body"], target_langs=[lang])).get(lang, s["body"])
                sections_tr.append({"heading": h_tr, "body": b_tr})
            content = {
                "doc": doc, "lang": lang, "updated": LEGAL_UPDATED,
                "title": title_tr, "sections": sections_tr,
            }
            await db.legal_translations.update_one(
                {"doc": doc, "lang": lang},
                {"$set": {"doc": doc, "lang": lang, "content": content,
                          "cached_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
            return content
        except Exception as e:
            logger.warning(f"legal translate fallback tr for {doc}/{lang}: {e}")
            return {"doc": doc, "lang": "tr", "updated": LEGAL_UPDATED,
                    "title": src["title"], "sections": src["sections"]}

    return router
