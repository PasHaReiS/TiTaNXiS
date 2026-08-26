"""v126 — Standalone backfill (no server.py import). Duplicates the tiny
_auto_translate_all helper so we can run backfill without spinning up the
whole FastAPI app + its side-effects."""
import asyncio, os
import httpx
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

DEEPL_API_KEY = os.environ.get("DEEPL_API_KEY", "")
DEEPL_LANG_MAP = {
    "en": "EN-US", "pt": "PT-PT", "zh": "ZH-HANS", "nb": "NB",
}
ENABLED_LANGS = ["tr", "en", "ru", "de", "fr", "es", "ko", "bg", "cs", "da",
                 "el", "et", "fi", "hu", "id", "it", "ja", "lt", "lv", "nb",
                 "nl", "pl", "pt", "ro", "sk", "sl", "sv", "uk", "zh"]

async def translate_one(text, target_langs):
    if not DEEPL_API_KEY or not text:
        return {}
    base = "https://api-free.deepl.com/v2" if DEEPL_API_KEY.endswith(":fx") else "https://api.deepl.com/v2"
    headers = {"Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}", "Content-Type": "application/json"}
    out = {}
    async with httpx.AsyncClient(timeout=25) as c:
        for lang in target_langs:
            deepl_lang = DEEPL_LANG_MAP.get(lang, lang.upper())
            try:
                r = await c.post(f"{base}/translate", headers=headers,
                                 json={"text": [text], "target_lang": deepl_lang, "source_lang": "TR"})
                r.raise_for_status()
                lst = r.json().get("translations", [])
                if lst:
                    out[lang] = lst[0].get("text", "")
            except Exception:
                pass
    return out

async def _auto_translate_all(text):
    s = (text or "").strip()
    if not s or not DEEPL_API_KEY:
        return {}
    target = [lg for lg in ENABLED_LANGS if lg != "tr"]
    return await translate_one(s, target)


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

    # 1) Folders
    folders = await db.event_folders.find(
        {"$or": [{"name_translations": {"$exists": False}}, {"name_translations": {}}]},
        {"_id": 0, "id": 1, "name": 1},
    ).to_list(500)
    print(f"Folders to backfill: {len(folders)}")
    for f in folders:
        tr = await _auto_translate_all(f["name"])
        if tr:
            await db.event_folders.update_one({"id": f["id"]}, {"$set": {"name_translations": tr}})
            print(f"  folder '{f['name']}' → {len(tr)} langs")

    # 2) Templates
    tpls = await db.folder_templates.find({}, {"_id": 0, "id": 1, "name": 1, "folder_name_default": 1, "name_translations": 1, "folder_name_default_translations": 1}).to_list(200)
    print(f"Templates to backfill: {len(tpls)}")
    for t in tpls:
        upd = {}
        if not t.get("name_translations"):
            nt = await _auto_translate_all(t.get("name") or "")
            if nt: upd["name_translations"] = nt
        fnd = t.get("folder_name_default")
        if fnd and not t.get("folder_name_default_translations"):
            fndt = await _auto_translate_all(fnd)
            if fndt: upd["folder_name_default_translations"] = fndt
        if upd:
            await db.folder_templates.update_one({"id": t["id"]}, {"$set": upd})
            print(f"  template '{t['name']}': +{list(upd.keys())}")

    # 3) Distinct group_names
    distinct = await db.events.distinct("group_name", {"group_name": {"$ne": None}})
    print(f"Distinct groups: {len(distinct)}")
    for g in distinct:
        sample = await db.events.find_one(
            {"group_name": g, "group_translations": {"$exists": True, "$ne": {}}},
            {"_id": 0, "id": 1},
        )
        if sample:
            continue
        tr = await _auto_translate_all(g)
        if tr:
            r = await db.events.update_many(
                {"group_name": g},
                {"$set": {"group_translations": tr}},
            )
            print(f"  group '{g}' → {len(tr)} langs, {r.modified_count} events")

    # 4) Events missing name/subtitle translations
    ev_missing = await db.events.find(
        {"$or": [
            {"name_translations": {"$exists": False}},
            {"name_translations": {}},
        ]},
        {"_id": 0, "id": 1, "name": 1, "subtitle": 1},
    ).to_list(3000)
    print(f"Events name-backfill: {len(ev_missing)}")
    for e in ev_missing:
        upd = {}
        nt = await _auto_translate_all(e.get("name") or "")
        if nt: upd["name_translations"] = nt
        if e.get("subtitle"):
            st = await _auto_translate_all(e["subtitle"])
            if st: upd["subtitle_translations"] = st
        if upd:
            await db.events.update_one({"id": e["id"]}, {"$set": upd})

    # 5) Announcements (v127) — title + body
    ann = await db.announcements.find(
        {"$or": [
            {"title_translations": {"$exists": False}},
            {"title_translations": {}},
        ]},
        {"_id": 0, "id": 1, "title": 1, "body": 1},
    ).to_list(500)
    print(f"Announcements backfill: {len(ann)}")
    for a in ann:
        upd = {}
        if a.get("title"):
            tt = await _auto_translate_all(a["title"])
            if tt: upd["title_translations"] = tt
        if a.get("body"):
            bt = await _auto_translate_all(a["body"])
            if bt: upd["body_translations"] = bt
        if upd:
            await db.announcements.update_one({"id": a["id"]}, {"$set": upd})

    # 6) Polls (v127) — question + per-option text
    polls = await db.polls.find(
        {"$or": [
            {"question_translations": {"$exists": False}},
            {"question_translations": {}},
        ]},
        {"_id": 0, "id": 1, "question": 1, "options": 1},
    ).to_list(500)
    print(f"Polls backfill: {len(polls)}")
    for p in polls:
        upd = {}
        if p.get("question"):
            qt = await _auto_translate_all(p["question"])
            if qt: upd["question_translations"] = qt
        new_opts = []
        for o in (p.get("options") or []):
            if not o.get("text_translations"):
                ot = await _auto_translate_all(o.get("text") or "")
                new_opts.append({**o, "text_translations": ot})
            else:
                new_opts.append(o)
        if new_opts:
            upd["options"] = new_opts
        if upd:
            await db.polls.update_one({"id": p["id"]}, {"$set": upd})

    print("Backfill done.")

asyncio.run(main())
