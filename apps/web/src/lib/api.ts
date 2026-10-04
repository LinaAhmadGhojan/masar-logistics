"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localApi } from "./local/engine";
import type { User } from "./types";

export const LOCAL = process.env.NEXT_PUBLIC_LOCAL === "1";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8020";
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const TOKEN_KEY = "masar-token";
const USER_KEY = "masar-user";

const safe = <T,>(fn: () => T): T | null => {
  try {
    return fn();
  } catch {
    return null;
  }
};

export const storage = {
  token: () => safe(() => localStorage.getItem(TOKEN_KEY)),
  user: (): User | null => {
    const raw = safe(() => localStorage.getItem(USER_KEY));
    try {
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },
  save: (token: string, user: User) =>
    safe(() => {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }),
  saveUser: (user: User) => safe(() => localStorage.setItem(USER_KEY, JSON.stringify(user))),
  clear: () =>
    safe(() => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }),
};

export class ApiError extends Error {
  constructor(public code: string, public status: number, public fields?: string[]) {
    super(code);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData };

function toLogin() {
  storage.clear();
  if (typeof window !== "undefined" && !window.location.pathname.replace(BASE, "").startsWith("/login")) window.location.href = `${BASE}/login/`;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const token = storage.token();
  if (LOCAL) {
    try {
      return (await localApi(path, opts, token)) as T;
    } catch (e) {
      const err = e as { status?: number; message: string };
      if (err.status === 401 && path !== "/auth/login") toLogin();
      throw new ApiError(err.message, err.status ?? 500);
    }
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError("network", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/login") toLogin();
    const d = data?.detail;
    if (Array.isArray(d)) throw new ApiError("invalid", res.status, d.map((x: { loc?: string[] }) => String(x.loc?.slice(-1)[0] ?? "")));
    throw new ApiError(typeof d === "string" ? d : "unknown", res.status);
  }
  return data as T;
}

export const assetUrl = (u: string) => (u.startsWith("http") || u.startsWith("data:") ? u : `${API_URL}${u}`);

if (LOCAL && typeof window !== "undefined") (window as unknown as { __masarApi: typeof api }).__masarApi = api; // handy for e2e checks

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Fetches `path` (null = do nothing). `poll` re-fetches silently every N ms. */
export function useFetch<T>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    if (first.current || tick === 0) setLoading(true);
    api<T>(path)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e: ApiError) => alive && setError(e))
      .finally(() => alive && (setLoading(false), (first.current = false)));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!opts.poll || path === null) return;
    const id = setInterval(() => {
      api<T>(path).then(setData).catch(() => {});
    }, opts.poll);
    return () => clearInterval(id);
  }, [opts.poll, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
