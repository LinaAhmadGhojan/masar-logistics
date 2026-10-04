"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cityName } from "@/components/fields";
import Map, { type MapMarker } from "@/components/Map";
import { Badge, Card, ErrorBox, Loading, PageHeader, StageBadge } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { gpsParts, km, minutesLabel, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, Waybill } from "@/lib/types";

type Live = { waybills: Waybill[]; drivers: Driver[]; at: string };

export default function Tracking() {
  const { t, lang, err } = useT();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch<Live>("/tracking/live", { poll: 8000 });
  const [focus, setFocus] = useState<number | null>(null);

  const markers = useMemo(() => {
    const out: MapMarker[] = [];
    for (const w of data?.waybills ?? []) {
      const p = w.driver_position;
      if (p) out.push({ lat: p.lat, lng: p.lng, kind: "truck", label: "🚚", color: focus === w.id ? "#d12c2c" : "#2aa57c", popup: `<b>${w.number}</b><br>${w.driver_name ?? ""}<br><a href="${"/app/waybill?id=" + w.id}">${t("common.open")}</a>` });
      const d = gpsParts(w.to_gps);
      if (d && (focus === w.id || !focus)) out.push({ lat: d[0], lng: d[1], kind: "dot", color: "#0b3d2e", popup: `${w.number} → ${w.to_name ?? ""}` });
    }
    for (const d of data?.drivers ?? []) {
      if (d.last_lat != null && !data?.waybills.some((w) => w.driver_id === d.id && w.driver_position)) out.push({ lat: d.last_lat, lng: d.last_lng!, kind: "dot", color: "#1d6fb8", popup: `${d.name} · ${t("common.online")}` });
    }
    return out;
  }, [data, focus, t]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;
  const fc = focus ? data.waybills.find((w) => w.id === focus)?.driver_position : null;

  return (
    <>
      <PageHeader title={t("nav.tracking")} sub={t("trk.sub", { n: data.waybills.length })} actions={<Badge tone="ok" dot>{t("trk.live")}</Badge>} />
      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden p-1.5">
          <Map height="calc(100dvh - 230px)" markers={markers} fitKey={`${focus}-${markers.length}`} />
          {fc && <div className="hidden" />}
        </Card>
        <div className="grid max-h-[calc(100dvh-230px)] gap-2.5 overflow-y-auto">
          {!data.waybills.length && <Card className="p-6 text-center text-sm text-muted">{t("trk.none")}</Card>}
          {data.waybills.map((w) => (
            <Card key={w.id} className={`p-3 transition ${focus === w.id ? "border-brand" : ""}`}>
              <button className="w-full text-start" onClick={() => setFocus(focus === w.id ? null : w.id)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="num font-bold">{w.number}</span>
                  <StageBadge stage={w.stage} />
                </div>
                <div className="mt-1 truncate text-sm font-semibold">{w.to_name}</div>
                <div className="truncate text-xs text-muted">{cityName(w.from_city, lang)} → {cityName(w.to_city, lang)}</div>
                {w.driver_position && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span><b>{t("wb.eta")}:</b> {minutesLabel(w.driver_position.eta_min, lang)}</span>
                    <span><b>{t("wb.remaining")}:</b> {km(w.driver_position.remaining_km, lang)}</span>
                    {w.driver_position.speed != null && <span className="num">{Math.round(w.driver_position.speed)} km/h</span>}
                    <span className="text-muted">{relative(w.driver_position.seen, lang)}</span>
                  </div>
                )}
                {user?.role !== "client" && w.driver_name && <div className="mt-1 text-xs text-muted">{w.driver_name} · {w.vehicle_no}</div>}
              </button>
              <Link href={`/app/waybill?id=${w.id}`} className="mt-2 inline-block text-xs font-semibold text-brand">{t("common.details")}</Link>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
