"use client";

import { Camera, Check, MapPin, Navigation, Phone, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { cityName } from "@/components/fields";
import SignaturePad from "@/components/SignaturePad";
import { Badge, Button, Card, ErrorBox, Field, Input, KV, Loading, Modal, PageHeader, Section, StageBadge, Textarea, Checkbox, useToast } from "@/components/ui";
import { api, ApiError, useFetch } from "@/lib/api";
import { km, minutesLabel, navLink, num } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { getPosition } from "@/lib/native";
import { enqueue, isOfflineError } from "@/lib/offline";
import type { Waybill } from "@/lib/types";

const NEXT: Record<string, { to: string; label: string }> = {
  assigned: { to: "accepted", label: "job.accept" },
  failed: { to: "accepted", label: "job.accept" },
  accepted: { to: "picked_up", label: "job.pickedUp" },
  picked_up: { to: "in_transit", label: "job.startTrip" },
  in_transit: { to: "arrived", label: "job.arrived" },
  arrived: { to: "delivered", label: "job.deliver" },
};

export default function Job() {
  const { t, lang, err } = useT();
  const toast = useToast();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: w, error, loading, reload, setData } = useFetch<Waybill>(id ? `/waybills/${id}` : null);
  const [busy, setBusy] = useState(false);
  const [pod, setPod] = useState(false);
  const [fail, setFail] = useState(false);

  if (loading && !w) return <Loading />;
  if (error || !w) return <ErrorBox message={error ? err(error) : t("err.not_found")} onRetry={reload} />;

  const here = async () => {
    try {
      const p = await getPosition();
      return { lat: p.lat, lng: p.lng };
    } catch {
      return {};
    }
  };

  const step = async (stage: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const body = { stage, ...(await here()), ...extra };
    try {
      const r = await api<Waybill>(`/jobs/${id}/step`, { method: "POST", body });
      setData(r);
      toast(t(`job.done.${stage}`));
      return true;
    } catch (e) {
      if (isOfflineError(e)) {
        // no signal: keep it on the phone and replay it later; show the new stage meanwhile
        enqueue(`/jobs/${id}/step`, body, `${w.number} · ${t(`opt.stage.${stage}`)}`);
        setData({ ...w, stage, delivery_status: stage === "delivered" ? 3 : 2 });
        toast(t("job.savedOffline"));
        return true;
      }
      toast(err(e), "bad");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const next = w.status === "post" ? NEXT[w.stage] : undefined;
  const to = navLink(w.to_gps);
  const from = navLink(w.from_gps);
  const phone = w.to_mobile ?? w.to_phone;
  const beforePickup = ["assigned", "accepted", "failed"].includes(w.stage);

  return (
    <>
      <PageHeader back="/app/jobs" title={<span className="num">{w.number}</span>} sub={w.sender_name} actions={<StageBadge stage={w.stage} />} />

      {w.stage === "failed" && <div className="mb-4 flex items-start gap-2 rounded-xl border border-bad/30 bg-badsoft p-3 text-sm font-semibold text-bad"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{t("wb.failedBanner")}: {w.failure_reason}</div>}
      {w.status === "cancelled" && <ErrorBox message={t("wb.isCancelled")} />}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={beforePickup ? t("job.pickupFrom") : t("job.deliverTo")}>
          <div className="text-lg font-extrabold">{beforePickup ? w.sender_name : w.to_name}</div>
          <div className="mt-1 flex items-start gap-1.5 text-sm text-muted"><MapPin size={16} className="mt-0.5 shrink-0" />{beforePickup ? `${cityName(w.from_city, lang)} · ${w.from_address ?? ""}` : `${cityName(w.to_city, lang)} · ${w.to_address ?? ""}`}</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(beforePickup ? from : to) && <a href={(beforePickup ? from : to)!} target="_blank" rel="noreferrer"><Button className="w-full" variant="dark" icon={<Navigation size={16} />}>{t("job.navigate")}</Button></a>}
            {!beforePickup && phone && <a href={`tel:${phone}`}><Button className="w-full" icon={<Phone size={16} />}>{t("job.call")}</Button></a>}
            {beforePickup && w.from_mobile && <a href={`tel:${w.from_mobile}`}><Button className="w-full" icon={<Phone size={16} />}>{t("job.call")}</Button></a>}
          </div>
        </Section>

        <Section title={t("wb.shipment")}>
          <dl className="grid grid-cols-2 gap-4">
            <KV label={t("wb.qty")}><span className="num">{num(w.qty, lang)}</span></KV>
            <KV label={t("wb.weightKg")}><span className="num">{num(w.weight, lang)}</span></KV>
            <KV label={t("wb.material")}>{w.material && t(`opt.material.${w.material}`)}</KV>
            <KV label={t("wb.distance")}><span className="num">{km(w.distance_km, lang)} {w.duration_min ? `· ${minutesLabel(w.duration_min, lang)}` : ""}</span></KV>
            <KV label={t("wb.deliveryNote")}><span className="num">{w.delivery_note}</span></KV>
            <KV label={t("wb.orderNo")}><span className="num">{w.order_no}</span></KV>
          </dl>
          {w.packages.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{w.packages.map((p, i) => <Badge key={i} tone="gray">{t(`opt.pkg.${p.type}`)} × {num(p.qty, lang)}</Badge>)}</div>}
          {w.shipment_det && <div className="mt-3 rounded-lg bg-warnsoft p-3 text-sm font-semibold text-warn">{w.shipment_det}</div>}
          {w.cod_amount > 0 && <div className="mt-3 rounded-lg bg-brandsoft p-3 text-center"><div className="text-xs font-semibold text-brand">{t("job.collectCod")}</div><div className="num text-2xl font-extrabold text-brand">{num(w.cod_amount, lang, 2)}</div></div>}
        </Section>
      </div>

      {next && (
        <div className="no-print sticky bottom-20 z-20 mt-5 grid gap-2 lg:static lg:flex lg:justify-end">
          {["picked_up", "in_transit", "arrived"].includes(w.stage) && <Button size="lg" variant="secondary" disabled={busy} onClick={() => setFail(true)} className="lg:w-auto">{t("job.cannotDeliver")}</Button>}
          <Button size="lg" variant="primary" loading={busy} icon={<Check size={18} />} className="shadow-lg lg:min-w-64" onClick={() => (next.to === "delivered" ? setPod(true) : step(next.to))}>{t(next.label)}</Button>
        </div>
      )}
      {w.stage === "delivered" && <Card className="mt-5 p-5 text-center"><div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-oksoft text-ok"><Check /></div><div className="font-bold">{t("job.delivered")}</div><div className="text-sm text-muted">{w.received_by}</div></Card>}

      <PodModal open={pod} onClose={() => setPod(false)} w={w} onSubmit={async (b) => { if (await step("delivered", b)) setPod(false); }} busy={busy} />
      <FailModal open={fail} onClose={() => setFail(false)} onSubmit={async (reason) => { if (await step("failed", { reason })) setFail(false); }} busy={busy} />
    </>
  );
}

function FailModal({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const quick = ["job.fail.closed", "job.fail.unreachable", "job.fail.refused", "job.fail.address"];
  return (
    <Modal open={open} onClose={onClose} title={t("job.cannotDeliver")} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit(reason)}>{t("common.confirm")}</Button></>}>
      <div className="mb-3 flex flex-wrap gap-2">{quick.map((q) => <button key={q} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold hover:border-brand" onClick={() => setReason(t(q))}>{t(q)}</button>)}</div>
      <Field label={t("common.reason")} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function PodModal({ open, onClose, onSubmit, busy, w }: { open: boolean; onClose: () => void; onSubmit: (b: Record<string, unknown>) => void; busy: boolean; w: Waybill }) {
  const { t, lang } = useT();
  const [v, setV] = useState({ received_by: "", receiver_mobile: "", receiver_id: "", otp: "", note: "", cod_collected: true });
  const [sig, setSig] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const proof = !!(sig || photo || v.otp.trim());
  return (
    <Modal open={open} onClose={onClose} wide title={t("job.pod")}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!v.received_by.trim() || !proof} icon={<Check size={16} />} onClick={() => onSubmit({ ...v, signature: sig, photo, cod_collected: w.cod_amount > 0 ? v.cod_collected : undefined })}>{t("job.confirmDelivery")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("wb.receivedBy")} required><Input value={v.received_by} onChange={(e) => setV({ ...v, received_by: e.target.value })} /></Field>
        <Field label={t("wb.receiverMobile")}><Input className="ltr" value={v.receiver_mobile} onChange={(e) => setV({ ...v, receiver_mobile: e.target.value })} /></Field>
        <Field label={t("wb.receiverId")}><Input className="ltr" value={v.receiver_id} onChange={(e) => setV({ ...v, receiver_id: e.target.value })} /></Field>
        <Field label={t("job.otp")} hint={t("job.otpHint")}><Input className="num text-center text-lg tracking-[0.4em]" inputMode="numeric" maxLength={4} value={v.otp} onChange={(e) => setV({ ...v, otp: e.target.value.replace(/\D/g, "") })} /></Field>
        <div className="sm:col-span-2"><div className="mb-1 text-[13px] font-semibold">{t("wb.signature")}</div><SignaturePad onChange={setSig} /></div>
        <div className="sm:col-span-2">
          <div className="mb-1 text-[13px] font-semibold">{t("wb.photo")}</div>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 text-sm text-muted hover:border-brand">
            <Camera size={16} />{photo ? t("job.photoTaken") : t("job.takePhoto")}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrinkImage(f)); }} />
          </label>
          {photo && <img src={photo} alt="" className="mt-2 h-24 rounded-lg object-cover" />}
        </div>
        <Field label={t("common.notes")} className="sm:col-span-2"><Textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} /></Field>
        {w.cod_amount > 0 && <div className="sm:col-span-2"><Checkbox checked={v.cod_collected} onChange={(c) => setV({ ...v, cod_collected: c })} label={<span className="font-semibold">{t("job.codReceived", { n: num(w.cod_amount, lang, 2) })}</span>} /></div>}
        {!proof && <p className="text-xs text-warn sm:col-span-2">{t("err.pod_required")}</p>}
      </div>
    </Modal>
  );
}
