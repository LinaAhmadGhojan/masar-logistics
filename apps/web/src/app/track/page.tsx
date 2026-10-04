"use client";

import { Check, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import { Logo } from "@/components/Logo";
import Map from "@/components/Map";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, StageBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { dateTime, gpsParts, km, minutesLabel, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Track = {
  number: string; status: string; stage: string; company: string | null; company_en: string | null; sender: string | null;
  from_city: { ar: string; en: string } | null; to_city: { ar: string; en: string } | null; to_gps: string | null; from_gps: string | null;
  promised_at: string | null; delivered_at: string | null; received_by: string | null; driver_name: string | null; vehicle_no: string | null;
  position: { lat: number; lng: number; seen: string; remaining_km?: number; eta_min?: number } | null; timeline: { at: string; type: string }[];
};
const FLOW = ["pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered"];

function TrackInner() {
  const { t, lang, err } = useT();
  const sp = useSearchParams();
  const [number, setNumber] = useState(sp.get("n") ?? "");
  const [code, setCode] = useState("");
  const [data, setData] = useState<Track | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (silent = false) => {
    if (!silent) setBusy(true);
    try {
      setData(await api<Track>(`/public/track?number=${encodeURIComponent(number.trim())}&code=${encodeURIComponent(code.trim())}`));
      setError(null);
    } catch (e) { if (!silent) setError(e as ApiError); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!data || data.stage === "delivered") return;
    const id = setInterval(() => search(true), 12000);
    return () => clearInterval(id);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const idx = data ? (data.stage === "failed" ? 1 : FLOW.indexOf(data.stage)) : -1;
  const to = gpsParts(data?.to_gps);
  const from = gpsParts(data?.from_gps);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-6 flex items-center justify-between"><Link href="/login"><Logo /></Link><Link href="/login" className="text-sm font-semibold text-muted hover:text-brand">{t("login.submit")}</Link></div>
      <h1 className="text-2xl font-extrabold">{t("pub.title")}</h1>
      <p className="mt-1 mb-5 text-sm text-muted">{t("pub.sub")}</p>
      <Card className="mb-5 p-4">
        <form className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <Field label={t("wb.number")}><Input className="ltr" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="WB-2026-00001" /></Field>
          <Field label={t("pub.code")} hint={t("pub.codeHint")}><Input className="num" inputMode="numeric" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          <Button type="submit" variant="primary" loading={busy} disabled={!number || code.length < 4} icon={<PackageSearch size={16} />}>{t("pub.track")}</Button>
        </form>
      </Card>
      {error && <ErrorBox message={err(error)} />}
      {busy && !data && <Loading />}
      {data && (
        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="num text-xl font-extrabold">{data.number}</div><div className="text-sm text-muted">{lang === "ar" ? data.company : data.company_en || data.company} · {data.sender}</div></div>
              {data.status === "cancelled" ? <Badge tone="bad">{t("opt.status.cancelled")}</Badge> : <StageBadge stage={data.stage} />}
            </div>
            <div className="mt-3 text-sm font-semibold">{cityName(data.from_city, lang)} → {cityName(data.to_city, lang)}</div>
            {data.status !== "cancelled" && (
              <ol className="mt-5 grid gap-3">
                {FLOW.map((s, i) => (
                  <li key={s} className={`flex items-center gap-3 ${i > idx ? "opacity-45" : ""}`}>
                    <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${i <= idx ? "bg-brand text-white" : "bg-card2 text-muted"}`}>{i < idx || s === "delivered" && idx === i ? <Check size={14} /> : i + 1}</span>
                    <span className={`text-sm ${i === idx ? "font-bold" : ""}`}>{t(`opt.stage.${s}`)}</span>
                  </li>
                ))}
              </ol>
            )}
            {data.delivered_at && <div className="mt-4 rounded-lg bg-oksoft p-3 text-sm font-semibold text-ok">{t("pub.deliveredTo", { name: data.received_by ?? "", at: dateTime(data.delivered_at, lang) })}</div>}
            {data.position?.eta_min != null && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-brandsoft p-3"><div className="text-xs font-semibold text-brand">{t("wb.eta")}</div><div className="num text-lg font-extrabold">{minutesLabel(data.position.eta_min, lang)}</div></div>
                <div className="rounded-xl bg-card2 p-3"><div className="text-xs font-semibold text-muted">{t("wb.remaining")}</div><div className="num text-lg font-extrabold">{km(data.position.remaining_km, lang)}</div></div>
              </div>
            )}
            {data.driver_name && <div className="mt-3 text-sm text-muted">{t("wb.driver")}: <b className="text-text">{data.driver_name}</b> · <span className="num">{data.vehicle_no}</span></div>}
          </Card>
          {(data.position || to) && (
            <Card className="overflow-hidden p-1.5">
              <Map height={300} markers={[...(from ? [{ lat: from[0], lng: from[1], kind: "dot" as const, color: "#1d6fb8" }] : []), ...(to ? [{ lat: to[0], lng: to[1], label: "B", color: "#0b3d2e" }] : []), ...(data.position ? [{ lat: data.position.lat, lng: data.position.lng, kind: "truck" as const, label: "🚚", color: "#2aa57c" }] : [])]} fitKey={`${data.number}-${!!data.position}`} />
              {data.position && <p className="p-2 text-xs text-muted">{t("wb.lastSeen")}: {relative(data.position.seen, lang)}</p>}
            </Card>
          )}
          <Card className="p-5">
            <h3 className="mb-3 font-bold">{t("wb.timeline")}</h3>
            <ol className="grid gap-3 text-sm">{[...data.timeline].reverse().map((e, i) => <li key={i} className="flex justify-between gap-3"><span className="font-semibold">{t(`ev.${e.type}`)}</span><span className="num text-muted">{dateTime(e.at, lang)}</span></li>)}</ol>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return <Suspense fallback={<Loading />}><TrackInner /></Suspense>;
}
