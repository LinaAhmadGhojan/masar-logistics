"use client";

import { cityName } from "@/components/fields";
import Master from "@/components/Master";
import { Badge } from "@/components/ui";
import { useAuth, useMeta } from "@/lib/auth";
import { money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Tariff } from "@/lib/types";

export default function Tariffs() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const { meta } = useMeta();
  const n = (v: unknown) => (v === "" || v == null ? 0 : Number(v));
  const cur = meta?.company.currency ?? "";
  return (
    <Master<Tariff>
      title={t("nav.tariffs")} sub={t("tar.sub")} endpoint="/tariffs" canWrite={can("tariffs.write")} deletable nameOf={(x) => x.name}
      blank={{ name: "", code: "", service_type: "", from_city_id: null, to_city_id: null, base: 0, per_km: 0, per_pallet: 0, per_kg: 0, min_charge: 0, active: true }}
      toBody={(f) => ({ ...f, service_type: f.service_type || null, base: n(f.base), per_km: n(f.per_km), per_pallet: n(f.per_pallet), per_kg: n(f.per_kg), min_charge: n(f.min_charge) })}
      columns={[
        { key: "n", header: t("common.name"), cell: (x) => <div><div className="font-bold">{x.name}</div><div className="num text-xs text-muted">{x.code}</div></div> },
        { key: "s", header: t("wb.serviceType"), cell: (x) => (x.service_type ? t(`opt.service_type.${x.service_type}`) : t("tar.any")) },
        { key: "r", header: t("wb.route"), cell: (x) => (x.from_city || x.to_city ? `${cityName(x.from_city, lang)} → ${cityName(x.to_city, lang)}` : t("tar.anyRoute")) },
        { key: "b", header: t("tar.base"), cell: (x) => <span className="num">{money(x.base, lang)}</span> },
        { key: "k", header: t("tar.perKm"), cell: (x) => <span className="num">{money(x.per_km, lang)}</span> },
        { key: "p", header: t("tar.perPallet"), cell: (x) => <span className="num">{money(x.per_pallet, lang)}</span> },
        { key: "g", header: t("tar.perKg"), cell: (x) => <span className="num">{money(x.per_kg, lang)}</span> },
        { key: "m", header: `${t("tar.min")} (${cur})`, cell: (x) => <span className="num">{money(x.min_charge, lang)}</span> },
        { key: "a", header: t("common.status"), cell: (x) => <Badge tone={x.active ? "ok" : "gray"} dot>{x.active ? t("common.active") : t("common.inactive")}</Badge> },
      ]}
      fields={[
        { key: "name", label: t("common.name"), type: "text", required: true },
        { key: "code", label: t("tar.code"), type: "text", ltr: true },
        { key: "service_type", label: t("wb.serviceType"), type: "select", options: [{ value: "", label: t("tar.any") }, ...(meta?.service_types ?? []).map((s) => ({ value: s, label: t(`opt.service_type.${s}`) }))] },
        { key: "active", label: t("common.active"), type: "bool" },
        { key: "from_city_id", label: t("wb.fromCity"), type: "city" },
        { key: "to_city_id", label: t("wb.toCity"), type: "city" },
        { key: "base", label: `${t("tar.base")} (${cur})`, type: "number" },
        { key: "min_charge", label: `${t("tar.min")} (${cur})`, type: "number" },
        { key: "per_km", label: t("tar.perKm"), type: "number" },
        { key: "per_pallet", label: t("tar.perPallet"), type: "number" },
        { key: "per_kg", label: t("tar.perKg"), type: "number", hint: t("tar.formula") },
      ]}
    />
  );
}
