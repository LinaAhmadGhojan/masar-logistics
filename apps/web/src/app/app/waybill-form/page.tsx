"use client";

import { Calculator, Plus, Save, Send, Trash2, Upload, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CitySelect, OptSelect } from "@/components/fields";
import { GpsField } from "@/components/fields";
import { Badge, Button, Checkbox, ErrorBox, Field, Input, Loading, Modal, PageHeader, Section, Select, Textarea, useToast } from "@/components/ui";
import { api, ApiError, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { isoDay, km, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Consignee, Driver, Pkg, Sender, Waybill } from "@/lib/types";

type Form = {
  number: string; date: string; sender_id: number | null; consignee_id: number | null; priority: string;
  from_city_id: number | null; from_address: string; from_gps: string; from_mobile: string; from_email: string;
  order_no: string; shipment_no: string; delivery_note: string; reference_no: string;
  to_name: string; to_phone: string; to_mobile: string; to_email: string; to_city_id: number | null; to_address: string; to_gps: string; to_nad: string; to_idno: string;
  shipment_det: string; remark: string; service_type: string; deliver_type: string; return_refs: string[]; packages: Pkg[]; material: string;
  total_qty: string; est_weight: string; payment_mode: string; invoice_type: string; insurance_type: string; shipment_value: string; cod_amount: string;
  collect_type: string; driver_id: number | null; distance_km: string;
};

const EMPTY: Form = {
  number: "", date: isoDay(), sender_id: null, consignee_id: null, priority: "normal", from_city_id: null, from_address: "", from_gps: "", from_mobile: "", from_email: "",
  order_no: "", shipment_no: "", delivery_note: "", reference_no: "", to_name: "", to_phone: "", to_mobile: "", to_email: "", to_city_id: null, to_address: "", to_gps: "", to_nad: "", to_idno: "",
  shipment_det: "", remark: "", service_type: "domestic", deliver_type: "d2d", return_refs: [], packages: [{ type: "pallet", qty: 1, weight: 0, height: 0, width: 0, length: 0 }], material: "",
  total_qty: "", est_weight: "", payment_mode: "shipper", invoice_type: "credit", insurance_type: "none", shipment_value: "", cod_amount: "", collect_type: "driver", driver_id: null, distance_km: "",
};

const s = (v: string | null | undefined) => v ?? "";
const n = (v: string) => (v === "" ? undefined : Number(v));

export default function WaybillForm() {
  const { t, lang, err } = useT();
  const { user, can } = useAuth();
  const { meta } = useMeta();
  const router = useRouter();
  const toast = useToast();
  const id = Number(useSearchParams().get("id") ?? 0) || 0;
  const isClient = user?.role === "client";
  const [f, setF] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [status, setStatus] = useState("new");
  const [number, setNumber] = useState<{ number: string; auto: boolean; optional: boolean } | null>(null);
  const [saving, setSaving] = useState<"" | "save" | "post">("");
  const [error, setError] = useState<ApiError | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [existingFile, setExistingFile] = useState<string | null>(null);
  const [dist, setDist] = useState<{ source: string; duration_min: number } | null>(null);
  const [quick, setQuick] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const senders = useFetch<Sender[]>("/senders");
  const consignees = useFetch<Consignee[]>(f.sender_id ? `/consignees?sender_id=${f.sender_id}&active=true` : null);
  const drivers = useFetch<Driver[]>(f.sender_id && !isClient ? `/drivers-for/${f.sender_id}` : null);

  const applySender = useCallback((sd: Sender | undefined, keepTo = false) => {
    if (!sd) return;
    setF((p) => ({ ...p, sender_id: sd.id, from_city_id: sd.city_id, from_address: s(sd.address), from_gps: s(sd.gps), from_mobile: s(sd.mobile), from_email: s(sd.email), ...(keepTo ? {} : { consignee_id: null, driver_id: null }) }));
  }, []);

  // initial load (edit) or defaults (create)
  useEffect(() => {
    if (!user) return;
    if (id) {
      api<Waybill>(`/waybills/${id}`)
        .then((w) => {
          setStatus(w.status);
          setExistingFile(w.attachments?.find((a) => a.kind === "from")?.filename ?? null);
          setF({
            number: w.number, date: w.date, sender_id: w.sender_id, consignee_id: w.consignee_id, priority: w.priority,
            from_city_id: w.from_city?.id ?? null, from_address: s(w.from_address), from_gps: s(w.from_gps), from_mobile: s(w.from_mobile), from_email: s(w.from_email),
            order_no: s(w.order_no), shipment_no: s(w.shipment_no), delivery_note: s(w.delivery_note), reference_no: s(w.reference_no),
            to_name: s(w.to_name), to_phone: s(w.to_phone), to_mobile: s(w.to_mobile), to_email: s(w.to_email), to_city_id: w.to_city?.id ?? null, to_address: s(w.to_address), to_gps: s(w.to_gps), to_nad: s(w.to_nad), to_idno: s(w.to_idno),
            shipment_det: s(w.shipment_det), remark: s(w.remark), service_type: w.service_type, deliver_type: w.deliver_type, return_refs: w.return_refs ?? [], packages: w.packages.length ? w.packages : EMPTY.packages, material: s(w.material),
            total_qty: String(w.total_qty || ""), est_weight: String(w.est_weight || ""), payment_mode: s(w.payment_mode), invoice_type: s(w.invoice_type), insurance_type: s(w.insurance_type), shipment_value: String(w.shipment_value || ""), cod_amount: String(w.cod_amount || ""),
            collect_type: s(w.collect_type), driver_id: w.driver_id, distance_km: String(w.distance_km || ""),
          });
          setLoaded(true);
        })
        .catch((e) => (setError(e), setLoaded(true)));
    } else {
      api<{ number: string; auto: boolean; optional: boolean }>("/waybills/next-number").then((x) => (setNumber(x), set("number", x.auto ? x.number : ""))).catch(() => {});
    }
  }, [id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // a client works for its own company; staff pick one
  useEffect(() => {
    if (id || !senders.data) return;
    if (isClient && senders.data[0] && !f.sender_id) applySender(senders.data[0]);
  }, [senders.data, isClient, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    const qty = f.packages.reduce((a, p) => a + (+p.qty || 0), 0);
    const weight = f.packages.reduce((a, p) => a + (+p.weight || 0), 0);
    const vol = f.packages.reduce((a, p) => a + ((+p.qty || 0) * (+p.height || 0) * (+p.width || 0) * (+p.length || 0)) / 1e6, 0);
    return { qty, weight, vol };
  }, [f.packages]);

  const pickSender = (sid: number) => applySender(senders.data?.find((x) => x.id === sid));
  const pickConsignee = (cid: number | null) => {
    const c = consignees.data?.find((x) => x.id === cid);
    if (!c) return set("consignee_id", null);
    setF((p) => ({ ...p, consignee_id: c.id, to_name: c.name, to_phone: s(c.phone), to_mobile: s(c.mobile), to_email: s(c.email), to_city_id: c.city_id, to_address: s(c.address), to_gps: s(c.gps), to_nad: s(c.nad), to_idno: s(c.idno) }));
  };

  const calcDistance = async () => {
    try {
      const r = await api<{ distance_km: number; duration_min: number; source: string }>("/geo/distance", { method: "POST", body: { from_gps: f.from_gps, to_gps: f.to_gps } });
      set("distance_km", String(r.distance_km));
      setDist(r);
    } catch (e) {
      toast(err(e), "bad");
    }
  };

  const payload = () => ({
    number: f.number || null, date: f.date, sender_id: f.sender_id, consignee_id: f.consignee_id, priority: f.priority,
    from_city_id: f.from_city_id, from_address: f.from_address, from_gps: f.from_gps, from_mobile: f.from_mobile, from_email: f.from_email,
    order_no: f.order_no, shipment_no: f.shipment_no, delivery_note: f.delivery_note, reference_no: f.reference_no,
    to_name: f.to_name, to_phone: f.to_phone, to_mobile: f.to_mobile, to_email: f.to_email, to_city_id: f.to_city_id, to_address: f.to_address, to_gps: f.to_gps, to_nad: f.to_nad, to_idno: f.to_idno,
    shipment_det: f.shipment_det, remark: f.remark, service_type: f.service_type, deliver_type: f.deliver_type, return_refs: f.return_refs,
    packages: f.packages.filter((p) => p.type).map((p) => ({ ...p, qty: +p.qty || 0, weight: +p.weight || 0, height: +p.height || 0, width: +p.width || 0, length: +p.length || 0 })),
    material: f.material || null, total_qty: n(f.total_qty), est_weight: n(f.est_weight),
    payment_mode: f.payment_mode || null, invoice_type: f.invoice_type || null, insurance_type: f.insurance_type || null,
    shipment_value: +f.shipment_value || 0, cod_amount: f.invoice_type === "cod" ? +f.cod_amount || 0 : 0, collect_type: f.collect_type || null,
    driver_id: isClient ? undefined : f.driver_id, distance_km: n(f.distance_km),
  });

  const save = async (post: boolean) => {
    setSaving(post ? "post" : "save");
    setError(null);
    try {
      const body = payload();
      const w = id ? await api<Waybill>(`/waybills/${id}`, { method: "PUT", body }) : await api<Waybill>("/waybills", { method: "POST", body });
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("kind", "from");
        await api(`/waybills/${w.id}/attachments`, { form: fd });
      }
      if (post && w.status === "new") await api(`/waybills/${w.id}/post`, { method: "POST" });
      toast(t(post ? "wb.posted" : "common.saved"));
      router.push(`/app/waybill?id=${w.id}`);
    } catch (e) {
      setError(e as ApiError);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving("");
    }
  };

  if (!meta || !loaded) return <Loading />;
  const locked = !!id && status !== "new" && user?.role !== "admin" && user?.role !== "dispatcher";
  const manualNumber = !id && number && (!number.auto || number.optional);
  const company = meta.company;

  return (
    <>
      <PageHeader title={id ? `${t("wb.edit")} ${f.number}` : t("nav.newWaybill")} back={id ? `/app/waybill?id=${id}` : "/app/waybills"}
        actions={<>
          <Button variant="secondary" loading={saving === "save"} disabled={!!saving || locked} icon={<Save size={16} />} onClick={() => save(false)}>{t("common.save")}</Button>
          {(!id || status === "new") && can("waybills.post") && <Button variant="primary" loading={saving === "post"} disabled={!!saving} icon={<Send size={16} />} onClick={() => save(true)}>{t("wb.saveAndPost")}</Button>}
        </>} />

      {error && <div className="mb-4"><ErrorBox message={error.code === "invalid" ? `${t("err.invalid")}: ${(error.fields ?? []).join(", ")}` : err(error)} /></div>}
      {locked && <div className="mb-4"><ErrorBox message={t("err.waybill_locked")} /></div>}

      <fieldset disabled={locked} className="grid gap-5">
        <Section title={t("wb.header")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("wb.number")} hint={!id && number ? (number.auto ? (number.optional ? t("wb.numberAutoOpt") : t("wb.numberAuto")) : t("wb.numberManual")) : undefined} required={!!manualNumber && !number?.auto}>
              <Input className="ltr" value={f.number} readOnly={!!id || (!!number && number.auto && !number.optional)} onChange={(e) => set("number", e.target.value)} />
            </Field>
            <Field label={t("common.date")} required><Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label={t("wb.priority")}><OptSelect kind="priority" options={meta.priorities} value={f.priority} onChange={(v) => set("priority", v)} /></Field>
            <Field label={t("wb.serviceType")}><OptSelect kind="service_type" options={meta.service_types} value={f.service_type} onChange={(v) => set("service_type", v)} /></Field>
          </div>
        </Section>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Section title={t("wb.from")} hint={t("wb.fromHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("wb.sender")} required className="sm:col-span-2">
                <Select value={f.sender_id ?? ""} disabled={isClient || !!id} onChange={(e) => pickSender(Number(e.target.value))}>
                  <option value="">{t("wb.pickSender")}</option>
                  {senders.data?.filter((x) => x.status || x.id === f.sender_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </Select>
              </Field>
              <Field label={t("wb.fromCity")}><CitySelect value={f.from_city_id} onChange={(v) => set("from_city_id", v)} /></Field>
              <Field label={t("common.mobile")}><Input className="ltr" value={f.from_mobile} onChange={(e) => set("from_mobile", e.target.value)} /></Field>
              <Field label={t("common.address")} className="sm:col-span-2"><Input value={f.from_address} onChange={(e) => set("from_address", e.target.value)} /></Field>
              <Field label={t("wb.gps")} className="sm:col-span-2"><GpsField value={f.from_gps} onChange={(v) => set("from_gps", v)} refCityId={f.from_city_id} /></Field>
              <Field label={t("wb.orderNo")} required={company.require_refs}><Input className="ltr" value={f.order_no} onChange={(e) => set("order_no", e.target.value)} /></Field>
              <Field label={t("wb.shipmentNo")} required={company.require_refs}><Input className="ltr" value={f.shipment_no} onChange={(e) => set("shipment_no", e.target.value)} /></Field>
              <Field label={t("wb.deliveryNote")} required={company.require_refs}><Input className="ltr" value={f.delivery_note} onChange={(e) => set("delivery_note", e.target.value)} /></Field>
              <Field label={t("wb.reference")}><Input className="ltr" value={f.reference_no} onChange={(e) => set("reference_no", e.target.value)} /></Field>
              <Field label={t("wb.originalDoc")} required={company.attachment_required && !existingFile} className="sm:col-span-2" hint={existingFile ? `${t("wb.current")}: ${existingFile}` : undefined}>
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line px-3 text-sm text-muted hover:border-brand">
                  <Upload size={16} />
                  <span className="truncate">{file?.name ?? t("common.upload")}</span>
                  <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
              </Field>
            </div>
          </Section>

          <Section title={t("wb.to")} hint={t("wb.toHint")}
            action={f.sender_id ? <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setQuick(true)}>{t("wb.newConsignee")}</Button> : undefined}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("wb.consignee")} required className="sm:col-span-2">
                <Select value={f.consignee_id ?? ""} disabled={!f.sender_id} onChange={(e) => pickConsignee(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{f.sender_id ? t("wb.pickConsignee") : t("wb.pickSenderFirst")}</option>
                  {consignees.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label={t("wb.consigneeName")} className="sm:col-span-2"><Input value={f.to_name} onChange={(e) => set("to_name", e.target.value)} /></Field>
              <Field label={t("common.mobile")}><Input className="ltr" value={f.to_mobile} onChange={(e) => set("to_mobile", e.target.value)} /></Field>
              <Field label={t("common.phone")}><Input className="ltr" value={f.to_phone} onChange={(e) => set("to_phone", e.target.value)} /></Field>
              <Field label={t("wb.toCity")}><CitySelect value={f.to_city_id} onChange={(v) => set("to_city_id", v)} /></Field>
              <Field label={t("common.email")}><Input className="ltr" type="email" value={f.to_email} onChange={(e) => set("to_email", e.target.value)} /></Field>
              <Field label={t("common.address")} required className="sm:col-span-2"><Input value={f.to_address} onChange={(e) => set("to_address", e.target.value)} /></Field>
              <Field label={t("wb.gps")} className="sm:col-span-2"><GpsField value={f.to_gps} onChange={(v) => set("to_gps", v)} refCityId={f.to_city_id} /></Field>
              <Field label={t("wb.nad")}><Input className="ltr" value={f.to_nad} onChange={(e) => set("to_nad", e.target.value)} /></Field>
              <Field label={t("wb.idno")}><Input className="ltr" value={f.to_idno} onChange={(e) => set("to_idno", e.target.value)} /></Field>
            </div>
          </Section>
        </div>

        <Section title={t("wb.shipment")}>
          <div className="mb-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-start text-xs font-bold text-muted">
                  <th className="pb-2 text-start">{t("wb.pkgType")}</th>
                  <th className="w-20 pb-2 text-start">{t("wb.qty")}</th>
                  <th className="w-28 pb-2 text-start">{t("wb.weightKg")}</th>
                  <th className="pb-2 text-start" colSpan={3}>{t("wb.dims")}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {f.packages.map((p, i) => {
                  const upd = (k: keyof Pkg, v: string) => set("packages", f.packages.map((x, j) => (j === i ? { ...x, [k]: k === "type" ? v : Number(v) } : x)));
                  return (
                    <tr key={i}>
                      <td className="pe-2 pb-2"><OptSelect kind="pkg" options={meta.pkg_types} value={p.type} onChange={(v) => upd("type", v)} /></td>
                      <td className="pe-2 pb-2"><Input type="number" min={0} value={p.qty || ""} onChange={(e) => upd("qty", e.target.value)} className="num" /></td>
                      <td className="pe-2 pb-2"><Input type="number" min={0} value={p.weight || ""} onChange={(e) => upd("weight", e.target.value)} className="num" /></td>
                      {(["height", "width", "length"] as const).map((k) => (
                        <td key={k} className="pe-2 pb-2"><Input type="number" min={0} placeholder={t(`wb.${k}`)} value={p[k] || ""} onChange={(e) => upd(k, e.target.value)} className="num" /></td>
                      ))}
                      <td className="pb-2"><button className="grid size-9 place-items-center rounded-lg text-muted hover:bg-badsoft hover:text-bad" onClick={() => set("packages", f.packages.filter((_, j) => j !== i))} aria-label={t("common.remove")}><Trash2 size={16} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button size="sm" icon={<Plus size={14} />} onClick={() => set("packages", [...f.packages, { type: "box", qty: 1, weight: 0, height: 0, width: 0, length: 0 }])}>{t("wb.addPackage")}</Button>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="info">{t("wb.qty")}: <b className="num">{num(totals.qty, lang)}</b></Badge>
              <Badge tone="info">{t("wb.weightKg")}: <b className="num">{num(totals.weight, lang)}</b></Badge>
              <Badge tone="info">{t("wb.volume")}: <b className="num">{num(totals.vol, lang, 2)} m³</b></Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("wb.material")}><OptSelect kind="material" options={meta.materials} value={f.material} allowEmpty onChange={(v) => set("material", v)} /></Field>
            <Field label={t("wb.totalQty")} hint={t("wb.autoHint")}><Input type="number" min={0} className="num" value={f.total_qty} placeholder={String(totals.qty || "")} onChange={(e) => set("total_qty", e.target.value)} /></Field>
            <Field label={t("wb.estWeight")} hint={t("wb.autoHint")}><Input type="number" min={0} className="num" value={f.est_weight} placeholder={String(totals.weight || "")} onChange={(e) => set("est_weight", e.target.value)} /></Field>
            <Field label={t("wb.deliverType")}><OptSelect kind="deliver_type" options={meta.deliver_types} value={f.deliver_type} onChange={(v) => set("deliver_type", v)} /></Field>
            <Field label={t("wb.instructions")} className="sm:col-span-2"><Textarea rows={2} value={f.shipment_det} onChange={(e) => set("shipment_det", e.target.value)} /></Field>
            <Field label={t("wb.remark")} className="sm:col-span-2"><Textarea rows={2} value={f.remark} onChange={(e) => set("remark", e.target.value)} /></Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mb-1.5 text-[13px] font-semibold">{t("wb.returnRef")}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {meta.return_refs.map((r) => (
                  <Checkbox key={r} checked={f.return_refs.includes(r)} onChange={(v) => set("return_refs", v ? [...f.return_refs, r] : f.return_refs.filter((x) => x !== r))} label={t(`opt.return_ref.${r}`)} />
                ))}
              </div>
            </div>
          </div>
        </Section>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Section title={t("wb.payment")} hint={t("wb.paymentHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("wb.paymentMode")}><OptSelect kind="payment_mode" options={meta.payment_modes} value={f.payment_mode} onChange={(v) => set("payment_mode", v)} /></Field>
              <Field label={t("wb.invoiceType")}><OptSelect kind="invoice_type" options={meta.invoice_types} value={f.invoice_type} onChange={(v) => set("invoice_type", v)} /></Field>
              <Field label={t("wb.insurance")}><OptSelect kind="insurance_type" options={meta.insurance_types} value={f.insurance_type} onChange={(v) => set("insurance_type", v)} /></Field>
              <Field label={`${t("wb.declaredValue")} (${company.currency})`}><Input type="number" min={0} className="num" value={f.shipment_value} onChange={(e) => set("shipment_value", e.target.value)} /></Field>
              {f.invoice_type === "cod" && <Field label={`${t("wb.codAmount")} (${company.currency})`} hint={t("wb.codHint")} className="sm:col-span-2"><Input type="number" min={0} className="num" value={f.cod_amount} onChange={(e) => set("cod_amount", e.target.value)} /></Field>}
            </div>
          </Section>

          <Section title={t("wb.delivery")}>
            <div className="grid gap-4 sm:grid-cols-2">
              {!isClient && (
                <Field label={t("wb.driver")} hint={t("wb.driverHint")} className="sm:col-span-2">
                  <Select value={f.driver_id ?? ""} disabled={!f.sender_id} onChange={(e) => set("driver_id", e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{t("wb.noDriver")}</option>
                    {drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}{d.vehicle_no ? ` (${d.vehicle_no})` : ""}</option>)}
                  </Select>
                </Field>
              )}
              <Field label={t("wb.collectType")}><OptSelect kind="collect_type" options={meta.collect_types} value={f.collect_type} onChange={(v) => set("collect_type", v)} /></Field>
              <Field label={t("wb.distance")} hint={dist ? `${dist.source === "osrm" ? t("wb.byRoad") : t("wb.estimated")} · ${dist.duration_min} ${t("wb.min")}` : t("wb.distHint")}>
                <div className="flex gap-1.5">
                  <Input type="number" min={0} step="0.1" className="num" value={f.distance_km} onChange={(e) => set("distance_km", e.target.value)} />
                  <Button onClick={calcDistance} disabled={!f.from_gps || !f.to_gps} icon={<Calculator size={16} />} title={t("wb.calcDistance")} />
                </div>
              </Field>
              <div className="text-sm text-muted sm:col-span-2">{f.distance_km && `${t("wb.distance")}: ${km(+f.distance_km, lang)}`}</div>
            </div>
          </Section>
        </div>
      </fieldset>

      <QuickConsignee open={quick} onClose={() => setQuick(false)} senderId={f.sender_id} defaultCity={f.to_city_id} onCreated={(c) => { consignees.reload(); setF((p) => ({ ...p, consignee_id: c.id, to_name: c.name, to_phone: s(c.phone), to_mobile: s(c.mobile), to_email: s(c.email), to_city_id: c.city_id, to_address: s(c.address), to_gps: s(c.gps), to_nad: s(c.nad), to_idno: s(c.idno) })); setQuick(false); }} />
    </>
  );
}

function QuickConsignee({ open, onClose, senderId, defaultCity, onCreated }: { open: boolean; onClose: () => void; senderId: number | null; defaultCity: number | null; onCreated: (c: Consignee) => void }) {
  const { t, err } = useT();
  const toast = useToast();
  const [v, setV] = useState({ name: "", mobile: "", phone: "", city_id: defaultCity, address: "", gps: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV({ name: "", mobile: "", phone: "", city_id: defaultCity, address: "", gps: "" }); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setBusy(true);
    try {
      onCreated(await api<Consignee>("/consignees", { method: "POST", body: { ...v, sender_id: senderId } }));
    } catch (e) {
      toast(err(e), "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t("wb.newConsignee")} footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!v.name.trim()} onClick={submit}>{t("common.save")}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.name")} required className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t("common.mobile")}><Input className="ltr" value={v.mobile} onChange={(e) => setV({ ...v, mobile: e.target.value })} /></Field>
        <Field label={t("common.city")}><CitySelect value={v.city_id} onChange={(c) => setV({ ...v, city_id: c })} /></Field>
        <Field label={t("common.address")} className="sm:col-span-2"><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
        <Field label={t("wb.gps")} className="sm:col-span-2"><GpsField value={v.gps} onChange={(g) => setV({ ...v, gps: g })} refCityId={v.city_id} /></Field>
      </div>
    </Modal>
  );
}
