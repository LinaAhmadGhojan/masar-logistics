"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, storage } from "./api";
import type { Meta, Role, User } from "./types";

type Auth = {
  user: User | null;
  ready: boolean;
  login: (login: string, password: string) => Promise<User>;
  logout: () => void;
  can: (...perms: string[]) => boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cached = storage.user();
    setUser(cached);
    setReady(true);
    if (cached) {
      api<User>("/auth/me")
        .then((u) => (storage.saveUser(u), setUser(u)))
        .catch(() => {});
    }
  }, []);

  const login = useCallback(async (login: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { method: "POST", body: { login, password } });
    storage.save(r.token, r.user);
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(() => {
    storage.clear();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const u = await api<User>("/auth/me");
    storage.saveUser(u);
    setUser(u);
  }, []);

  const can = useCallback((...perms: string[]) => !!user && perms.some((p) => user.perms.includes(p)), [user]);

  return <Ctx.Provider value={{ user, ready, login, logout, can, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}

export const homeFor = (role: Role) => (role === "driver" ? "/app/jobs" : "/app");

// ---- reference data (cities, options, company rules) loaded once after login
const MetaCtx = createContext<{ meta: Meta | null; reload: () => void } | null>(null);

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!user) return setMeta(null);
    api<Meta>("/meta").then(setMeta).catch(() => {});
  }, [user?.id, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return <MetaCtx.Provider value={{ meta, reload: () => setTick((t) => t + 1) }}>{children}</MetaCtx.Provider>;
}

export function useMeta() {
  const c = useContext(MetaCtx);
  if (!c) throw new Error("useMeta outside MetaProvider");
  return c;
}
