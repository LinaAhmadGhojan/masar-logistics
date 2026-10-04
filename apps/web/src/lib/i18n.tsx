"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError } from "./api";
import { DICT } from "./dict";
import type { Lang } from "./format";

type Params = Record<string, string | number>;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, params?: Params) => string; has: (key: string) => boolean; dir: "rtl" | "ltr"; err: (e: unknown) => string };

const C = createContext<Ctx | null>(null);
const KEY = "masar-lang";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Lang | null;
      if (saved === "ar" || saved === "en") setLangState(saved);
      else if (navigator.language?.toLowerCase().startsWith("en")) setLangState("en");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {}
  }, []);

  const value = useMemo<Ctx>(() => {
    const t = (key: string, params?: Params) => {
      let s = DICT[lang][key] ?? DICT.en[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    };
    const err = (e: unknown) => {
      if (e instanceof ApiError) {
        const k = `err.${e.code}`;
        return DICT[lang][k] ?? DICT.en[k] ?? (e.code.length < 40 && !e.code.includes(" ") ? t("err.unknown") : e.code);
      }
      return t("err.unknown");
    };
    return { lang, setLang, t, err, has: (k) => k in DICT[lang], dir: lang === "ar" ? "rtl" : "ltr" };
  }, [lang, setLang]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useT() {
  const c = useContext(C);
  if (!c) throw new Error("useT outside LangProvider");
  return c;
}
