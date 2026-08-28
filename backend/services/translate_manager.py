"""Async Translate Manager — Public API Surface (v135.21)

This module is the **single entry point** for all user-content translation
in the app. It re-exports the primitives from `server.py` so callers can
`from services.translate_manager import _translate_fields` instead of
reaching into the monolithic server module.

Public API (in order of preference for new code):

    _translate_fields(doc, fields)
        Multi-field batch translator for a single document. Use this for
        anything with 2+ translatable fields (events, announcements, polls).
        Example:
            await _translate_fields(payload, [
                ("name", "name_translations"),
                ("subtitle", "subtitle_translations"),
                ("group_name", "group_translations"),
            ])

    _auto_translate_batch(texts)
        Translate a list of texts to all 28 non-TR languages. Returns
        parallel list of {lang: text} dicts (or None on failure).

    _auto_translate_all(text)
        Single text → 28-lang dict. Returns None on failure (non-destructive).

    _translate_one(text, target_langs=None)
        Low-level: translate one text to the specified langs. Google-first
        with DeepL fallback, in-process LRU cache, 429/403 retry with
        exponential backoff + Retry-After honouring.

    _google_translate_batch(texts, target_lang)
        Google-only batch primitive (up to 128 texts to one lang per call).

Rate-limit + retry + cache + non-destructive semantics are all handled
transparently. Callers should never call the DeepL/Google APIs directly.

Adding a new translatable content type is a one-liner:

    await _translate_fields(new_payload, [("q", "q_translations"), ...])
"""
from server import (  # noqa: F401
    _translate_fields,
    _auto_translate_batch,
    _auto_translate_all,
    _translate_one,
    _google_translate_batch,
    GOOGLE_TRANSLATION_API_KEY,
    DEEPL_API_KEY,
    GOOGLE_LANG_MAP,
    DEEPL_LANG_MAP,
)

__all__ = [
    "_translate_fields",
    "_auto_translate_batch",
    "_auto_translate_all",
    "_translate_one",
    "_google_translate_batch",
    "GOOGLE_TRANSLATION_API_KEY",
    "DEEPL_API_KEY",
    "GOOGLE_LANG_MAP",
    "DEEPL_LANG_MAP",
]
