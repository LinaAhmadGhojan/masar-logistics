"use client";

import { cityName } from "@/components/fields";
import Master from "@/components/Master";
import { Badge } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { Consignee, Sender } from "@/lib/types";

export default function Consignees() {
  const { t, lang } = useT();
  const { can, user } = useAuth();
  const isClient = user?.role === "client";
  const senders = useFetch<Sender[]>("/senders");
  const opts = (senders.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  return (
    <Master<Consignee>
      title={t("nav.consignees")} sub={t("cons.sub")} endpoint="/consignees" canWrite={can("consignees.write")} deletable nameOf={(c) => c.name}
      blank={{ sender_id: isClient ? user?.sender_id : "", name: "", mobile: "", phone: "", email: "", city_id: null, address: "", gps: "", nad: "", idno: "", status: true }}
      toBody={(f) => ({ ...f, sender_id: f.sender_id ? Number(f.sender_id) : null })}
      searchKeys={(c) => `${c.name} ${c.sender_name} ${c.mobile} ${c.address}`}
      columns={[
        { key: "n", header: t("common.name"), cell: (c) => <span className="font-bold">{c.name}</span> },
        ...(isClient ? [] : [{ key: "s", header: t("wb.sender"), cell: (c: Consignee) => c.sender_name }]),
        { key: "c", header: t("common.city"), cell: (c) => cityName(c.city, lang) },
        { key: "m", header: t("common.mobile"), cell: (c) => <span className="num">{c.mobile}</span> },
        { key: "a", header: t("common.address"), cell: (c) => <span className="block max-w-56 truncate text-muted">{c.address}</span> },
        { key: "st", header: t("common.status"), cell: (c) => <Badge tone={c.status ? "ok" : "gray"} dot>{c.status ? t("common.active") : t("common.inactive")}</Badge> },
      ]}
      fields={[
        ...(isClient ? [] : [{ key: "sender_id", label: t("wb.sender"), type: "select" as const, required: true, options: [{ value: "", label: t("wb.pickSender") }, ...opts], span: 2 as const }]),
        { key: "name", label: t("common.name"), type: "text", required: true, span: 2 },
        { key: "mobile", label: t("common.mobile"), type: "text", ltr: true },
        { key: "phone", label: t("common.phone"), type: "text", ltr: true },
        { key: "email", label: t("common.email"), type: "email" },
        { key: "city_id", label: t("common.city"), type: "city" },
        { key: "address", label: t("common.address"), type: "text", span: 2 },
        { key: "gps", label: t("wb.gps"), type: "gps", span: 2 },
        { key: "nad", label: t("wb.nad"), type: "text", ltr: true },
        { key: "idno", label: t("wb.idno"), type: "text", ltr: true },
        { key: "status", label: t("common.active"), type: "bool" },
      ]}
    />
  );
}
