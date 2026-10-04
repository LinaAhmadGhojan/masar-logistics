"use client";

import { Clock, Flame, GripVertical, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cityName } from "@/components/fields";
import { Badge, Card, ErrorBox, Loading, PageHeader, Select, StageBadge, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { km, num, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, Waybill } from "@/lib/types";

type Board = { columns: Record<"unassigned" | "assigned" | "in_progress" | "delivered", Waybill[]>; drivers: Driver[] };
const COLS = ["unassigned", "assigned", "in_progress", "delivered"] as const;
const TONE = { unassigned: "border-t-warn", assigned: "border-t-info", in_progress: "border-t-brand", delivered: "border-t-ok" };

export default function Dispatch() {
  const { t, lang, err } = useT();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Board>("/dispatch/board", { poll: 15000 });
  const [drag, setDrag] = useState<Waybill | null>(null);
  const [over, setOver] = useState<number | null>(null);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;

  const linked = (d: Driver, w: Waybill) => !d.sender_ids.length || d.sender_ids.includes(w.sender_id);
  const assign = async (w: Waybill, driverId: number | null) => {
    try {
      await api(`/waybills/${w.id}/assign`, { method: "POST", body: { driver_id: driverId } });
      toast(t("common.saved"));
      reload();
    } catch (e) {
      toast(err(e), "bad");
    }
  };

  const Card1 = ({ w, col }: { w: Waybill; col: (typeof COLS)[number] }) => (
    <div draggable={col === "unassigned" || col === "assigned"} onDragStart={() => setDrag(w)} onDragEnd={() => { setDrag(null); setOver(null); }}
      className="rounded-xl border border-line bg-card p-3 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/app/waybill?id=${w.id}`} className="num font-bold hover:text-brand">{w.number}</Link>
        <div className="flex items-center gap-1">
          {w.priority === "urgent" && <Flame size={14} className="text-brand" />}
          {(col === "unassigned" || col === "assigned") && <GripVertical size={14} className="hidden text-muted lg:block" />}
        </div>
      </div>
      <div className="mt-1 truncate text-sm font-semibold">{w.to_name}</div>
      <div className="truncate text-xs text-muted">{cityName(w.from_city, lang)} → {cityName(w.to_city, lang)} · {km(w.distance_km, lang)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge tone="gray">{w.sender_name}</Badge>
        <Badge tone="info">{num(w.qty, lang)} · {num(w.weight, lang)} {t("common.kg")}</Badge>
        {w.delayed ? <Badge tone="bad"><Clock size={11} />{t("wb.delayed")}</Badge> : w.promised_at && col !== "delivered" && <Badge tone="gray"><Clock size={11} />{relative(w.promised_at, lang)}</Badge>}
        {col === "in_progress" && <StageBadge stage={w.stage} />}
      </div>
      {(col === "unassigned" || col === "assigned") && (
        <Select className="mt-2 h-9 text-[13px]" value={w.driver_id ?? ""} onChange={(e) => assign(w, e.target.value ? Number(e.target.value) : null)} aria-label={t("wb.driver")}>
          <option value="">{t("wb.noDriver")}</option>
          {data.drivers.filter((d) => linked(d, w) && d.status).map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_no ? ` · ${d.vehicle_no}` : ""} ({d.active})</option>)}
        </Select>
      )}
      {(col === "in_progress" || col === "delivered") && w.driver_name && <div className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Truck size={13} />{w.driver_name} · {w.vehicle_no}</div>}
    </div>
  );

  return (
    <>
      <PageHeader title={t("nav.dispatch")} sub={t("disp.sub")} />
      <div className="grid items-start gap-4 xl:grid-cols-[1fr_280px]">
        <div className="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-4">
          {COLS.map((c) => (
            <div key={c} className={`rounded-xl border border-t-4 border-line bg-card2 p-2.5 ${TONE[c]}`}>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <h3 className="text-sm font-bold">{t(`disp.col.${c}`)}</h3>
                <span className="num rounded-full bg-card px-2 text-xs font-bold text-muted">{data.columns[c].length}</span>
              </div>
              <div className="grid max-h-[68vh] gap-2.5 overflow-y-auto pe-0.5">
                {data.columns[c].map((w) => <Card1 key={w.id} w={w} col={c} />)}
                {!data.columns[c].length && <p className="py-6 text-center text-xs text-muted">{t("common.empty")}</p>}
              </div>
            </div>
          ))}
        </div>

        <Card className="p-3 xl:sticky xl:top-20">
          <h3 className="mb-1 px-1 text-sm font-bold">{t("nav.drivers")}</h3>
          <p className="mb-3 px-1 text-xs text-muted">{t("disp.dropHint")}</p>
          <div className="grid gap-1.5">
            {data.drivers.filter((d) => d.status).map((d) => {
              const ok = !drag || linked(d, drag);
              return (
                <div key={d.id}
                  onDragOver={(e) => { if (drag && ok) { e.preventDefault(); setOver(d.id); } }}
                  onDragLeave={() => setOver(null)}
                  onDrop={() => { if (drag && ok) assign(drag, d.id); setDrag(null); setOver(null); }}
                  className={`flex items-center gap-2.5 rounded-lg border p-2 text-sm transition ${over === d.id ? "border-brand bg-brandsoft" : "border-line"} ${drag && !ok ? "opacity-35" : ""}`}>
                  <span className={`size-2.5 shrink-0 rounded-full ${d.online ? "bg-ok" : "bg-line"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{d.name}</div>
                    <div className="num truncate text-xs text-muted">{d.vehicle_no}</div>
                  </div>
                  <Badge tone={d.active ? "brand" : "gray"}>{d.active}</Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
