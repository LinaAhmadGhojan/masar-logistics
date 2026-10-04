"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cityName } from "@/components/fields";
import Map from "@/components/Map";
import { Badge, ErrorBox, KV, Loading, PageHeader, Section, StatusBadge } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { date, gpsParts, money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Sender, WaybillList } from "@/lib/types";

export default function SenderPage() {
  const { t, lang, err } = useT();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: s, error, loading } = useFetch<Sender>(id ? `/senders/${id}` : null);
  const wbs = useFetch<WaybillList>(id ? `/waybills?sender_id=${id}&size=8` : null);
  if (loading && !s) return <Loading />;
  if (error || !s) return <ErrorBox message={error ? err(error) : ""} />;
  const p = gpsParts(s.gps);
  return (
    <>
      <PageHeader back="/app/senders" title={s.name} sub={s.contact_person ?? undefined} actions={<Badge tone={s.status ? "ok" : "gray"} dot>{s.status ? t("common.active") : t("common.inactive")}</Badge>} />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-5">
          <Section title={t("sender.info")}>
            <dl className="grid grid-cols-2 gap-4">
              <KV label={t("common.mobile")}><span className="num">{s.mobile}</span></KV>
              <KV label={t("common.email")}><span className="ltr">{s.email}</span></KV>
              <KV label={t("common.city")}>{cityName(s.city, lang)}</KV>
              <KV label={t("sender.vat")}><span className="num">{s.vat_no}</span></KV>
              <KV label={t("sender.credit")}><span className="num">{money(s.credit_limit, lang)}</span></KV>
              <KV label={t("sender.terms")}><span className="num">{s.payment_terms_days} {t("common.days")}</span></KV>
              <KV label={t("common.address")} className="col-span-2">{s.address}</KV>
            </dl>
            {p && <div className="mt-4"><Map height={200} markers={[{ lat: p[0], lng: p[1], kind: "pin", label: "●" }]} /></div>}
          </Section>
          <Section title={`${t("nav.consignees")} (${s.consignees?.length ?? 0})`}>
            <ul className="divide-y divide-line">
              {s.consignees?.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><div className="truncate font-semibold">{c.name}</div><div className="truncate text-xs text-muted">{cityName(c.city, lang)} · {c.address}</div></div>
                  {!c.status && <Badge>{t("common.inactive")}</Badge>}
                </li>
              ))}
            </ul>
            {!s.consignees?.length && <p className="text-sm text-muted">{t("common.empty")}</p>}
          </Section>
        </div>
        <Section title={t("nav.waybills")} action={<Link className="text-sm font-semibold text-brand" href={`/app/waybills?sender_id=${id}`}>{t("common.view")}</Link>}>
          <ul className="divide-y divide-line">
            {wbs.data?.items.map((w) => (
              <li key={w.id}><Link href={`/app/waybill?id=${w.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-card2">
                <div><div className="num font-bold">{w.number}</div><div className="text-xs text-muted">{date(w.date, lang)} · {w.to_name}</div></div>
                <StatusBadge status={w.status} />
              </Link></li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
