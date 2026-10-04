"use client";

import { Ban, Check, Copy, FileText, Flame, Paperclip, Pencil, Printer, Send, Share2, Trash2, Truck, Upload, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import Map, { type MapMarker } from "@/components/Map";
import { Badge, Button, Card, ErrorBox, Field, KV, Loading, Modal, PageHeader, Section, Select, StageBadge, StatusBadge, Textarea, useConfirm, useToast } from "@/components/ui";
import { api, assetUrl, BASE, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { dateTime, date, gpsParts, km, kg, minutesLabel, money, navLink, num, relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { shareText } from "@/lib/native";
import type { Driver, Waybill } from "@/lib/types";

const FLOW = ["pending", "assigned", "accepted", "picked_up", "in_transit", "arrived", "delivered"];

export default function WaybillPage() {
  const { t, lang, err } = useT();
  const { can, user } = useAuth();
  const { meta } = useMeta();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: w, error, loading, reload, setData } = useFetch<Waybill>(id ? `/waybills/${id}` : null);
  const live = !!w && w.status === "post" && ["accepted", "picked_up", "in_transit", "arrived"].includes(w.stage);
  const trail = useFetch<{ lat: number; lng: number }[]>(w && (can("tracking") || can("jobs")) && w.collect_status ? `/tracking/waybill/${id}/trail` : null, { poll: live ? 20000 : undefined });
  const [busy, setBusy] = useState("");
  const [assign, setAssign] = useState(false);
  const [note, setNote] = useState("");
  const cur = meta?.company.currency ?? "";

  // keep the live position fresh while the truck is moving
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => api<Waybill>(`/waybills/${id}`).then(setData).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [live, id, setData]);

  if (!id) return <ErrorBox message={t("err.not_found")} />;
  if (loading && !w) return <Loading />;
  if (error || !w) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
      reload();
    } catch (e) {
      toast(err(e), "bad");
    } finally {
      setBusy("");
    }
  };

  const canEdit = can("waybills.write") && (w.status === "new" || (w.status === "post" && (user?.role === "admin" || user?.role === "dispatcher")));
  const canPost = can("waybills.post") && w.status === "new";
  const canCancel = can("waybills.cancel") && ["new", "post"].includes(w.status) && w.stage !== "delivered";
  const canAssign = can("dispatch") && ["new", "post"].includes(w.status) && w.stage !== "delivered";
  const trackUrl = typeof window === "undefined" ? "" : `${window.location.origin}${BASE}/track/?n=${encodeURIComponent(w.number)}`;

  const from = gpsParts(w.from_gps);
  const to = gpsParts(w.to_gps);
  const markers: MapMarker[] = [];
  if (from) markers.push({ lat: from[0], lng: from[1], label: "A", color: "#1d6fb8", popup: t("wb.from") });
  if (to) markers.push({ lat: to[0], lng: to[1], label: "B", color: "#0b3d2e", popup: t("wb.to") });
  if (w.driver_position) markers.push({ lat: w.driver_position.lat, lng: w.driver_position.lng, kind: "truck", label: "🚚", color: "#2aa57c", popup: w.driver_name ?? "" });
  const lines = [] as { points: [number, number][]; color?: string; dashed?: boolean }[];
  if (from && to) lines.push({ points: [from, to], color: "#8aa1b8", dashed: true });
  if (trail.data && trail.data.length > 1) lines.push({ points: trail.data.map((p) => [p.lat, p.lng] as [number, number]), color: "#2aa57c" });

  const stageIdx = w.stage === "failed" ? 1 : FLOW.indexOf(w.stage);
  const cancelIt = async () => {
    const reason = await confirm({ title: t("wb.cancelTitle"), body: t("wb.cancelBody"), danger: true, confirm: t("wb.cancelDo"), input: { label: t("common.reason") } });
    if (reason !== null) run("cancel", () => api(`/waybills/${id}/cancel`, { method: "POST", body: { reason } }), t("wb.cancelled"));
  };

  return (
    <>
      <PageHeader back="/app/waybills" title={<span className="flex flex-wrap items-center gap-3"><span className="num">{w.number}</span><StatusBadge status={w.status} />{w.status === "post" && <StageBadge stage={w.stage} />}{w.priority === "urgent" && <Badge tone="brand"><Flame size={12} />{t("opt.priority.urgent")}</Badge>}{w.delayed && <Badge tone="bad">{t("wb.delayed")}</Badge>}</span>}
        sub={`${w.sender_name} · ${date(w.date, lang)}`}
        actions={<>
          {canPost && <Button variant="primary" icon={<Send size={16} />} loading={busy === "post"} onClick={() => run("post", () => api(`/waybills/${id}/post`, { method: "POST" }), t("wb.posted"))}>{t("wb.post")}</Button>}
          {canAssign && <Button icon={<UserCheck size={16} />} onClick={() => setAssign(true)}>{t("wb.assignDriver")}</Button>}
          {canEdit && <Link href={`/app/waybill-form?id=${id}`}><Button icon={<Pencil size={16} />}>{t("common.edit")}</Button></Link>}
          <Link href={`/app/waybill-print?id=${id}`}><Button icon={<Printer size={16} />}>{t("common.print")}</Button></Link>
          {can("waybills.write") && <Button icon={<Copy size={16} />} loading={busy === "dup"} onClick={() => run("dup", async () => { const c = await api<Waybill>(`/waybills/${id}/duplicate`, { method: "POST" }); router.push(`/app/waybill-form?id=${c.id}`); })}>{t("wb.duplicate")}</Button>}
          {w.status === "new" && can("waybills.write") && <Button variant="danger" icon={<Trash2 size={16} />} onClick={async () => { if ((await confirm({ title: t("wb.deleteTitle"), danger: true, confirm: t("common.delete") })) !== null) run("del", async () => { await api(`/waybills/${id}`, { method: "DELETE" }); router.push("/app/waybills"); }); }}>{t("common.delete")}</Button>}
          {canCancel && w.status === "post" && <Button variant="danger" icon={<Ban size={16} />} onClick={cancelIt}>{t("wb.cancelDo")}</Button>}
        </>} />

      {w.status === "cancelled" && <div className="mb-4 rounded-xl border border-bad/30 bg-badsoft p-3 text-sm font-semibold text-bad">{t("wb.isCancelled")}</div>}
      {w.stage === "failed" && <div className="mb-4 rounded-xl border border-bad/30 bg-badsoft p-3 text-sm font-semibold text-bad">{t("wb.failedBanner")}: {w.failure_reason}</div>}

      {w.status === "post" && w.stage !== "failed" && (
        <Card className="mb-5 p-4">
          <ol className="flex items-start" dir="ltr">
            {FLOW.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col items-center gap-1.5 text-center">
                <div className="flex w-full items-center">
                  <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : i <= stageIdx ? "bg-brand" : "bg-line"}`} />
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${i < stageIdx ? "bg-brand text-white" : i === stageIdx ? "bg-brand text-white ring-4 ring-brand/25" : "bg-card2 text-muted"}`}>{i < stageIdx ? <Check size={14} /> : i + 1}</span>
                  <span className={`h-0.5 flex-1 ${i === FLOW.length - 1 ? "opacity-0" : i < stageIdx ? "bg-brand" : "bg-line"}`} />
                </div>
                <span className={`hidden text-[11px] sm:block ${i === stageIdx ? "font-bold text-text" : "text-muted"}`}>{t(`opt.stage.${s}`)}</span>
              </li>
            ))}
          </ol>
          {w.driver_position?.eta_min != null && (
            <div className="mt-3 flex flex-wrap gap-4 border-t border-line pt-3 text-sm">
              <span><b>{t("wb.eta")}:</b> {minutesLabel(w.driver_position.eta_min, lang)}</span>
              <span><b>{t("wb.remaining")}:</b> {km(w.driver_position.remaining_km, lang)}</span>
              <span className="text-muted">{t("wb.lastSeen")}: {relative(w.driver_position.seen, lang)}</span>
            </div>
          )}
        </Card>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[1.6fr_1fr]">
        <div className="grid gap-5">
          <Section title={t("wb.route")} action={to && w.status === "post" && can("jobs") ? <a href={navLink(w.to_gps)!} target="_blank" rel="noreferrer"><Button size="sm" icon={<Truck size={14} />}>{t("job.navigate")}</Button></a> : undefined}>
            <div className="mb-4 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl bg-infosoft p-3">
                <div className="text-xs font-bold text-info">A · {t("wb.from")}</div>
                <div className="font-bold">{w.sender_name}</div>
                <div className="text-sm text-muted">{cityName(w.from_city, lang)} · {w.from_address}</div>
              </div>
              <div className="num text-center text-sm font-bold text-muted">{km(w.distance_km, lang)}<br /><span className="text-xs font-normal">{w.duration_min ? minutesLabel(w.duration_min, lang) : ""}</span></div>
              <div className="rounded-xl bg-oksoft p-3">
                <div className="text-xs font-bold text-ok">B · {t("wb.to")}</div>
                <div className="font-bold">{w.to_name}</div>
                <div className="text-sm text-muted">{cityName(w.to_city, lang)} · {w.to_address}</div>
              </div>
            </div>
            {markers.length ? <Map height={300} markers={markers} lines={lines} fitKey={`${w.id}-${markers.length}`} /> : <p className="rounded-xl bg-card2 p-4 text-sm text-muted">{t("wb.noGps")}</p>}
          </Section>

          <Section title={t("wb.shipment")}>
            <div className="mb-4 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b border-line text-xs font-bold text-muted"><th className="py-2 text-start">{t("wb.pkgType")}</th><th className="text-start">{t("wb.qty")}</th><th className="text-start">{t("wb.weightKg")}</th><th className="text-start">{t("wb.dims")}</th></tr></thead>
                <tbody>
                  {w.packages.map((p, i) => (
                    <tr key={i} className="border-b border-line/60 last:border-0">
                      <td className="py-2 font-semibold">{t(`opt.pkg.${p.type}`)}</td>
                      <td className="num">{num(p.qty, lang)}</td>
                      <td className="num">{num(p.weight, lang)}</td>
                      <td className="num text-muted">{p.height || p.width || p.length ? `${p.height}×${p.width}×${p.length} cm` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KV label={t("wb.material")}>{w.material && t(`opt.material.${w.material}`)}</KV>
              <KV label={t("wb.totalQty")}><span className="num">{num(w.total_qty, lang)}</span></KV>
              <KV label={t("wb.estWeight")}><span className="num">{kg(w.est_weight, lang)}</span></KV>
              <KV label={t("wb.volume")}><span className="num">{num(w.volume_m3, lang, 2)} m³</span></KV>
              <KV label={t("wb.serviceType")}>{t(`opt.service_type.${w.service_type}`)}</KV>
              <KV label={t("wb.deliverType")}>{t(`opt.deliver_type.${w.deliver_type}`)}</KV>
              <KV label={t("wb.orderNo")}><span className="num">{w.order_no}</span></KV>
              <KV label={t("wb.shipmentNo")}><span className="num">{w.shipment_no}</span></KV>
              <KV label={t("wb.deliveryNote")}><span className="num">{w.delivery_note}</span></KV>
              <KV label={t("wb.reference")}><span className="num">{w.reference_no}</span></KV>
              <KV label={t("wb.returnRef")}>{(w.return_refs ?? []).map((r) => t(`opt.return_ref.${r}`)).join("، ")}</KV>
              <KV label={t("wb.promised")}>{dateTime(w.promised_at, lang)}</KV>
            </dl>
            {(w.shipment_det || w.remark) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {w.shipment_det && <KV label={t("wb.instructions")}>{w.shipment_det}</KV>}
                {w.remark && <KV label={t("wb.remark")}>{w.remark}</KV>}
              </div>
            )}
          </Section>

          <Section title={t("wb.payment")}>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <KV label={t("wb.paymentMode")}>{w.payment_mode && t(`opt.payment_mode.${w.payment_mode}`)}</KV>
              <KV label={t("wb.invoiceType")}>{w.invoice_type && t(`opt.invoice_type.${w.invoice_type}`)}</KV>
              <KV label={t("wb.declaredValue")}><span className="num">{money(w.shipment_value, lang)} {cur}</span></KV>
              <KV label={t("wb.codAmount")}>{w.cod_amount ? <span className="num">{money(w.cod_amount, lang)} {cur} {w.cod_collected ? (w.cod_settled ? `· ${t("cod.settled")}` : `· ${t("cod.collected")}`) : ""}</span> : null}</KV>
              <KV label={t("wb.charge")}><span className="num">{w.service_charge ? `${money(w.service_charge, lang)} ${cur}` : "—"}</span></KV>
              <KV label={t("wb.vat")}><span className="num">{w.service_charge ? `${money(w.vat_amount, lang)} ${cur}` : "—"}</span></KV>
              <KV label={t("wb.total")}><span className="num text-base">{w.service_charge ? `${money(w.total, lang)} ${cur}` : "—"}</span></KV>
              <KV label={t("wb.invoice")}>{w.invoice ? <Link className="num text-brand underline" href={`/app/invoice?id=${w.invoice.id}`}>{w.invoice.number}</Link> : null}</KV>
            </dl>
          </Section>

          {(w.delivered_at || w.received_by) && (
            <Section title={t("wb.pod")}>
              <dl className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KV label={t("wb.deliveredAt")}>{dateTime(w.delivered_at, lang)} {w.late && <Badge tone="warn">{t("wb.late")}</Badge>}</KV>
                <KV label={t("wb.receivedBy")}>{w.received_by}</KV>
                <KV label={t("wb.receiverMobile")}><span className="num">{w.receiver_mobile}</span></KV>
                <KV label={t("wb.receiverId")}><span className="num">{w.receiver_id}</span></KV>
              </dl>
              <div className="grid gap-3 sm:grid-cols-2">
                {w.pod_signature && <div className="rounded-xl border border-line bg-white p-2"><div className="mb-1 text-xs font-semibold text-slate-500">{t("wb.signature")}</div><img src={w.pod_signature} alt="" className="h-28 w-full object-contain" /></div>}
                {w.pod_photo && <div className="rounded-xl border border-line p-2"><div className="mb-1 text-xs font-semibold text-muted">{t("wb.photo")}</div><img src={w.pod_photo} alt="" className="h-28 w-full rounded-lg object-cover" /></div>}
              </div>
            </Section>
          )}
        </div>

        <div className="grid gap-5">
          <Section title={t("wb.parties")}>
            <dl className="grid gap-4">
              <KV label={t("wb.driver")}>{w.driver_name ? <span>{w.driver_name} <span className="text-muted">· {w.vehicle_no}</span></span> : <span className="text-muted">{t("wb.noDriver")}</span>}</KV>
              {w.driver_mobile && can("dispatch", "waybills.write") && <KV label={t("common.mobile")}><a className="num text-brand" href={`tel:${w.driver_mobile}`}>{w.driver_mobile}</a></KV>}
              <KV label={t("wb.consigneePhone")}><a className="num text-brand" href={`tel:${w.to_mobile ?? w.to_phone}`}>{w.to_mobile ?? w.to_phone}</a></KV>
            </dl>
          </Section>

          {w.otp && w.status !== "new" && (
            <Section title={t("wb.tracking")} hint={t("wb.trackingHint")}>
              <div className="mb-3 flex items-center justify-between rounded-xl bg-card2 p-3">
                <span className="text-sm text-muted">{t("wb.otp")}</span>
                <span className="num text-2xl font-extrabold tracking-[0.3em]">{w.otp}</span>
              </div>
              <Button className="w-full" icon={<Share2 size={16} />} onClick={async () => { const shared = await shareText(`${t("wb.shareTitle")} ${w.number}`, t("wb.shareText", { n: w.number, otp: w.otp ?? "" }), trackUrl); if (!shared) toast(t("common.copied")); }}>{t("wb.shareLink")}</Button>
            </Section>
          )}

          <Attachments w={w} onChange={reload} canEdit={can("waybills.write") && w.status !== "cancelled"} />

          <Section title={t("wb.timeline")}>
            <ol className="relative grid gap-4 ps-5 before:absolute before:inset-y-1 before:start-[7px] before:w-0.5 before:bg-line">
              {[...(w.events ?? [])].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className={`absolute -start-5 top-1 size-3.5 rounded-full border-2 border-card ${e.type === "delivered" ? "bg-ok" : e.type === "failed" || e.type === "cancelled" ? "bg-bad" : e.type === "comment" ? "bg-info" : "bg-brand"}`} />
                  <div className="text-sm font-semibold">{t(`ev.${e.type}`)}</div>
                  {e.text && <div className="text-sm text-muted">{e.text}</div>}
                  <div className="num text-xs text-muted">{dateTime(e.at, lang)}{e.actor ? ` · ${e.actor}` : ""}</div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-2 border-t border-line pt-4">
              <Field className="flex-1"><Textarea rows={1} value={note} placeholder={t("wb.addNote")} onChange={(e) => setNote(e.target.value)} /></Field>
              <Button variant="primary" disabled={!note.trim()} onClick={() => run("note", async () => { await api(`/waybills/${id}/comment`, { method: "POST", body: { reason: note } }); setNote(""); })}>{t("common.add")}</Button>
            </div>
          </Section>
        </div>
      </div>

      <AssignModal open={assign} onClose={() => setAssign(false)} w={w} onDone={() => { setAssign(false); reload(); }} />
    </>
  );
}

function Attachments({ w, onChange, canEdit }: { w: Waybill; onChange: () => void; canEdit: boolean }) {
  const { t, err } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, kind: "from" | "policy") => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      await api(`/waybills/${w.id}/attachments`, { form: fd });
      onChange();
    } catch (e) {
      toast(err(e), "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={t("wb.attachments")} action={canEdit ? (
      <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-[13px] font-semibold hover:bg-card2">
        <Upload size={14} />{busy ? "…" : t("common.upload")}
        <input type="file" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "policy")} />
      </label>
    ) : undefined}>
      {!w.attachments?.length && <p className="text-sm text-muted">{t("wb.noAttachments")}</p>}
      <ul className="grid gap-2">
        {w.attachments?.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-lg border border-line p-2.5 text-sm">
            {a.kind === "from" ? <FileText size={16} className="text-brand" /> : <Paperclip size={16} className="text-muted" />}
            <a className="min-w-0 flex-1 truncate font-semibold hover:text-brand" href={assetUrl(a.url)} target="_blank" rel="noreferrer">{a.filename}</a>
            {a.kind === "from" && <Badge tone="brand">{t("wb.original")}</Badge>}
            {canEdit && <button className="text-muted hover:text-bad" onClick={async () => { await api(`/waybills/${w.id}/attachments/${a.id}`, { method: "DELETE" }); onChange(); }} aria-label={t("common.remove")}><Trash2 size={15} /></button>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function AssignModal({ open, onClose, w, onDone }: { open: boolean; onClose: () => void; w: Waybill; onDone: () => void }) {
  const { t, err } = useT();
  const toast = useToast();
  const drivers = useFetch<Driver[]>(open ? `/drivers-for/${w.sender_id}` : null);
  const [sel, setSel] = useState<string>("");
  useEffect(() => setSel(w.driver_id ? String(w.driver_id) : ""), [w.driver_id, open]);
  const save = async () => {
    try {
      await api(`/waybills/${w.id}/assign`, { method: "POST", body: { driver_id: sel ? Number(sel) : null } });
      toast(t("common.saved"));
      onDone();
    } catch (e) {
      toast(err(e), "bad");
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t("wb.assignDriver")} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" onClick={save}>{t("common.save")}</Button></>}>
      <p className="mb-3 text-sm text-muted">{t("wb.driverHint")}</p>
      <Field label={t("wb.driver")}>
        <Select value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">{t("wb.noDriver")}</option>
          {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_no ? ` (${d.vehicle_no})` : ""}{d.online ? " ●" : ""}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}
