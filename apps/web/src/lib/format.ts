export type Lang = "ar" | "en";

const loc = (l: Lang) => (l === "ar" ? "ar-u-nu-latn" : "en-GB"); // Arabic text, Latin digits (the business norm in the region)

export const num = (n: number | null | undefined, l: Lang = "en", digits = 0) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toLocaleString(loc(l), { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const money = (n: number | null | undefined, l: Lang = "en") => num(n, l, 2);

export const km = (n: number | null | undefined, l: Lang = "en") => (n ? `${num(n, l, 1)} ${l === "ar" ? "كم" : "km"}` : "—");

export const kg = (n: number | null | undefined, l: Lang = "en") => (n ? `${num(n, l, 1)} ${l === "ar" ? "كغ" : "kg"}` : "—");

const parse = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

export const date = (iso: string | null | undefined, l: Lang = "en") =>
  iso ? parse(iso).toLocaleDateString(loc(l), { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const dateShort = (iso: string | null | undefined, l: Lang = "en") =>
  iso ? parse(iso).toLocaleDateString(loc(l), { day: "2-digit", month: "short" }) : "—";

export const time = (iso: string | null | undefined, l: Lang = "en") =>
  iso ? parse(iso).toLocaleTimeString(loc(l), { hour: "2-digit", minute: "2-digit" }) : "—";

export const dateTime = (iso: string | null | undefined, l: Lang = "en") => (iso ? `${dateShort(iso, l)} · ${time(iso, l)}` : "—");

export const isoDay = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/** "in 3 h" / "2 d ago" style distance to a moment. */
export function relative(iso: string | null | undefined, l: Lang = "en"): string {
  if (!iso) return "—";
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const unit: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [3600, "minute"], [86400, "hour"], [604800, "day"], [2592000, "week"], [31536000, "month"]];
  let value = diff;
  let u: Intl.RelativeTimeFormatUnit = "second";
  for (let i = 0; i < unit.length; i++) {
    if (abs < unit[i][0]) {
      u = unit[i][1];
      value = diff / (i === 0 ? 1 : unit[i - 1][0]);
      break;
    }
    if (i === unit.length - 1) {
      u = "year";
      value = diff / 31536000;
    }
  }
  return new Intl.RelativeTimeFormat(loc(l), { numeric: "auto" }).format(Math.round(value), u);
}

export const minutesLabel = (min: number | null | undefined, l: Lang = "en") => {
  if (!min && min !== 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}${l === "ar" ? "س" : "h"} ${m}${l === "ar" ? "د" : "m"}` : `${m}${l === "ar" ? " د" : " min"}`;
};

export const gpsParts = (v: string | null | undefined): [number, number] | null => {
  if (!v) return null;
  const m = v.match(/^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
};

export const mapsLink = (gps: string | null | undefined) => {
  const p = gpsParts(gps);
  return p ? `https://www.google.com/maps?q=${p[0]},${p[1]}` : null;
};

export const navLink = (gps: string | null | undefined) => {
  const p = gpsParts(gps);
  return p ? `https://www.google.com/maps/dir/?api=1&destination=${p[0]},${p[1]}&travelmode=driving` : null;
};

export const haversine = (a: [number, number], b: [number, number]) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};
