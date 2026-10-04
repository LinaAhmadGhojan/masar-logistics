"use client";

import Master from "@/components/Master";
import { Badge } from "@/components/ui";
import { useMeta, useAuth } from "@/lib/auth";
import { date, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Vehicle } from "@/lib/types";

const TONE = { available: "ok", on_trip: "brand", maintenance: "warn" } as const;

export default function Vehicles() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const { meta } = useMeta();
  const n = (v: unknown) => (v === "" || v == null ? 0 : Number(v));
  const expiry = (d: string | null, days: number | null) => d ? <span className="flex items-center gap-1.5"><span className="num">{date(d, lang)}</span>{days != null && days <= 30 && <Badge tone={days < 0 ? "bad" : "warn"}>{days < 0 ? t("veh.expired") : t("veh.days", { n: days })}</Badge>}</span> : "—";
  return (
    <Master<Vehicle>
      title={t("nav.vehicles")} sub={t("veh.sub")} endpoint="/vehicles" canWrite={can("vehicles.write")} deletable nameOf={(v) => v.plate}
      blank={{ plate: "", kind: "dyna", capacity_kg: 0, capacity_pallets: 0, status: "available", insurance_expiry: "", registration_expiry: "", last_service: "", odometer_km: 0, notes: "" }}
      toBody={(f) => ({ ...f, capacity_kg: n(f.capacity_kg), capacity_pallets: n(f.capacity_pallets), odometer_km: n(f.odometer_km) })}
      columns={[
        { key: "p", header: t("veh.plate"), cell: (v) => <span className="num font-bold">{v.plate}</span> },
        { key: "k", header: t("veh.kind"), cell: (v) => t(`opt.vehicle_kind.${v.kind}`) },
        { key: "c", header: t("veh.capacity"), cell: (v) => <span className="num text-muted">{num(v.capacity_kg, lang)} {t("common.kg")} · {v.capacity_pallets} {t("opt.pkg.pallet")}</span> },
        { key: "d", header: t("wb.driver"), cell: (v) => v.driver_name ?? "—" },
        { key: "i", header: t("veh.insurance"), cell: (v) => expiry(v.insurance_expiry, v.insurance_days) },
        { key: "r", header: t("veh.registration"), cell: (v) => expiry(v.registration_expiry, v.registration_days) },
        { key: "s", header: t("common.status"), cell: (v) => <Badge tone={TONE[v.status]} dot>{t(`opt.vstatus.${v.status}`)}</Badge> },
      ]}
      fields={[
        { key: "plate", label: t("veh.plate"), type: "text", required: true, ltr: true },
        { key: "kind", label: t("veh.kind"), type: "select", options: (meta?.vehicle_kinds ?? []).map((k) => ({ value: k, label: t(`opt.vehicle_kind.${k}`) })) },
        { key: "capacity_kg", label: `${t("veh.capacity")} (${t("common.kg")})`, type: "number" },
        { key: "capacity_pallets", label: t("veh.pallets"), type: "number" },
        { key: "status", label: t("common.status"), type: "select", options: ["available", "on_trip", "maintenance"].map((s) => ({ value: s, label: t(`opt.vstatus.${s}`) })) },
        { key: "odometer_km", label: t("veh.odometer"), type: "number" },
        { key: "insurance_expiry", label: t("veh.insurance"), type: "date" },
        { key: "registration_expiry", label: t("veh.registration"), type: "date" },
        { key: "last_service", label: t("veh.lastService"), type: "date" },
        { key: "notes", label: t("common.notes"), type: "textarea", span: 2 },
      ]}
    />
  );
}
