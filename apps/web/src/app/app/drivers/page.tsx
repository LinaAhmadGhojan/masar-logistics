"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import Master from "@/components/Master";
import { Badge } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, Sender, Vehicle } from "@/lib/types";

export default function Drivers() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const router = useRouter();
  const senders = useFetch<Sender[]>("/senders");
  const vehicles = useFetch<Vehicle[]>("/vehicles");
  return (
    <Master<Driver>
      title={t("nav.drivers")} sub={t("drv.sub")} endpoint="/drivers" canWrite={can("drivers.write")} deletable nameOf={(d) => d.name}
      onOpen={(d) => router.push(`/app/driver?id=${d.id}`)}
      blank={{ name: "", mobile: "", email: "", doc_id: "", license_no: "", license_expiry: "", vehicle_id: "", sender_ids: [], status: true, locked: false }}
      toForm={(d) => ({ name: d.name, mobile: d.mobile ?? "", email: d.email ?? "", doc_id: d.doc_id ?? "", license_no: d.license_no ?? "", license_expiry: d.license_expiry ?? "", vehicle_id: d.vehicle_id ?? "", sender_ids: d.sender_ids, status: d.status, locked: d.locked })}
      toBody={(f) => ({ ...f, vehicle_id: f.vehicle_id ? Number(f.vehicle_id) : null, license_expiry: f.license_expiry || null })}
      columns={[
        { key: "n", header: t("common.name"), cell: (d) => <div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${d.online ? "bg-ok" : "bg-line"}`} /><span className="font-bold">{d.name}</span></div> },
        { key: "v", header: t("wb.vehicle"), cell: (d) => <span className="num">{d.vehicle_no ?? "—"}</span> },
        { key: "m", header: t("common.mobile"), cell: (d) => <span className="num">{d.mobile}</span> },
        { key: "l", header: t("drv.licenseExpiry"), cell: (d) => <span className="flex items-center gap-1.5"><span className="num">{date(d.license_expiry, lang)}</span>{d.license_days != null && d.license_days <= 30 && <Badge tone={d.license_days < 0 ? "bad" : "warn"}>{d.license_days < 0 ? t("veh.expired") : t("veh.days", { n: d.license_days })}</Badge>}</span> },
        { key: "s", header: t("drv.linked"), cell: (d) => (d.sender_ids.length ? <Badge tone="info">{d.sender_ids.length} {t("nav.senders")}</Badge> : <Badge tone="gray">{t("drv.all")}</Badge>) },
        { key: "r", header: t("drv.rating"), cell: (d) => <span className="num flex items-center gap-1"><Star size={13} className="fill-warn text-warn" />{d.rating}</span> },
        { key: "st", header: t("common.status"), cell: (d) => <Badge tone={d.status ? "ok" : "gray"} dot>{d.status ? t("common.active") : t("common.inactive")}</Badge> },
      ]}
      fields={[
        { key: "name", label: t("common.name"), type: "text", required: true },
        { key: "mobile", label: t("common.mobile"), type: "text", ltr: true },
        { key: "email", label: t("common.email"), type: "email" },
        { key: "doc_id", label: t("drv.docId"), type: "text", ltr: true },
        { key: "license_no", label: t("drv.licenseNo"), type: "text", ltr: true },
        { key: "license_expiry", label: t("drv.licenseExpiry"), type: "date" },
        { key: "vehicle_id", label: t("wb.vehicle"), type: "select", options: [{ value: "", label: "—" }, ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: v.plate }))] },
        { key: "status", label: t("common.active"), type: "bool" },
        { key: "sender_ids", label: t("drv.linkedSenders"), type: "multi", hint: t("drv.linkedHint"), options: (senders.data ?? []).map((s) => ({ value: s.id, label: s.name })) },
      ]}
    />
  );
}
