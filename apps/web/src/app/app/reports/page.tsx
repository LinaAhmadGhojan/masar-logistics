"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { cityName } from "@/components/fields";
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Tabs } from "@/components/ui";
import { qs, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { Col, downloadCSV } from "@/lib/csv";
import { addDays, isoDay, money, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { City, Sender } from "@/lib/types";

type Row = Record<string, unknown>;
type Report = { rows: Row[]; totals?: Record<string, number>; months?: Row[]; senders?: Row[] };
type Def = { id: string; roles?: string[]; path: string; cols: { key: string; label: string; fmt?: (v: unknown, r: Row) => string; end?: boolean }[]; filters: string[] };

export default function Reports() {
  const { t, lang, err } = useT();
  const { user } = useAuth();
  const { meta } = useMeta();
  const city = (c: unknown) => cityName(c as City | null, lang);
  const txt = (k: string) => (v: unknown) => (v ? t(`${k}.${v}`) : "—");
  const n2 = (v: unknown) => (v == null || v === "" ? "—" : money(Number(v), lang));
  const n0 = (v: unknown) => (v == null || v === "" ? "—" : num(Number(v), lang, 1));
  const pct = (v: unknown) => (v == null ? "—" : `${num(Number(v), lang, 1)}%`);

  const DEFS: Def[] = [
    { id: "waybill-list", path: "/reports/waybill-list", filters: ["date", "sender", "driver", "from", "to"], cols: [
      { key: "date", label: t("common.date") }, { key: "invoice", label: t("wb.invoice") }, { key: "order_no", label: t("wb.orderNo") }, { key: "to_name", label: t("wb.consignee") },
      { key: "from_city", label: t("wb.fromCity"), fmt: city }, { key: "delivery_note", label: t("wb.deliveryNote") }, { key: "number", label: t("wb.number") }, { key: "vehicle_no", label: t("wb.vehicle") },
      { key: "driver", label: t("wb.driver") }, { key: "sender", label: t("rep.pickup") }, { key: "to_city", label: t("wb.toCity"), fmt: city }, { key: "to_gps", label: t("wb.gps") },
      { key: "distance_km", label: t("wb.distance"), fmt: n0, end: true }, { key: "pallets", label: t("rep.pallets"), end: true }, { key: "material", label: t("wb.material"), fmt: txt("opt.material") },
      { key: "total_qty", label: t("wb.qty"), fmt: n0, end: true }, { key: "est_weight", label: t("wb.estWeight"), fmt: n0, end: true },
      { key: "amount_with_vat", label: t("rep.withVat"), fmt: n2, end: true }, { key: "amount_without_vat", label: t("rep.withoutVat"), fmt: n2, end: true },
    ] },
    { id: "shipment-status", path: "/reports/shipment-status", filters: ["date", "status", "dstatus"], cols: [
      { key: "number", label: t("wb.number") }, { key: "date", label: t("common.date") }, { key: "sender", label: t("rep.fromClient") }, { key: "user", label: t("rep.user") },
      { key: "to_name", label: t("wb.consignee") }, { key: "to_city", label: t("wb.toCity"), fmt: city }, { key: "service", label: t("rep.service") }, { key: "service_charge", label: t("wb.charge"), fmt: n2, end: true },
      { key: "status", label: t("common.status"), fmt: txt("opt.status") }, { key: "delivery_status", label: t("rep.deliveryStatus"), fmt: txt("opt.dstatus") }, { key: "driver", label: t("wb.driver") }, { key: "delivered_at", label: t("wb.deliveredAt") },
    ] },
    { id: "drivers", roles: ["admin", "dispatcher", "finance"], path: "/reports/drivers", filters: ["date"], cols: [
      { key: "driver", label: t("wb.driver") }, { key: "assigned", label: t("rep.assigned"), end: true }, { key: "delivered", label: t("dash.delivered"), end: true }, { key: "failed", label: t("rep.failed"), end: true },
      { key: "late", label: t("wb.late"), end: true }, { key: "on_time_rate", label: t("dash.onTime"), fmt: pct, end: true }, { key: "avg_hours", label: t("rep.avgHours"), fmt: n0, end: true },
      { key: "km", label: t("wb.distance"), fmt: n0, end: true }, { key: "cod", label: "COD", fmt: n2, end: true },
    ] },
    { id: "revenue", roles: ["admin", "finance"], path: "/reports/revenue", filters: [], cols: [
      { key: "month", label: t("rep.month") }, { key: "count", label: t("rep.invoices"), end: true }, { key: "subtotal", label: t("common.subtotal"), fmt: n2, end: true },
      { key: "vat", label: t("wb.vat"), fmt: n2, end: true }, { key: "total", label: t("common.total"), fmt: n2, end: true }, { key: "paid", label: t("inv.paid"), fmt: n2, end: true },
    ] },
    { id: "receivables", roles: ["admin", "finance"], path: "/reports/receivables", filters: [], cols: [
      { key: "sender", label: t("wb.sender") }, { key: "current", label: t("rep.current"), fmt: n2, end: true }, { key: "d1_30", label: "1–30", fmt: n2, end: true }, { key: "d31_60", label: "31–60", fmt: n2, end: true },
      { key: "d61_90", label: "61–90", fmt: n2, end: true }, { key: "d90", label: "90+", fmt: n2, end: true }, { key: "total", label: t("common.total"), fmt: n2, end: true },
    ] },
  ];
  const defs = DEFS.filter((d) => !d.roles || d.roles.includes(user?.role ?? ""));
  const [tab, setTab] = useState("waybill-list");
  const def = defs.find((d) => d.id === tab) ?? defs[0];
  const [f, setF] = useState({ date_from: addDays(isoDay(), -30), date_to: isoDay(), sender_id: "", driver_id: "", from_city_id: "", to_city_id: "", status: "", delivery_status: "" });
  const senders = useFetch<Sender[]>(user?.role !== "client" && ["admin", "dispatcher", "finance"].includes(user?.role ?? "") ? "/senders" : null);
  const drivers = useFetch<{ id: number; name: string }[]>(["admin", "dispatcher", "finance"].includes(user?.role ?? "") ? "/drivers" : null);
  const { data, error, loading, reload } = useFetch<Report>(`${def.path}${qs(def.filters.length ? f : {})}`);

  const rows = (def.id === "revenue" ? data?.months : data?.rows) ?? [];
  const cols: Col<Row>[] = def.cols.map((c) => ({ key: c.key, label: c.label, value: (r) => (c.fmt ? c.fmt(r[c.key], r) : (r[c.key] as string | number | null | undefined)) }));
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <>
      <PageHeader title={t("nav.reports")} sub={t("rep.sub")} actions={<Button icon={<Download size={16} />} onClick={() => downloadCSV(`report-${def.id}`, rows, cols)} disabled={!rows.length}>{t("common.export")}</Button>} />
      <Card>
        <div className="p-3"><Tabs value={def.id} onChange={setTab} tabs={defs.map((d) => ({ value: d.id, label: t(`rep.${d.id}`) }))} /></div>
        {def.filters.length > 0 && (
          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-6">
            {def.filters.includes("date") && <><Field label={t("common.from")}><Input type="date" value={f.date_from} onChange={(e) => set("date_from", e.target.value)} /></Field><Field label={t("common.to")}><Input type="date" value={f.date_to} onChange={(e) => set("date_to", e.target.value)} /></Field></>}
            {def.filters.includes("sender") && senders.data && <Field label={t("wb.sender")}><Select value={f.sender_id} onChange={(e) => set("sender_id", e.target.value)}><option value="">{t("common.all")}</option>{senders.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
            {def.filters.includes("driver") && drivers.data && <Field label={t("wb.driver")}><Select value={f.driver_id} onChange={(e) => set("driver_id", e.target.value)}><option value="">{t("common.all")}</option>{drivers.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>}
            {def.filters.includes("from") && <Field label={t("wb.fromCity")}><Select value={f.from_city_id} onChange={(e) => set("from_city_id", e.target.value)}><option value="">{t("common.all")}</option>{meta?.cities.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.ar : c.en}</option>)}</Select></Field>}
            {def.filters.includes("to") && <Field label={t("wb.toCity")}><Select value={f.to_city_id} onChange={(e) => set("to_city_id", e.target.value)}><option value="">{t("common.all")}</option>{meta?.cities.map((c) => <option key={c.id} value={c.id}>{lang === "ar" ? c.ar : c.en}</option>)}</Select></Field>}
            {def.filters.includes("status") && <Field label={t("common.status")}><Select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="">{t("common.all")}</option>{["new", "post", "delivered", "verified", "invoiced", "cancelled"].map((s) => <option key={s} value={s}>{t(`opt.status.${s}`)}</option>)}</Select></Field>}
            {def.filters.includes("dstatus") && <Field label={t("rep.deliveryStatus")}><Select value={f.delivery_status} onChange={(e) => set("delivery_status", e.target.value)}><option value="">{t("common.all")}</option>{[0, 1, 2, 3].map((s) => <option key={s} value={s}>{t(`opt.dstatus.${s}`)}</option>)}</Select></Field>}
          </div>
        )}
        {data?.totals && (
          <div className="grid grid-cols-2 gap-3 px-3 pb-3 lg:grid-cols-4">
            {Object.entries(data.totals).slice(0, 4).map(([k, v]) => <Stat key={k} label={t(`rep.tot.${k}`)} value={num(v, lang, 2).replace(/\.00$/, "")} />)}
          </div>
        )}
        {error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : loading && !data ? <Loading /> : (
          <div className="max-h-[62vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="border-y border-line text-xs font-bold text-muted">{def.cols.map((c) => <th key={c.key} className={`px-3 py-2.5 whitespace-nowrap ${c.end ? "text-end" : "text-start"}`}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line/60 hover:bg-card2">
                    {def.cols.map((c) => <td key={c.key} className={`px-3 py-2 whitespace-nowrap ${c.end ? "num text-end" : ""}`}>{(c.fmt ? c.fmt(r[c.key], r) : (r[c.key] as string)) || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="py-14 text-center text-sm text-muted">{t("common.empty")}</p>}
          </div>
        )}
      </Card>
    </>
  );
}
