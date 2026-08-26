"""v128d — Force-correct event_view_calendar and event_view_list values
per-language block. Cleanup script had a bug that dropped orphans into
the preceding block, so several langs got wrong-language values.

Anchors on `const XX = {` and edits only that block.
"""
import re

PATH = "/app/frontend/src/i18n/index.js"
with open(PATH) as f:
    text = f.read()

CORRECT = {
    "en": ("List", "Calendar"),
    "ru": ("Список", "Календарь"),
    "de": ("Liste", "Kalender"),
    "fr": ("Liste", "Calendrier"),
    "es": ("Lista", "Calendario"),
    "ko": ("목록", "캘린더"),
    "bg": ("Списък", "Календар"),
    "cs": ("Seznam", "Kalendář"),
    "da": ("Liste", "Kalender"),
    "el": ("Λίστα", "Ημερολόγιο"),
    "et": ("Loend", "Kalender"),
    "fi": ("Lista", "Kalenteri"),
    "hu": ("Lista", "Naptár"),
    "id_": ("Daftar", "Kalender"),
    "it": ("Elenco", "Calendario"),
    "ja": ("リスト", "カレンダー"),
    "lt": ("Sąrašas", "Kalendorius"),
    "lv": ("Saraksts", "Kalendārs"),
    "nb": ("Liste", "Kalender"),
    "nl": ("Lijst", "Kalender"),
    "pl": ("Lista", "Kalendarz"),
    "pt": ("Lista", "Calendário"),
    "ro": ("Listă", "Calendar"),
    "sk": ("Zoznam", "Kalendár"),
    "sl": ("Seznam", "Koledar"),
    "sv": ("Lista", "Kalender"),
    "uk": ("Список", "Календар"),
    "zh": ("列表", "日历"),
}

def esc(s): return s.replace("\\", "\\\\").replace('"', '\\"')

matches = list(re.finditer(r'^const (\w+) = \{\n', text, flags=re.MULTILINE))
for i in range(len(matches) - 1, -1, -1):
    m = matches[i]
    lang = m.group(1)
    if lang not in CORRECT:
        continue
    list_v, cal_v = CORRECT[lang]
    block_start = m.end()
    block_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
    block = text[block_start:block_end]

    def swap(key, new_val, blk):
        pattern = re.compile(rf'^  {re.escape(key)}: "[^"\n]*",$', flags=re.MULTILINE)
        line = f'  {key}: "{esc(new_val)}",'
        if pattern.search(blk):
            return pattern.sub(line, blk, count=1)
        # Insert before closing `};`
        return re.sub(r'(\n)(\};\n)', rf'\1{re.escape(line).replace(chr(92),"")}\n\2', blk, count=1)

    new_block = swap("event_view_list", list_v, block)
    new_block = swap("event_view_calendar", cal_v, new_block)
    if new_block != block:
        text = text[:block_start] + new_block + text[block_end:]

with open(PATH, "w") as f:
    f.write(text)
print("v128d correction done.")
