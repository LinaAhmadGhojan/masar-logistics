"use client";

import { BadgeCheck, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import { Badge, Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { date, money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import type { Tariff, Waybill } from "@/lib/types";

type Row = { tariff_id: string; distance_km: string };

export default function Billing() {
  const { t, lang, err } = useT();
  const { can } = useAuth();
  const { meta } = useMeta();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"unverified" | "ready">("unverified");
  const un = useFetch<Waybill[]>("/billing/unverified");
  const rd = useFetch<Waybill[]>("/billing/ready");
  const tariffs = useFetch<Tariff[]>("/tariffs?active=true");
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const cur = meta?.company.currency ?? "";

  useEffect(() => {
    if (!un.data) return;
    setRows(Object.fromEntries(un.data.map((w) => [w.id, { tariff_id: w.suggested_tariff_id ? String(w.suggested_tariff_id) : "", distance_km: String(w.distance_km || "") }])));
    setSel(new Set());
  }, [un.data]);
  useEffect(() => setSel(new Set()), [tab]);

  const list = tab === "unverified" ? un.data : rd.data;
  const upd = (id: number, p: Partial<Row>) => { setRows((r) => ({ ...r, [id]: { ...r[id], ...p } })); setSel((s) => new Set(s).add(id)); };

  const verify = async () => {
    const body = { rows: [...sel].map((id) => ({ id, tariff_id: Number(rows[id].tariff_id), distance_km: rows[id].distance_km === "" ? null : Number(rows[id].distance_km) })) };
    if (body.rows.some((r) => !r.tariff_id)) return toast(t("bill.pickTariff"), "bad");
    setBusy(true);
    try {
      await api("/billing/verify", { method: "POST", body });
      toast(t("bill.verified", { n: body.rows.length }));
      un.reload(); rd.reload();
    } catch (e) { toast(err(e), "bad"); } finally { setBusy(false); }
  };
  const invoice = async (issue: boolean) => {
    setBusy(true);
    try {
      const r = await api<{ id: number }[]>("/invoices", { method: "POST", body: { waybill_ids: [...sel], issue } });
      toast(t("bill.invoiced", { n: r.length }));
      router.push(r.length === 1 ? `/app/invoice?id=${r[0].id}` : "/app/invoices");
    } catch (e) { toast(err(e), "bad"); setBusy(false); }
  };

  const preview = (w: Waybill) => {
    const tf = tariffs.data?.find((x) => String(x.id) === rows[w.id]?.tariff_id);
    if (!tf) return "—";
    const pallets = w.packages.filter((p) => p.type === "pallet").reduce((a, p) => a + p.qty, 0);
    const km = Number(rows[w.id]?.distance_km) || 0;
    const c = Math.max(tf.base + tf.per_km * km + tf.per_pallet * pallets + tf.per_kg * w.weight, tf.min_charge);
    return money(c, lang);
  };

  return (
    <>
      <PageHeader title={t("nav.billing")} sub={t("bill.sub")} actions={tab === "unverified"
        ? <Button variant="primary" icon={<BadgeCheck size={16} />} loading={busy} disabled={!sel.size} onClick={verify}>{t("bill.verify", { n: sel.size })}</Button>
        : can("invoices.write") && <><Button icon={<FilePlus2 size={16} />} loading={busy} disabled={!sel.size} onClick={() => invoice(false)}>{t("bill.draft", { n: sel.size })}</Button><Button variant="primary" icon={<FilePlus2 size={16} />} loading={busy} disabled={!sel.size} onClick={() => invoice(true)}>{t("bill.issue", { n: sel.size })}</Button></>} />
      <Card>
        <div className="p-3"><Tabs value={tab} onChange={setTab} tabs={[{ value: "unverified", label: t("bill.tabUnverified"), count: un.data?.length }, { value: "ready", label: t("bill.tabReady"), count: rd.data?.length }]} /></div>
        {(un.error || rd.error) ? <div className="p-3"><ErrorBox message={err(un.error ?? rd.error)} /></div> : !list ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead><tr className="border-y border-line text-xs font-bold text-muted">
                <th className="w-10 px-3 py-2.5"><Checkbox checked={!!list.length && sel.size === list.length} onChange={(v) => setSel(v ? new Set(list.map((w) => w.id)) : new Set())} /></th>
                {["wb.number", "common.date", "wb.sender", "wb.consignee", "wb.route", "wb.distance"].map((k) => <th key={k} className="px-2 py-2.5 text-start">{t(k)}</th>)}
                {tab === "unverified" ? <><th className="px-2 text-start">{t("bill.tariff")}</th><th className="px-2 text-start">{t("bill.price")} ({cur})</th></> : <><th className="px-2 text-start">{t("wb.charge")}</th><th className="px-2 text-start">{t("wb.total")}</th></>}
              </tr></thead>
              <tbody>
                {list.map((w) => (
                  <tr key={w.id} className={`border-b border-line/70 ${sel.has(w.id) ? "bg-brandsoft/50" : ""}`}>
                    <td className="px-3"><Checkbox checked={sel.has(w.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(w.id) : n.delete(w.id); return n; })} /></td>
                    <td className="px-2 py-2.5"><Link className="num font-bold hover:text-brand" href={`/app/waybill?id=${w.id}`}>{w.number}</Link></td>
                    <td className="num px-2 text-muted">{date(w.date, lang)}</td>
                    <td className="max-w-36 truncate px-2">{w.sender_name}</td>
                    <td className="max-w-40 truncate px-2 font-semibold">{w.to_name}</td>
                    <td className="px-2 whitespace-nowrap text-muted">{cityName(w.from_city, lang)} → {cityName(w.to_city, lang)}</td>
                    <td className="px-2">
                      {tab === "unverified" && rows[w.id] ? <Input type="number" step="0.1" className="num h-9 w-24 text-[13px]" value={rows[w.id].distance_km} onChange={(e) => upd(w.id, { distance_km: e.target.value })} /> : <span className="num">{w.distance_km}</span>}
                    </td>
                    {tab === "unverified" ? (
                      <>
                        <td className="px-2">{rows[w.id] && <Select className="h-9 min-w-48 text-[13px]" value={rows[w.id].tariff_id} onChange={(e) => upd(w.id, { tariff_id: e.target.value })}>
                          <option value="">—</option>
                          {tariffs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === w.suggested_tariff_id ? " ★" : ""}</option>)}
                        </Select>}</td>
                        <td className="num px-2 font-bold">{preview(w)}</td>
                      </>
                    ) : (
                      <><td className="num px-2">{money(w.service_charge, lang)}</td><td className="px-2"><Badge tone="violet"><span className="num">{money(w.total, lang)}</span></Badge></td></>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <p className="py-14 text-center text-sm text-muted">{t("common.empty")}</p>}
          </div>
        )}
      </Card>
    </>
  );
}
