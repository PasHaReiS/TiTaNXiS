"""v128b — Safe re-injection: adds event_view_list/event_view_calendar
just BEFORE the `};` closing of each language block, so we never spill
outside the object literal. Idempotent."""
import re

PATH = "/app/frontend/src/i18n/index.js"
with open(PATH) as f:
    text = f.read()

OVERRIDES = {
    "ru": {"event_view_list": "Список", "event_view_calendar": "Календарь"},
    "de": {"event_view_list": "Liste", "event_view_calendar": "Kalender"},
    "fr": {"event_view_list": "Liste", "event_view_calendar": "Calendrier"},
    "es": {"event_view_list": "Lista", "event_view_calendar": "Calendario"},
    "pt": {"event_view_list": "Lista", "event_view_calendar": "Calendário"},
    "it": {"event_view_list": "Elenco", "event_view_calendar": "Calendario"},
    "nl": {"event_view_list": "Lijst", "event_view_calendar": "Kalender"},
    "pl": {"event_view_list": "Lista", "event_view_calendar": "Kalendarz"},
    "cs": {"event_view_list": "Seznam", "event_view_calendar": "Kalendář"},
    "sk": {"event_view_list": "Zoznam", "event_view_calendar": "Kalendár"},
    "sl": {"event_view_list": "Seznam", "event_view_calendar": "Koledar"},
    "hu": {"event_view_list": "Lista", "event_view_calendar": "Naptár"},
    "ro": {"event_view_list": "Listă", "event_view_calendar": "Calendar"},
    "bg": {"event_view_list": "Списък", "event_view_calendar": "Календар"},
    "uk": {"event_view_list": "Список", "event_view_calendar": "Календар"},
    "el": {"event_view_list": "Λίστα", "event_view_calendar": "Ημερολόγιο"},
    "da": {"event_view_list": "Liste", "event_view_calendar": "Kalender"},
    "nb": {"event_view_list": "Liste", "event_view_calendar": "Kalender"},
    "sv": {"event_view_list": "Lista", "event_view_calendar": "Kalender"},
    "fi": {"event_view_list": "Lista", "event_view_calendar": "Kalenteri"},
    "et": {"event_view_list": "Loend", "event_view_calendar": "Kalender"},
    "lv": {"event_view_list": "Saraksts", "event_view_calendar": "Kalendārs"},
    "lt": {"event_view_list": "Sąrašas", "event_view_calendar": "Kalendorius"},
    "id_": {"event_view_list": "Daftar", "event_view_calendar": "Kalender"},
    "ja": {"event_view_list": "リスト", "event_view_calendar": "カレンダー"},
    "ko": {"event_view_list": "목록", "event_view_calendar": "캘린더"},
    "zh": {"event_view_list": "列表", "event_view_calendar": "日历"},
}

def esc(s): return s.replace("\\", "\\\\").replace('"', '\\"')

matches = list(re.finditer(r'^const (\w+) = \{\n', text, flags=re.MULTILINE))
# Walk backwards so index shifts don't affect earlier positions.
for i in range(len(matches) - 1, -1, -1):
    m = matches[i]
    lang = m.group(1)
    if lang == "tr" or lang not in OVERRIDES:
        continue
    overrides = OVERRIDES[lang]
    block_start = m.end()
    block_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
    block = text[block_start:block_end]
    # Find the closing `};` line boundaries inside this block.
    close_match = re.search(r'\n\};\n', block)
    if not close_match:
        continue
    close_pos = block_start + close_match.start()  # index of the '\n' before '};'
    # Build the lines to insert (skip keys already present).
    lines_to_add = []
    for key, val in overrides.items():
        if re.search(rf'^  {re.escape(key)}: "', block, flags=re.MULTILINE):
            continue
        lines_to_add.append(f'  {key}: "{esc(val)}",')
    if not lines_to_add:
        continue
    insertion = "\n" + "\n".join(lines_to_add)
    text = text[:close_pos] + insertion + text[close_pos:]

with open(PATH, "w") as f:
    f.write(text)
print("v128b done.")
