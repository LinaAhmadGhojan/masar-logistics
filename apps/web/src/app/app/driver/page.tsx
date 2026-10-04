"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Map from "@/components/Map";
import { Badge, ErrorBox, KV, Loading, PageHeader, Section, Stat, StatusBadge } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { date, km, num, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, WaybillList } from "@/lib/types";

export default function DriverPage() {
  const { t, lang, err } = useT();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: d, error, loading } = useFetch<Driver>(id ? `/drivers/${id}` : null);
  const wbs = useFetch<WaybillList>(id ? `/waybills?driver_id=${id}&size=10` : null);
  if (loading && !d) return <Loading />;
  if (error || !d) return <ErrorBox message={error ? err(error) : ""} />;
  return (
    <>
      <PageHeader back="/app/drivers" title={d.name} sub={d.vehicle_no ?? undefined} actions={<Badge tone={d.online ? "ok" : "gray"} dot>{d.online ? t("common.online") : t("common.offline")}</Badge>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("drv.deliveries")} value={num(d.delivered, lang)} tone="ok" />
        <Stat label={t("drv.distance")} value={km(d.distance_km, lang)} tone="info" />
        <Stat label={t("drv.rating")} value={<span className="flex items-center gap-1"><Star size={18} className="fill-warn text-warn" />{d.rating}</span>} tone="warn" />
        <Stat label={t("drv.lastSeen")} value={<span className="text-base">{d.last_seen ? relative(d.last_seen, lang) : "—"}</span>} />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Section title={t("common.details")}>
          <dl className="grid grid-cols-2 gap-4">
            <KV label={t("common.mobile")}><span className="num">{d.mobile}</span></KV>
            <KV label={t("common.email")}><span className="ltr">{d.email}</span></KV>
            <KV label={t("drv.licenseNo")}><span className="num">{d.license_no}</span></KV>
            <KV label={t("drv.licenseExpiry")}><span className="num">{date(d.license_expiry, lang)}</span></KV>
            <KV label={t("drv.docId")}><span className="num">{d.doc_id}</span></KV>
          </dl>
          {d.last_lat != null && <div className="mt-4"><Map height={220} markers={[{ lat: d.last_lat, lng: d.last_lng!, kind: "truck", label: "🚚" }]} /></div>}
        </Section>
        <Section title={t("nav.waybills")}>
          <ul className="divide-y divide-line">
            {wbs.data?.items.map((w) => (
              <li key={w.id}><Link href={`/app/waybill?id=${w.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-card2">
                <div><div className="num font-bold">{w.number}</div><div className="text-xs text-muted">{date(w.date, lang)} · {w.to_name}</div></div>
                <StatusBadge status={w.status} />
              </Link></li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
