// Port of apps/api/app/geo.py: coordinates, Google Maps links, Plus Codes, distance and ETA.
const ALPHABET = "23456789CFGHJMPQRVWX";
const NUM = "-?\\d{1,3}(?:\\.\\d+)?";
const PAIR = new RegExp(`^\\s*(${NUM})\\s*,\\s*\\+?(${NUM})\\s*$`);
const PLUS = /\b([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{2,3})/i;
const URL_PATTERNS = [
  new RegExp(`!3d(${NUM})!4d(${NUM})`),
  new RegExp(`[?&](?:q|ll|query|destination)=(${NUM}),\\+?(${NUM})`),
  new RegExp(`/maps/(?:search|place|dir)/(?:[^/]*/)?(${NUM}),\\+?(${NUM})(?:[/?]|$)`),
  new RegExp(`@(${NUM}),(${NUM})`),
  new RegExp(`center=(${NUM}),(${NUM})`),
];
export type LL = [number, number];

export const valid = (a: number, b: number) => Math.abs(a) <= 90 && Math.abs(b) <= 180;
export const fmtGps = (a: number, b: number) => `${a.toFixed(6)},${b.toFixed(6)}`;

export function parseGps(v: string | null | undefined): LL | null {
  if (!v) return null;
  const m = v.match(PAIR);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return valid(a, b) ? [a, b] : null;
}

export function haversine(a: LL, b: LL) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function olcEncode(lat: number, lng: number, pairs = 5) {
  lat = Math.min(Math.max(lat, -90), 90 - 1e-9) + 90;
  lng = (((lng + 180) % 360) + 360) % 360;
  let code = "";
  let res = 20;
  for (let i = 0; i < pairs; i++) {
    code += ALPHABET[Math.floor(lat / res)];
    lat %= res;
    code += ALPHABET[Math.floor(lng / res)];
    lng %= res;
    res /= 20;
  }
  return code;
}

function olcDecode(code: string): LL | null {
  code = code.replace("+", "").toUpperCase();
  if (code.length < 2 || [...code].some((c) => !ALPHABET.includes(c))) return null;
  let lat = -90;
  let lng = -180;
  let res = 20;
  for (let p = 0; p < Math.floor(Math.min(code.length, 10) / 2); p++) {
    lat += ALPHABET.indexOf(code[2 * p]) * res;
    lng += ALPHABET.indexOf(code[2 * p + 1]) * res;
    res /= 20;
  }
  let latRes = res * 20;
  let lngRes = res * 20;
  for (const ch of code.slice(10, 15)) {
    const i = ALPHABET.indexOf(ch);
    latRes /= 5;
    lngRes /= 4;
    lat += Math.floor(i / 4) * latRes;
    lng += (i % 4) * lngRes;
  }
  const out: LL = [lat + latRes / 2, lng + lngRes / 2];
  return valid(out[0], out[1]) ? out : null;
}

function olcRecover(short: string, refLat: number, refLng: number): LL | null {
  short = short.toUpperCase();
  if (!short.includes("+")) return null;
  const pad = 8 - short.indexOf("+");
  if (pad <= 0) return olcDecode(short);
  const res = 20 ** (2 - pad / 2);
  const got = olcDecode(olcEncode(refLat, refLng).slice(0, pad) + short);
  if (!got) return null;
  let [lat, lng] = got;
  const half = res / 2;
  if (refLat + half < lat && lat - res >= -90) lat -= res;
  else if (refLat - half > lat && lat + res <= 90) lat += res;
  if (refLng + half < lng) lng -= res;
  else if (refLng - half > lng) lng += res;
  return valid(lat, lng) ? [lat, lng] : null;
}

export function resolveLocation(text: string, ref?: LL | null): { lat: number; lng: number; gps: string; source: string } | null {
  text = (text ?? "").trim();
  if (!text) return null;
  const pair = parseGps(text);
  if (pair) return { lat: pair[0], lng: pair[1], gps: fmtGps(...pair), source: "coordinates" };
  let got: LL | null = null;
  let source = "link";
  if (text.startsWith("http")) {
    for (const pat of URL_PATTERNS) {
      const m = text.match(pat);
      if (m && valid(Number(m[1]), Number(m[2]))) {
        got = [Number(m[1]), Number(m[2])];
        break;
      }
    }
  }
  if (!got) {
    source = "pluscode";
    let dec = text;
    try { dec = decodeURIComponent(text.replace(/\+/g, "%2B").replace(/%2B/gi, "+")); } catch {}
    const m = dec.match(PLUS);
    if (m) {
      const c = m[1].toUpperCase();
      got = c.indexOf("+") >= 8 ? olcDecode(c) : ref ? olcRecover(c, ref[0], ref[1]) : null;
    }
  }
  return got ? { lat: got[0], lng: got[1], gps: fmtGps(...got), source } : null;
}

export function route(a: LL, b: LL, factor = 1.3) {
  const km = haversine(a, b) * factor;
  return { distance_km: Math.round(km * 100) / 100, duration_min: Math.round(km), source: "estimate" };
}

export function etaMinutes(pos: LL, dest: LL, speed: number | null, factor = 1.3): [number, number] {
  const remaining = haversine(pos, dest) * factor;
  const v = speed && speed >= 15 ? speed : 45;
  return [Math.round(remaining * 100) / 100, Math.round((remaining / v) * 60)];
}
