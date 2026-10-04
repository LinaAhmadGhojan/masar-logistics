"""Lists translation keys used in the code but missing from src/lib/dict.   python scripts/check-i18n.py"""
import glob
import os
import re

os.chdir(os.path.join(os.path.dirname(__file__), "..", "src"))
defined = set()
for f in glob.glob("lib/dict/*.ts"):
    defined |= set(re.findall(r'^\s*\["([^"]+)",', open(f, encoding="utf-8").read(), re.M))

used = {}
PAT = re.compile(r'"((?:wb|common|nav|dash|job|rep|inv|bill|set|aud|note|pub|prof|users|drv|veh|tar|cod|sender|cons|disp|deliv|trk|gps|print|master|login|role|ev|err|opt|country)\.[a-zA-Z0-9_.]+)"')
for root, _, files in os.walk("."):
    if "dict" in root:
        continue
    for name in files:
        if name.endswith((".ts", ".tsx")):
            path = os.path.join(root, name)
            for k in PAT.findall(open(path, encoding="utf-8").read()):
                used.setdefault(k, path)

missing = sorted(k for k in used if k not in defined)
print(len(missing), "missing")
for k in missing:
    print(k, "  <-", used[k].replace(chr(92), "/"))
