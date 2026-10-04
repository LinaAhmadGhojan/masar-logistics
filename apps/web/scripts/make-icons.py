"""Generates the Android launcher icons + splash screens from the Masar logo (green gradient + route 'M').
    python scripts/make-icons.py      (run after `npx cap add android`)
"""
import os
from PIL import Image, ImageDraw

RES = os.path.join(os.path.dirname(__file__), "..", "android", "app", "src", "main", "res")
TOP, BOTTOM = (53, 191, 144), (18, 135, 127)


def gradient(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img


def glyph(size, scale=1.0, with_bg=False):
    """The white 'M' route mark on a transparent (or gradient) canvas. scale<1 keeps it inside the adaptive-icon safe zone."""
    S = size * 4  # supersample
    base = gradient(S).convert("RGBA") if with_bg else Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    k = S / 48 * scale
    off = S * (1 - scale) / 2
    pts = [(11, 34), (11, 15), (24, 27), (37, 15), (37, 34)]
    pts = [(off + x * k, off + y * k) for x, y in pts]
    w = 4.2 * k
    d.line(pts, fill="white", width=round(w), joint="curve")
    for x, y in pts:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill="white")
    cx, cy, r = off + 24 * k, off + 36 * k, 2.6 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    return base.resize((size, size), Image.LANCZOS)


def rounded(img, radius_ratio=0.22):
    s = img.size[0]
    mask = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s * 4 - 1, s * 4 - 1], radius=int(s * 4 * radius_ratio), fill=255)
    out = img.copy()
    out.putalpha(mask.resize((s, s), Image.LANCZOS))
    return out


def circle(img):
    s = img.size[0]
    mask = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s * 4 - 1, s * 4 - 1], fill=255)
    out = img.copy()
    out.putalpha(mask.resize((s, s), Image.LANCZOS))
    return out


LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for dens, px in LAUNCHER.items():
    folder = os.path.join(RES, f"mipmap-{dens}")
    full = glyph(px, 0.78, with_bg=True)
    rounded(full).save(os.path.join(folder, "ic_launcher.png"))
    circle(full).save(os.path.join(folder, "ic_launcher_round.png"))
    glyph(round(px * 108 / 48), 0.5).save(os.path.join(folder, "ic_launcher_foreground.png"))  # adaptive foreground (108dp canvas)

# adaptive background = the gradient's mid colour
bg = os.path.join(RES, "values", "ic_launcher_background.xml")
open(bg, "w").write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#25A082</color>\n</resources>\n')
# the template foreground is a vector drawable: remove it so the PNG one is used
vec = os.path.join(RES, "drawable-v24", "ic_launcher_foreground.xml")
if os.path.exists(vec):
    os.remove(vec)

# splash: green gradient + logo, one square image reused everywhere (centerCrop)
splash = gradient(1200)
logo = glyph(360, 0.78, with_bg=True)
splash.paste(rounded(logo, 0.24).convert("RGB"), (420, 420), rounded(logo, 0.24))
splash = splash.convert("RGB")
for root, _, files in os.walk(RES):
    for f in files:
        if f == "splash.png":
            splash.save(os.path.join(root, f))
print("icons + splash written")
