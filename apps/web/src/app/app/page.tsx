"use client";

import { AlertTriangle, CheckCircle2, Clock, PackageCheck, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { ErrorBox, Loading, PageHeader, Progress, Section, Stat, StatusBadge, Card, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/api";
import { date, money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useMeta } from "@/lib/auth";
import type { Waybill } from "@/lib/types";

type Dash = {
  role: string;
  kpis: Record<string, number | null>;
  series: { date: string; created: number; delivered: number }[];
  by_status: Record<string, number>;
  top_senders: { id: number; name: string; count: number; revenue: number }[];
  recent: Waybill[];
  alerts?: { type: string; severity: string; count?: number; name?: string; days?: number; link: string }[];
  revenue_series?: { month: string; total: number }[];
  drivers?: { id: number; name: string; delivered: number; late: number; km: number }[];
  fleet?: { total: number; available: number; on_trip: number; maintenance: number; drivers_online: number };
};

export default function Dashboard() {
  const { t, lang, err } = useT();
  const { user } = useAuth();
  const { meta } = useMeta();
  const { data, error, loading, reload } = useFetch<Dash>("/dashboard", { poll: 30000 });
  const cur = meta?.company.currency ?? "";

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;
  const k = data.kpis;
  const max = Math.max(1, ...data.series.map((s) => Math.max(s.created, s.delivered)));

  return (
    <>
      <PageHeader title={t("dash.hello", { name: user?.full_name ?? "" })} sub={t("dash.sub")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("dash.total30")} value={num(k.total_30d, lang)} icon={<PackageCheck size={20} />} tone="brand" href="/app/waybills" />
        <Stat label={t("dash.inTransit")} value={num(k.in_transit, lang)} icon={<Truck size={20} />} tone="info" href="/app/tracking" />
        <Stat label={t("dash.deliveredToday")} value={num(k.delivered_today, lang)} icon={<CheckCircle2 size={20} />} tone="ok" />
        <Stat label={t("dash.delayed")} value={num(k.delayed, lang)} icon={<AlertTriangle size={20} />} tone={k.delayed ? "bad" : "default"} href="/app/waybills?delayed=1" />
        <Stat label={t("dash.onTime")} value={k.on_time_rate == null ? "—" : `${num(k.on_time_rate, lang, 1)}%`} icon={<Clock size={20} />} tone="ok" />
        {user?.role !== "client" ? <Stat label={t("dash.unassigned")} value={num(k.unassigned, lang)} icon={<Truck size={20} />} tone="warn" href="/app/dispatch" /> : <Stat label={t("dash.active")} value={num(k.active, lang)} icon={<Truck size={20} />} tone="info" />}
        {k.revenue_30d != null && <Stat label={t("dash.revenue30")} value={`${money(k.revenue_30d, lang)}`} sub={cur} icon={<Wallet size={20} />} tone="brand" />}
        {k.receivables != null && <Stat label={t("dash.receivables")} value={`${money(k.receivables, lang)}`} sub={`${t("dash.overdue")}: ${money(k.overdue_amount, lang)}`} icon={<Wallet size={20} />} tone="warn" href="/app/invoices" />}
      </div>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
        <Section title={t("dash.last14")} className="lg:col-span-2">
          <div className="flex h-44 items-end gap-1.5" dir="ltr">
            {data.series.map((s) => (
              <div key={s.date} className="flex flex-1 flex-col items-center gap-1" title={`${date(s.date, lang)} · ${s.created}/${s.delivered}`}>
                <div className="flex h-36 w-full items-end gap-0.5">
                  <div className="flex-1 rounded-t bg-brand/80" style={{ height: `${(s.created / max) * 100}%` }} />
                  <div className="flex-1 rounded-t bg-ok/80" style={{ height: `${(s.delivered / max) * 100}%` }} />
                </div>
                <span className="num text-[10px] text-muted">{s.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-brand/80" />{t("dash.created")}</span>
            <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-ok/80" />{t("dash.delivered")}</span>
          </div>
        </Section>

        <Section title={t("dash.alerts")}>
          {!data.alerts?.length && <p className="text-sm text-muted">{t("dash.noAlerts")}</p>}
          <div className="grid gap-2">
            {data.alerts?.slice(0, 6).map((a, i) => (
              <Link key={i} href={a.link} className="flex items-center justify-between gap-2 rounded-lg border border-line p-3 text-sm hover:border-brand">
                <span>{t(`dash.alert.${a.type}`, { n: a.count ?? 0, name: a.name ?? "", days: a.days ?? 0 })}</span>
                <Badge tone={a.severity === "high" ? "bad" : a.severity === "mid" ? "warn" : "info"}>{a.severity === "high" ? "!" : "•"}</Badge>
              </Link>
            ))}
          </div>
        </Section>
      </div>


      {data.revenue_series && (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-3">
          <Section title={t("dash.revenue6")} className="lg:col-span-1">
            <div className="flex h-40 items-end gap-2" dir="ltr">
              {(() => {
                const mx = Math.max(1, ...data.revenue_series!.map((r) => r.total));
                return data.revenue_series!.map((r) => (
                  <div key={r.month} className="flex flex-1 flex-col items-center gap-1" title={`${r.month} · ${money(r.total, lang)}`}>
                    <span className="num text-[10px] text-muted">{r.total ? num(r.total / 1000, lang, 0) + "k" : ""}</span>
                    <div className="flex h-28 w-full items-end"><div className="w-full rounded-t bg-gradient-to-t from-[#12877f] to-[#35bf90]" style={{ height: `${(r.total / mx) * 100}%` }} /></div>
                    <span className="num text-[10px] text-muted">{r.month.slice(5)}</span>
                  </div>
                ));
              })()}
            </div>
          </Section>
          <Section title={t("dash.topClients")}>
            <div className="grid gap-3">
              {data.top_senders.map((x) => (
                <div key={x.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="truncate font-semibold">{x.name}</span><span className="num text-muted">{x.count}</span></div>
                  <Progress value={(x.count / Math.max(1, data.top_senders[0].count)) * 100} />
                </div>
              ))}
            </div>
          </Section>
          <div className="grid gap-5">
            {data.fleet && (
              <Section title={t("dash.fleet")}>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-oksoft p-2.5"><div className="num text-xl font-extrabold text-ok">{data.fleet.available}</div><div className="text-[11px] text-muted">{t("opt.vstatus.available")}</div></div>
                  <div className="rounded-xl bg-brandsoft p-2.5"><div className="num text-xl font-extrabold text-brand">{data.fleet.on_trip}</div><div className="text-[11px] text-muted">{t("opt.vstatus.on_trip")}</div></div>
                  <div className="rounded-xl bg-warnsoft p-2.5"><div className="num text-xl font-extrabold text-warn">{data.fleet.maintenance}</div><div className="text-[11px] text-muted">{t("opt.vstatus.maintenance")}</div></div>
                </div>
                <p className="mt-3 text-xs text-muted">{t("dash.driversOnline", { n: data.fleet.drivers_online })}</p>
              </Section>
            )}
            {!!data.drivers?.length && (
              <Section title={t("dash.topDrivers")}>
                <ul className="divide-y divide-line text-sm">
                  {data.drivers.map((d, i) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span className="flex items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-brandsoft text-xs font-bold text-brand">{i + 1}</span>{d.name}</span><span className="num text-muted">{d.delivered} · {num(d.km, lang)} km</span></li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        </div>
      )}

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h3 className="font-bold">{t("dash.recent")}</h3>
          <Link href="/app/waybills" className="text-sm font-semibold text-brand">{t("common.view")}</Link>
        </div>
        <div className="divide-y divide-line">
          {data.recent.map((w) => (
            <Link key={w.id} href={`/app/waybill?id=${w.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-card2">
              <div className="min-w-0">
                <div className="num font-bold">{w.number}</div>
                <div className="truncate text-sm text-muted">{w.sender_name} → {w.to_name}</div>
              </div>
              <StatusBadge status={w.status} />
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
