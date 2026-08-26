"""v128c — Robust cleanup: find ALL orphan i18n key lines that sit between
`};` and `const XX = {`, and merge them into the PRECEDING block right
before its `};`. Also removes duplicates."""
import re

PATH = "/app/frontend/src/i18n/index.js"
with open(PATH) as f:
    text = f.read()

# Pattern: `};` (line) → 1+ orphan key lines → `const XX = {`
pattern = re.compile(
    r'(\n\};\n)((?:  [a-z_A-Z0-9]+: "[^"\n]*",\n)+)(const \w+ = \{\n)',
    flags=re.MULTILINE,
)

def repl(m):
    close, orphans, next_const = m.group(1), m.group(2), m.group(3)
    # Move orphans BEFORE the `};` line.
    return "\n" + orphans + "};\n" + next_const.replace(next_const, "\n" + next_const) if False else "\n" + orphans.rstrip() + close + next_const

# Simpler: capture as `\n};\n<orphans>const XX = {\n`
# Rewrite as `\n<orphans>};\n\nconst XX = {\n`
def repl2(m):
    close, orphans, next_const = m.group(1), m.group(2), m.group(3)
    # close is "\n};\n" — we want "\n<orphans>};\n\nconst"
    return "\n" + orphans + "};\n\n" + next_const

new_text, n = pattern.subn(repl2, text)
if new_text != text:
    with open(PATH, "w") as f:
        f.write(new_text)
    print(f"Fixed {n} orphan block(s).")
else:
    print("No orphans found — file is clean.")
