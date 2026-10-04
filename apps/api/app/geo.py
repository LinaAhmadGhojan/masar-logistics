"""GPS helpers: parse 'lat,lng', Google Maps links, Plus Codes (Open Location Code), distance and ETA."""
import math
import os
import re

import httpx

ALPHABET = "23456789CFGHJMPQRVWX"
_NUM = r"-?\d{1,3}(?:\.\d+)?"
_PAIR = re.compile(rf"^\s*({_NUM})\s*,\s*\+?({_NUM})\s*$")
_PLUS = re.compile(r"\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})", re.I)
_URL_PATTERNS = [
    re.compile(rf"!3d({_NUM})!4d({_NUM})"),  # the actual pin, preferred over the viewport
    re.compile(rf"[?&](?:q|ll|query|destination)=({_NUM}),\+?({_NUM})"),
    re.compile(rf"/maps/(?:search|place|dir)/(?:[^/]*/)?({_NUM}),\+?({_NUM})(?:[/?]|$)"),
    re.compile(rf"@({_NUM}),({_NUM})"),
    re.compile(rf"center=({_NUM})%2C({_NUM})"),
    re.compile(rf"center=({_NUM}),({_NUM})"),
]


def valid(lat: float, lng: float) -> bool:
    return -90 <= lat <= 90 and -180 <= lng <= 180


def parse_gps(value: str | None) -> tuple[float, float] | None:
    """Strict 'lat,lng' parser used for stored values."""
    if not value:
        return None
    m = _PAIR.match(value)
    if not m:
        return None
    lat, lng = float(m.group(1)), float(m.group(2))
    return (lat, lng) if valid(lat, lng) else None


def fmt_gps(lat: float, lng: float) -> str:
    return f"{lat:.6f},{lng:.6f}"


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1, lat2, lng2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0088 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


# ---- Open Location Code ----------------------------------------------------
def olc_encode(lat: float, lng: float, pairs: int = 5) -> str:
    lat = min(max(lat, -90.0), 90.0 - 1e-9) + 90
    lng = ((lng + 180) % 360)
    code, res = "", 20.0
    for _ in range(pairs):
        code += ALPHABET[int(lat // res)]
        lat %= res
        code += ALPHABET[int(lng // res)]
        lng %= res
        res /= 20
    return code


def olc_decode(code: str) -> tuple[float, float] | None:
    code = code.replace("+", "").upper()
    if len(code) < 2 or any(c not in ALPHABET for c in code):
        return None
    lat, lng, res = -90.0, -180.0, 20.0
    for p in range(min(len(code), 10) // 2):
        lat += ALPHABET.index(code[2 * p]) * res
        lng += ALPHABET.index(code[2 * p + 1]) * res
        res /= 20
    lat_res = lng_res = res * 20
    for ch in code[10:15]:
        idx = ALPHABET.index(ch)
        lat_res /= 5
        lng_res /= 4
        lat += (idx // 4) * lat_res
        lng += (idx % 4) * lng_res
    out = (lat + lat_res / 2, lng + lng_res / 2)
    return out if valid(*out) else None


def olc_recover(short: str, ref_lat: float, ref_lng: float) -> tuple[float, float] | None:
    short = short.upper()
    if "+" not in short:
        return None
    pad = 8 - short.index("+")
    if pad <= 0:
        return olc_decode(short)
    res = 20 ** (2 - pad / 2)
    got = olc_decode(olc_encode(ref_lat, ref_lng)[:pad] + short)
    if not got:
        return None
    lat, lng = got
    half = res / 2
    if ref_lat + half < lat and lat - res >= -90:
        lat -= res
    elif ref_lat - half > lat and lat + res <= 90:
        lat += res
    if ref_lng + half < lng:
        lng -= res
    elif ref_lng - half > lng:
        lng += res
    return (lat, lng) if valid(lat, lng) else None


# ---- resolve whatever the user pasted --------------------------------------
def _from_url(url: str) -> tuple[float, float] | None:
    for pat in _URL_PATTERNS:
        m = pat.search(url)
        if m:
            lat, lng = float(m.group(1)), float(m.group(2))
            if valid(lat, lng):
                return lat, lng
    return None


def _from_plus(text: str, ref: tuple[float, float] | None) -> tuple[float, float] | None:
    from urllib.parse import unquote_plus

    m = _PLUS.search(unquote_plus(text))
    if not m:
        return None
    code = m.group(1).upper()
    if code.index("+") >= 8:
        return olc_decode(code)
    return olc_recover(code, *ref) if ref else None


def resolve_location(text: str, ref: tuple[float, float] | None = None) -> dict | None:
    """Accepts 'lat,lng', a Google Maps URL (also short links), or a Plus Code. Returns {lat,lng,gps,source}."""
    text = (text or "").strip()
    if not text:
        return None
    pair = parse_gps(text)
    if pair:
        return {"lat": pair[0], "lng": pair[1], "gps": fmt_gps(*pair), "source": "coordinates"}

    got = _from_url(text) if text.startswith("http") else None
    source = "link"
    if not got and text.startswith("http") and os.getenv("RESOLVE_LINKS", "1") == "1":
        try:  # short links (maps.app.goo.gl/...) redirect to the full URL
            with httpx.Client(follow_redirects=True, timeout=6, headers={"User-Agent": "Mozilla/5.0"}) as c:
                r = c.get(text)
                got = _from_url(str(r.url)) or _from_url(r.text[:200_000])
        except httpx.HTTPError:
            got = None
    if not got:
        got, source = _from_plus(text, ref), "pluscode"
    if not got:
        return None
    return {"lat": got[0], "lng": got[1], "gps": fmt_gps(*got), "source": source}


# ---- distance & ETA --------------------------------------------------------
def route(a: tuple[float, float], b: tuple[float, float], factor: float = 1.3) -> dict:
    """Driving distance via OSRM when reachable, otherwise haversine x factor."""
    if os.getenv("OSRM_ENABLED", "1") == "1":
        try:
            url = f"https://router.project-osrm.org/route/v1/driving/{a[1]},{a[0]};{b[1]},{b[0]}"
            r = httpx.get(url, params={"overview": "false"}, timeout=4)
            data = r.json()
            if r.status_code == 200 and data.get("code") == "Ok" and data.get("routes"):
                rt = data["routes"][0]
                return {"distance_km": round(rt["distance"] / 1000, 2), "duration_min": round(rt["duration"] / 60), "source": "osrm"}
        except (httpx.HTTPError, ValueError, KeyError):
            pass
    km = haversine_km(a, b) * factor
    return {"distance_km": round(km, 2), "duration_min": round(km / 60 * 60), "source": "estimate"}


def eta_minutes(pos: tuple[float, float], dest: tuple[float, float], speed_kmh: float | None, factor: float = 1.3) -> tuple[float, int]:
    remaining = haversine_km(pos, dest) * factor
    v = speed_kmh if speed_kmh and speed_kmh >= 15 else 45.0
    return round(remaining, 2), int(round(remaining / v * 60))
