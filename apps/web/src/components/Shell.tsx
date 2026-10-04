"use client";

import {
  Banknote, Bell, Calculator, ClipboardList, FileText, Gauge, Languages, LogOut, Map as MapIcon, Menu, Moon, PackagePlus, Radar,
  ScrollText, Settings, Sun, Truck, UserCog, Users, Warehouse, Wallet, BarChart3, ListChecks, Route, X, Contact,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Notice } from "@/lib/types";
import { Logo } from "./Logo";
import { Badge, Button, cx, Loading } from "./ui";

type Item = { href: string; label: string; icon: React.ReactNode; perm: string[] };
type Group = { title: string; items: Item[] };

const GROUPS: Group[] = [
  { title: "nav.sec.overview", items: [
    { href: "/app", label: "nav.dashboard", icon: <Gauge size={18} />, perm: ["dashboard"] },
    { href: "/app/tracking", label: "nav.tracking", icon: <MapIcon size={18} />, perm: ["tracking"] },
  ] },
  { title: "nav.sec.ops", items: [
    { href: "/app/jobs", label: "nav.jobs", icon: <ListChecks size={18} />, perm: ["jobs"] },
    { href: "/app/waybills", label: "nav.waybills", icon: <ClipboardList size={18} />, perm: ["waybills.read"] },
    { href: "/app/dispatch", label: "nav.dispatch", icon: <Radar size={18} />, perm: ["dispatch"] },
    { href: "/app/delivery", label: "nav.delivery", icon: <Route size={18} />, perm: ["delivery"] },
  ] },
  { title: "nav.sec.finance", items: [
    { href: "/app/billing", label: "nav.billing", icon: <Calculator size={18} />, perm: ["billing"] },
    { href: "/app/invoices", label: "nav.invoices", icon: <FileText size={18} />, perm: ["invoices.read"] },
    { href: "/app/cod", label: "nav.cod", icon: <Banknote size={18} />, perm: ["cod"] },
  ] },
  { title: "nav.sec.master", items: [
    { href: "/app/senders", label: "nav.senders", icon: <Warehouse size={18} />, perm: ["senders.read"] },
    { href: "/app/consignees", label: "nav.consignees", icon: <Contact size={18} />, perm: ["consignees.read"] },
    { href: "/app/drivers", label: "nav.drivers", icon: <Users size={18} />, perm: ["drivers.read"] },
    { href: "/app/vehicles", label: "nav.vehicles", icon: <Truck size={18} />, perm: ["vehicles.read"] },
    { href: "/app/tariffs", label: "nav.tariffs", icon: <Wallet size={18} />, perm: ["tariffs.read"] },
  ] },
  { title: "nav.sec.insight", items: [{ href: "/app/reports", label: "nav.reports", icon: <BarChart3 size={18} />, perm: ["reports"] }] },
  { title: "nav.sec.admin", items: [
    { href: "/app/users", label: "nav.users", icon: <UserCog size={18} />, perm: ["users"] },
    { href: "/app/settings", label: "nav.settings", icon: <Settings size={18} />, perm: ["settings"] },
    { href: "/app/audit", label: "nav.audit", icon: <ScrollText size={18} />, perm: ["audit"] },
  ] },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, ready, logout, can } = useAuth();
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const path = usePathname().replace(/\/$/, "") || "/app";
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const notes = useFetch<{ unseen: number; items: Notice[] }>(user ? "/notifications?limit=1" : null, { poll: 30000 });

  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  useEffect(() => { if (ready && !user) router.replace("/login"); }, [ready, user, router]);
  useEffect(() => setOpen(false), [path]);

  if (!ready || !user) return <Loading />;

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(...i.perm)) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  const active = (href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/") || (href === "/app/waybills" && path.startsWith("/app/waybill")) || (href === "/app/senders" && path.startsWith("/app/sender")) || (href === "/app/drivers" && path.startsWith("/app/driver")) || (href === "/app/invoices" && path.startsWith("/app/invoice")) || (href === "/app/jobs" && path.startsWith("/app/job")));
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("masar-theme", next); } catch {}
    setDark(!dark);
  };
  const unseen = notes.data?.unseen ?? 0;

  const nav = (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.title} className="mt-4 first:mt-0">
          <div className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-muted/80 uppercase">{t(g.title)}</div>
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition", active(i.href) ? "bg-brandsoft text-brand shadow-[inset_3px_0_0_var(--brand)] rtl:shadow-[inset_-3px_0_0_var(--brand)]" : "text-muted hover:bg-card2 hover:text-text")}>
              {i.icon}
              {t(i.label)}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const mobileTabs = flat.slice(0, user.role === "driver" ? 3 : 4);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-e border-line bg-card lg:flex">
        <div className="p-5"><Logo /></div>
        {nav}
        <Link href="/app/profile" className="block border-t border-line p-4 text-xs text-muted hover:bg-card2">
          <div className="truncate font-bold text-text">{user.full_name}</div>
          <div>{t(`role.${user.role}`)}{user.sender_name ? ` · ${user.sender_name}` : ""}</div>
        </Link>
      </aside>

      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="anim-up absolute inset-y-0 start-0 flex w-72 flex-col bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5"><Logo /><button onClick={() => setOpen(false)} className="text-muted"><X size={20} /></button></div>
            {nav}
          </aside>
        </div>
      )}

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-card/90 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-2">
            <button className="grid size-9 place-items-center rounded-lg hover:bg-card2 lg:hidden" onClick={() => setOpen(true)} aria-label="menu"><Menu size={20} /></button>
            <span className="lg:hidden"><Logo size={28} /></span>
          </div>
          <div className="flex items-center gap-1">
            {can("waybills.write") && <Link href="/app/waybill-form" className="hidden sm:block"><Button variant="primary" size="sm" icon={<PackagePlus size={16} />}>{t("nav.newWaybill")}</Button></Link>}
            <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label={t("common.language")}><Languages size={17} /><span className="hidden sm:inline">{lang === "ar" ? "EN" : "ع"}</span></Button>
            <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label={t("common.theme")}>{dark ? <Sun size={17} /> : <Moon size={17} />}</Button>
            <Link href="/app/notifications" className="relative grid size-9 place-items-center rounded-lg text-muted hover:bg-card2" aria-label={t("nav.notifications")}>
              <Bell size={18} />
              {unseen > 0 && <span className="num absolute top-1 end-1 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unseen}</span>}
            </Link>
            <Button variant="ghost" size="sm" onClick={() => { logout(); router.replace("/login"); }} aria-label={t("nav.logout")}><LogOut size={17} /></Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>

      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-card lg:hidden" style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, 1fr)` }}>
        {mobileTabs.map((i) => (
          <Link key={i.href} href={i.href} className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", active(i.href) ? "text-brand" : "text-muted")}>
            {i.icon}
            <span className="max-w-full truncate px-1">{t(i.label)}</span>
          </Link>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold text-muted"><Menu size={18} />{t("common.more")}</button>
      </nav>
    </div>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const { t } = useT();
  return <Badge tone="brand">{t(`role.${role}`)}</Badge>;
}
