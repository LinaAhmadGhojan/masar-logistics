"use client";

import { Briefcase, Calculator, Languages, Moon, Radar, Shield, Sun, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Button, Field, Input, useToast } from "@/components/ui";
import { ACCOUNTS } from "@/lib/accounts";
import { homeFor, useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Role } from "@/lib/types";

const ICON: Record<Role, React.ReactNode> = {
  admin: <Shield size={22} />,
  dispatcher: <Radar size={22} />,
  finance: <Calculator size={22} />,
  client: <Briefcase size={22} />,
  driver: <Truck size={22} />,
};

export default function Login() {
  const { t, err, lang, setLang } = useT();
  const { login, user, ready } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  const [form, setForm] = useState({ login: "", password: "" });
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  useEffect(() => {
    if (ready && user) router.replace(homeFor(user.role));
  }, [ready, user, router]);

  const go = async (l: string, p: string, key: string) => {
    setBusy(key);
    try {
      const u = await login(l, p);
      router.replace(homeFor(u.role));
    } catch (e) {
      toast(err(e), "bad");
      setBusy(null);
    }
  };

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("masar-theme", next);
    } catch {}
    setDark(!dark);
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brandsoft p-12 text-text lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-[0.35]" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #2aa57c 0, transparent 40%), repeating-linear-gradient(115deg, transparent 0 46px, rgba(255,255,255,.35) 46px 48px)" }} />
        <Logo />
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-extrabold">{t("login.hero")}</h1>
          <p className="mt-4 text-lg text-muted">{t("login.hero2")}</p>
        </div>
        <p className="relative text-sm text-muted">{t("common.copyright")}</p>
      </aside>

      <main className="flex flex-col p-5 sm:p-10">
        <div className="mb-6 flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={<Languages size={16} />} onClick={() => setLang(lang === "ar" ? "en" : "ar")}>
              {lang === "ar" ? "English" : "العربية"}
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={t("common.theme")}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </div>

        <div className="m-auto w-full max-w-lg">
          <h2 className="text-2xl font-extrabold">{t("login.title")}</h2>
          <p className="mt-1 mb-6 text-sm text-muted">{t("login.pick")}</p>

          <div className="grid gap-2.5">
            {ACCOUNTS.map((a) => (
              <button
                key={a.role}
                disabled={!!busy}
                onClick={() => go(a.login, a.password, a.role)}
                className="group flex items-center gap-4 rounded-xl border border-line bg-card p-4 text-start shadow-card transition hover:border-brand hover:shadow-md disabled:opacity-60"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brandsoft text-brand transition group-hover:bg-brand group-hover:text-white">{ICON[a.role]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{t(`role.${a.role}`)}</span>
                  <span className="block truncate text-sm text-muted">{t(`login.desc.${a.role}`)}</span>
                </span>
                <span className="num hidden text-xs text-muted sm:block">{busy === a.role ? "…" : a.login}</span>
              </button>
            ))}
          </div>

          <button className="mt-5 text-sm font-semibold text-muted hover:text-brand" onClick={() => setOther((v) => !v)}>
            {t("login.other")}
          </button>
          {other && (
            <form
              className="anim-up mt-3 grid gap-3 rounded-xl border border-line bg-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                go(form.login, form.password, "form");
              }}
            >
              <Field label={t("login.login")}>
                <Input autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} className="ltr" />
              </Field>
              <Field label={t("common.password")}>
                <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="ltr" />
              </Field>
              <Button type="submit" variant="primary" loading={busy === "form"} disabled={!form.login || !form.password}>
                {t("login.submit")}
              </Button>
            </form>
          )}

          <Link href="/track" className="mt-8 block rounded-xl border border-dashed border-line p-4 text-center text-sm font-semibold text-muted transition hover:border-brand hover:text-brand">
            {t("login.track")}
          </Link>
        </div>
      </main>
    </div>
  );
}
