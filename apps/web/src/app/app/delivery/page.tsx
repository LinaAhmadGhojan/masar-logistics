"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import { Button, Card, Checkbox, ErrorBox, Input, Loading, PageHeader, Select, Tabs, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { date } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, Waybill } from "@/lib/types";

type Row = { delivery_status: number; to_gps: string; distance_km: string; received_by: string; receiver_id: string; driver_id: string };

export default function Delivery() {
  const { t, lang, err } = useT();
  const toast = useToast();
  const [tab, setTab] = useState("0");
  const { data, error, loading, reload } = useFetch<Waybill[]>(`/delivery?delivery_status=${tab}`);
  const drivers = useFetch<Driver[]>("/drivers");
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setSel(new Set());
    setRows(Object.fromEntries(data.map((w) => [w.id, { delivery_status: w.delivery_status, to_gps: w.to_gps ?? "", distance_km: String(w.distance_km || ""), received_by: w.received_by ?? "", receiver_id: w.receiver_id ?? "", driver_id: w.driver_id ? String(w.driver_id) : "" }])));
  }, [data]);

  const patch = (id: number, p: Partial<Row>) => {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));
    setSel((s) => new Set(s).add(id));
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = { rows: [...sel].map((id) => {
        const r = rows[id];
        return { id, delivery_status: r.delivery_status, to_gps: r.to_gps || null, distance_km: r.distance_km === "" ? null : Number(r.distance_km), received_by: r.received_by || null, receiver_id: r.receiver_id || null, driver_id: r.driver_id ? Number(r.driver_id) : null };
      }) };
      const res = await api<{ updated: number }>("/delivery/update", { method: "POST", body });
      toast(t("deliv.updated", { n: res.updated }));
      reload();
    } catch (e) {
      toast(err(e), "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title={t("nav.delivery")} sub={t("deliv.sub")} actions={<Button variant="primary" icon={<Save size={16} />} loading={busy} disabled={!sel.size} onClick={save}>{t("deliv.save", { n: sel.size })}</Button>} />
      <Card>
        <div className="p-3"><Tabs value={tab} onChange={setTab} tabs={["0", "1", "2", "3"].map((s) => ({ value: s, label: t(`opt.dstatus.${s}`) }))} /></div>
        {error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : loading && !data ? <Loading /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead><tr className="border-y border-line text-xs font-bold text-muted">
                <th className="w-10 px-3 py-2.5"><Checkbox checked={!!data?.length && sel.size === data.length} onChange={(v) => setSel(v ? new Set((data ?? []).map((w) => w.id)) : new Set())} /></th>
                {["wb.number", "common.date", "wb.sender", "wb.consignee", "wb.toCity", "wb.driver", "wb.gps", "wb.distance", "common.status", "wb.receivedBy"].map((k) => <th key={k} className="px-2 py-2.5 text-start">{t(k)}</th>)}
              </tr></thead>
              <tbody>
                {data?.map((w) => {
                  const r = rows[w.id];
                  if (!r) return null;
                  return (
                    <tr key={w.id} className={`border-b border-line/70 ${sel.has(w.id) ? "bg-brandsoft/50" : ""}`}>
                      <td className="px-3"><Checkbox checked={sel.has(w.id)} onChange={(v) => setSel((s) => { const n = new Set(s); v ? n.add(w.id) : n.delete(w.id); return n; })} /></td>
                      <td className="px-2 py-2"><Link className="num font-bold hover:text-brand" href={`/app/waybill?id=${w.id}`}>{w.number}</Link></td>
                      <td className="num px-2 text-muted">{date(w.date, lang)}</td>
                      <td className="max-w-36 truncate px-2">{w.sender_name}</td>
                      <td className="max-w-40 truncate px-2 font-semibold">{w.to_name}</td>
                      <td className="px-2 whitespace-nowrap">{cityName(w.to_city, lang)}</td>
                      <td className="px-2"><Select className="h-9 min-w-36 text-[13px]" value={r.driver_id} onChange={(e) => patch(w.id, { driver_id: e.target.value })} disabled={w.stage === "delivered"}>
                        <option value="">—</option>
                        {drivers.data?.filter((d) => d.status && (!d.sender_ids.length || d.sender_ids.includes(w.sender_id))).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </Select></td>
                      <td className="px-2"><Input className="ltr h-9 w-44 text-[13px]" value={r.to_gps} placeholder="lat,lng" onChange={(e) => patch(w.id, { to_gps: e.target.value })} /></td>
                      <td className="px-2"><Input type="number" step="0.1" className="num h-9 w-24 text-[13px]" value={r.distance_km} onChange={(e) => patch(w.id, { distance_km: e.target.value })} /></td>
                      <td className="px-2"><Select className="h-9 min-w-32 text-[13px]" value={r.delivery_status} onChange={(e) => patch(w.id, { delivery_status: Number(e.target.value) })}>
                        {[0, 1, 2, 3].map((s) => <option key={s} value={s}>{t(`opt.dstatus.${s}`)}</option>)}
                      </Select></td>
                      <td className="px-2"><Input className="h-9 w-36 text-[13px]" value={r.received_by} onChange={(e) => patch(w.id, { received_by: e.target.value })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!data?.length && <p className="py-14 text-center text-sm text-muted">{t("common.empty")}</p>}
          </div>
        )}
      </Card>
    </>
  );
}
