/* eslint-disable @typescript-eslint/no-explicit-any */
// In-browser database for the local (no server) mode: loads the bundled seed, moves every date to "now", persists to localStorage.
import seed from "./seed.json";

export type R = Record<string, any>;
export type DB = Record<string, R[]> & { generated_at: any };

const KEY = "masar-local-v3";
const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/;
const DAY = 86400000;
let db: DB | null = null;

function shift(v: any, ms: number): any {
  if (typeof v === "string" && ISO.test(v)) {
    if (v.length === 10) return new Date(new Date(`${v}T00:00:00Z`).getTime() + Math.round(ms / DAY) * DAY).toISOString().slice(0, 10);
    return new Date(new Date(`${v}Z`).getTime() + ms).toISOString().slice(0, 19);
  }
  if (Array.isArray(v)) return v.map((x) => shift(x, ms));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x, ms)]));
  return v;
}

function fresh(): DB {
  const s = seed as unknown as DB;
  const ms = Date.now() - new Date(`${s.generated_at}Z`).getTime();
  const out: any = { generated_at: new Date().toISOString().slice(0, 19), attachments: [], passwords: {} };
  for (const [k, v] of Object.entries(s)) if (k !== "generated_at") out[k] = k === "cities" ? v : shift(v, ms);
  return out;
}

export function getDB(): DB {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return (db = JSON.parse(raw));
  } catch {}
  return (db = fresh());
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function resetLocal() {
  db = fresh();
  save();
}

export function nextId(table: string): number {
  return Math.max(0, ...getDB()[table].map((r) => r.id)) + 1;
}

export const now = () => new Date().toISOString().slice(0, 19);
export const todayStr = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
export const addDaysStr = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
export const iso = (s: string | null | undefined) => (s ? `${s}Z` : null);
export const r2 = (x: any) => Math.round((Number(x) || 0) * 100) / 100;
