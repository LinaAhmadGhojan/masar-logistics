"use client";

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Field, Input, PageHeader, Section, Toggle, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useMeta } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Company } from "@/lib/types";

export default function Settings() {
  const { t, err } = useT();
  const { meta, reload } = useMeta();
  const toast = useToast();
  const [c, setC] = useState<Company | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (meta) setC(meta.company); }, [meta]);
  if (!c) return null;
  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC({ ...c, [k]: v });
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const save = async () => {
    setBusy(true);
    try {
      await api("/settings", { method: "PUT", body: { ...c, phone: c.phone || null, email: c.email || null, address: c.address || null, vat_no: c.vat_no || null } });
      reload();
      toast(t("common.saved"));
    } catch (e) { toast(err(e), "bad"); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={t("nav.settings")} sub={t("set.sub")} actions={<Button variant="primary" icon={<Save size={16} />} loading={busy} onClick={save}>{t("common.save")}</Button>} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Section title={t("set.company")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.nameAr")}><Input value={c.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label={t("set.nameEn")}><Input className="ltr" value={c.name_en ?? ""} onChange={(e) => set("name_en", e.target.value)} /></Field>
            <Field label={t("common.phone")}><Input className="ltr" value={c.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label={t("common.email")}><Input className="ltr" value={c.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label={t("common.address")} className="sm:col-span-2"><Input value={c.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label={t("sender.vat")}><Input className="ltr" value={c.vat_no ?? ""} onChange={(e) => set("vat_no", e.target.value)} /></Field>
            <Field label={t("set.currency")}><Input className="ltr" maxLength={8} value={c.currency} onChange={(e) => set("currency", e.target.value)} /></Field>
            <Field label={t("set.vat")}><Input type="number" step="0.5" className="num" value={c.vat_rate} onChange={(e) => set("vat_rate", num(e.target.value))} /></Field>
          </div>
        </Section>
        <Section title={t("set.numbering")} hint={t("set.numberingHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.prefix")}><Input className="ltr" maxLength={10} value={c.waybill_prefix} onChange={(e) => set("waybill_prefix", e.target.value)} /></Field>
            <Field label={t("set.nextSeq")} hint={t("set.nextSeqHint")}><Input type="number" min={1} className="num" value={c.next_seq} onChange={(e) => set("next_seq", num(e.target.value))} /></Field>
            <div className="grid gap-3 sm:col-span-2">
              <Toggle checked={c.auto_number} onChange={(v) => set("auto_number", v)} label={t("set.autoNumber")} />
              <Toggle checked={c.number_optional} onChange={(v) => set("number_optional", v)} label={t("set.numberOptional")} disabled={!c.auto_number} />
            </div>
          </div>
        </Section>
        <Section title={t("set.rules")}>
          <div className="grid gap-3.5">
            <Toggle checked={c.require_refs} onChange={(v) => set("require_refs", v)} label={t("set.requireRefs")} />
            <Toggle checked={c.attachment_required} onChange={(v) => set("attachment_required", v)} label={t("set.attachRequired")} />
            <Toggle checked={c.pod_required} onChange={(v) => set("pod_required", v)} label={t("set.podRequired")} />
          </div>
        </Section>
        <Section title={t("set.ops")}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("set.sla")} hint={t("set.slaHint")}><Input type="number" min={1} className="num" value={c.sla_hours} onChange={(e) => set("sla_hours", num(e.target.value))} /></Field>
            <Field label={t("set.geofence")} hint={t("set.geofenceHint")}><Input type="number" min={20} className="num" value={c.geofence_m} onChange={(e) => set("geofence_m", num(e.target.value))} /></Field>
            <Field label={t("set.factor")} hint={t("set.factorHint")}><Input type="number" step="0.05" min={1} className="num" value={c.distance_factor} onChange={(e) => set("distance_factor", num(e.target.value))} /></Field>
          </div>
        </Section>
      </div>
    </>
  );
}
