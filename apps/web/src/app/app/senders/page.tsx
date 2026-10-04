"use client";

import { useRouter } from "next/navigation";
import { cityName } from "@/components/fields";
import Master from "@/components/Master";
import { Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Sender } from "@/lib/types";

export default function Senders() {
  const { t, lang } = useT();
  const { can } = useAuth();
  const router = useRouter();
  const num = (v: unknown) => (v === "" || v == null ? 0 : Number(v));
  return (
    <Master<Sender>
      title={t("nav.senders")} sub={t("sender.sub")} endpoint="/senders" canWrite={can("senders.write")} deletable nameOf={(s) => s.name}
      onOpen={(s) => router.push(`/app/sender?id=${s.id}`)}
      blank={{ name: "", contact_person: "", mobile: "", email: "", city_id: null, address: "", gps: "", national_address: "", vat_no: "", credit_limit: 0, payment_terms_days: 30, status: true }}
      toBody={(f) => ({ ...f, credit_limit: num(f.credit_limit), payment_terms_days: num(f.payment_terms_days) })}
      columns={[
        { key: "n", header: t("common.name"), cell: (s) => <div><div className="font-bold">{s.name}</div><div className="text-xs text-muted">{s.contact_person}</div></div> },
        { key: "c", header: t("common.city"), cell: (s) => cityName(s.city, lang) },
        { key: "m", header: t("common.mobile"), cell: (s) => <span className="num">{s.mobile}</span> },
        { key: "w", header: t("nav.waybills"), cell: (s) => <span className="num">{s.waybills ?? 0}</span> },
        { key: "cr", header: t("sender.credit"), cell: (s) => <span className="num">{money(s.credit_limit, lang)}</span> },
        { key: "s", header: t("common.status"), cell: (s) => <Badge tone={s.status ? "ok" : "gray"} dot>{s.status ? t("common.active") : t("common.inactive")}</Badge> },
      ]}
      fields={[
        { key: "name", label: t("common.name"), type: "text", required: true, span: 2 },
        { key: "contact_person", label: t("sender.contact"), type: "text" },
        { key: "mobile", label: t("common.mobile"), type: "text", ltr: true },
        { key: "email", label: t("common.email"), type: "email" },
        { key: "city_id", label: t("common.city"), type: "city" },
        { key: "address", label: t("common.address"), type: "text", span: 2 },
        { key: "gps", label: t("wb.gps"), type: "gps", span: 2, hint: t("sender.gpsHint") },
        { key: "national_address", label: t("wb.nad"), type: "text", ltr: true },
        { key: "vat_no", label: t("sender.vat"), type: "text", ltr: true },
        { key: "credit_limit", label: t("sender.credit"), type: "number" },
        { key: "payment_terms_days", label: t("sender.terms"), type: "number" },
        { key: "status", label: t("common.active"), type: "bool" },
      ]}
    />
  );
}
