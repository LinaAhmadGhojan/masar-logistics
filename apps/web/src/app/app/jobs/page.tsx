"use client";

import { ChevronLeft, ChevronRight, Clock, Flame, MapPin, Navigation, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cityName } from "@/components/fields";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, StageBadge, Toggle, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { km, num, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { flush, queued } from "@/lib/offline";
import { watchPosition } from "@/lib/native";
import type { Driver, Waybill } from "@/lib/types";

type Jobs = { driver: Driver; active: Waybill[]; done: Waybill[] };

/** Streams the phone's position to the dispatcher while the switch is on (every ~10 s, only the latest point is kept offline). */
function useShareLocation() {
  const [on, setOn] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [problem, setProblem] = useState(false);
  const lastSent = useRef(0);
  useEffect(() => {
    try { setOn(localStorage.getItem("masar-share") === "1"); } catch {}
  }, []);
  useEffect(() => {
    if (!on) return;
    let stop = () => {};
    let dead = false;
    watchPosition(
      (p) => {
        setProblem(false);
        if (Date.now() - lastSent.current < 10000) return;
        lastSent.current = Date.now();
        api("/tracking/ping", { method: "POST", body: { lat: p.lat, lng: p.lng, speed: p.speed } }).then(() => setLast(new Date().toISOString())).catch(() => {});
      },
      () => setProblem(true),
    ).then((s) => (dead ? s() : (stop = s)));
    return () => {
      dead = true;
      stop();
    };
  }, [on]);
  const set = (v: boolean) => {
    setOn(v);
    try { localStorage.setItem("masar-share", v ? "1" : "0"); } catch {}
    if (!v) api("/tracking/offline", { method: "POST" }).catch(() => {});
  };
  return { on, set, last, problem };
}

export default function Jobs() {
  const { t, lang, err } = useT();
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<Jobs>("/jobs", { poll: 20000 });
  const share = useShareLocation();
  const [pending, setPending] = useState(0);
  const Arrow = lang === "ar" ? ChevronLeft : ChevronRight;

  useEffect(() => {
    const upd = () => setPending(queued().length);
    const online = () => flush().then((r) => { if (r.done) { toast(t("job.synced", { n: r.done })); reload(); } upd(); });
    upd();
    window.addEventListener("masar-queue", upd);
    window.addEventListener("online", online);
    if (navigator.onLine) online();
    return () => { window.removeEventListener("masar-queue", upd); window.removeEventListener("online", online); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;

  const card = (w: Waybill, done = false) => (
    <Link key={w.id} href={`/app/job?id=${w.id}`}>
      <Card className={`p-4 transition active:scale-[0.99] ${done ? "opacity-70" : "hover:border-brand"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="num text-lg font-extrabold">{w.number}</div>
          <div className="flex items-center gap-1.5">{w.priority === "urgent" && <Badge tone="brand"><Flame size={12} />{t("opt.priority.urgent")}</Badge>}<StageBadge stage={w.stage} /></div>
        </div>
        <div className="mt-2 font-bold">{w.to_name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted"><MapPin size={14} />{cityName(w.to_city, lang)} · {w.to_address}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="gray">{w.sender_name}</Badge>
          <Badge tone="info">{num(w.qty, lang)} · {num(w.weight, lang)} {t("common.kg")}</Badge>
          <Badge tone="gray">{km(w.distance_km, lang)}</Badge>
          {w.cod_amount > 0 && <Badge tone="warn">COD {num(w.cod_amount, lang)}</Badge>}
          {w.promised_at && !done && <Badge tone={w.delayed ? "bad" : "gray"}><Clock size={11} />{relative(w.promised_at, lang)}</Badge>}
        </div>
        {!done && <div className="mt-3 flex items-center justify-end text-sm font-bold text-brand">{t("job.open")}<Arrow size={16} /></div>}
      </Card>
    </Link>
  );

  return (
    <>
      <PageHeader title={t("nav.jobs")} sub={`${data.driver.name} · ${data.driver.vehicle_no ?? ""}`} />
      <Card className="mb-4 flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className={`grid size-10 place-items-center rounded-xl ${share.on ? "bg-oksoft text-ok" : "bg-card2 text-muted"}`}><Navigation size={20} /></span>
          <div>
            <div className="font-bold">{t("job.shareLoc")}</div>
            <div className="text-xs text-muted">{share.problem ? t("gps.denied") : share.on ? (share.last ? `${t("job.lastSent")} ${relative(share.last, lang)}` : t("job.sending")) : t("job.shareOff")}</div>
          </div>
        </div>
        <Toggle checked={share.on} onChange={share.set} />
      </Card>
      {pending > 0 && (
        <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-warn/30 bg-warnsoft p-3 text-sm font-semibold text-warn">
          <span className="flex items-center gap-2"><WifiOff size={16} />{t("job.queued", { n: pending })}</span>
          <Button size="sm" onClick={() => flush().then(() => reload())}>{t("common.retry")}</Button>
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.active.map((w) => card(w))}
        {!data.active.length && <Card className="p-8 text-center text-sm text-muted md:col-span-2 xl:col-span-3">{t("job.none")}</Card>}
      </div>
      {data.done.length > 0 && (
        <>
          <h3 className="mt-8 mb-3 font-bold">{t("job.doneToday")}</h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.done.map((w) => card(w, true))}</div>
        </>
      )}
    </>
  );
}
