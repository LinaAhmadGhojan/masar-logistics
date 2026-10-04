"use client";

import { Download, Flame, PackagePlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import { Badge, Button, Card, Column, ErrorBox, Field, Input, LinkButton, Pagination, SearchBox, Select, StageBadge, StatusBadge, Table, Tabs, PageHeader, useToast } from "@/components/ui";
import { api, qs, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { downloadCSV } from "@/lib/csv";
import { date, km, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Sender, Waybill, WaybillList } from "@/lib/types";

const SIZE = 20;
const TABS = ["all", "new", "post", "delivered", "verified", "invoiced", "cancelled"] as const;

export default function Waybills() {
  const { t, lang, err } = useT();
  const { can, user } = useAuth();
  const { meta } = useMeta();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("-created");
  const [f, setF] = useState({ sender_id: "", date_from: "", date_to: "", delayed: sp.get("delayed") === "1", unassigned: sp.get("unassigned") === "1", priority: "" });
  const senders = useFetch<Sender[]>(can("senders.read") && user?.role !== "client" ? "/senders" : null);

  useEffect(() => setPage(1), [q, tab, f]);

  const params = { q, status: tab === "all" ? "" : tab, page, size: SIZE, sort, ...f };
  const { data, error, loading, reload } = useFetch<WaybillList>(`/waybills${qs(params)}`);

  const exportAll = async () => {
    try {
      const all = await api<WaybillList>(`/waybills${qs({ ...params, page: 1, size: 200 })}`);
      await downloadCSV(`waybills-${date(new Date().toISOString(), "en")}`, all.items, [
        { key: "number", label: t("wb.number"), value: (w) => w.number },
        { key: "date", label: t("common.date"), value: (w) => w.date },
        { key: "sender", label: t("wb.sender"), value: (w) => w.sender_name },
        { key: "to", label: t("wb.consignee"), value: (w) => w.to_name },
        { key: "fc", label: t("wb.fromCity"), value: (w) => cityName(w.from_city, lang) },
        { key: "tc", label: t("wb.toCity"), value: (w) => cityName(w.to_city, lang) },
        { key: "status", label: t("common.status"), value: (w) => t(`opt.status.${w.status}`) },
        { key: "stage", label: t("wb.stage"), value: (w) => t(`opt.stage.${w.stage}`) },
        { key: "driver", label: t("wb.driver"), value: (w) => w.driver_name },
        { key: "km", label: t("wb.distance"), value: (w) => w.distance_km },
        { key: "total", label: t("wb.total"), value: (w) => w.total },
      ]);
    } catch (e) {
      toast(err(e), "bad");
    }
  };

  const cols: Column<Waybill>[] = [
    { key: "n", header: t("wb.number"), sort: "number", cell: (w) => (
      <div className="flex items-center gap-1.5">
        <span className="num font-bold">{w.number}</span>
        {w.priority === "urgent" && <Flame size={14} className="text-brand" />}
      </div>
    ) },
    { key: "d", header: t("common.date"), sort: "date", cell: (w) => <span className="num text-muted">{date(w.date, lang)}</span> },
    ...(user?.role !== "client" ? [{ key: "s", header: t("wb.sender"), cell: (w: Waybill) => <span className="block max-w-44 truncate">{w.sender_name}</span> }] : []),
    { key: "c", header: t("wb.consignee"), sort: "to", cell: (w) => <span className="block max-w-48 truncate font-semibold">{w.to_name}</span> },
    { key: "r", header: t("wb.route"), cell: (w) => <span className="whitespace-nowrap text-muted">{cityName(w.from_city, lang)} → {cityName(w.to_city, lang)}</span> },
    { key: "dr", header: t("wb.driver"), cell: (w) => w.driver_name ?? <span className="text-muted">—</span> },
    { key: "km", header: t("wb.distance"), sort: "distance", cell: (w) => <span className="num text-muted">{km(w.distance_km, lang)}</span> },
    { key: "st", header: t("common.status"), sort: "status", cell: (w) => (
      <div className="flex flex-col items-start gap-1">
        <StatusBadge status={w.status} />
        {w.status === "post" && <StageBadge stage={w.stage} />}
        {w.delayed && <Badge tone="bad">{t("wb.delayed")}</Badge>}
      </div>
    ) },
  ];

  const counts = data?.counts ?? {};
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title={t("nav.waybills")}
        sub={t("wb.sub")}
        actions={<>
          <Button icon={<Download size={16} />} onClick={exportAll}>{t("common.export")}</Button>
          {can("waybills.write") && <LinkButton href="/app/waybill-form" variant="primary" icon={<PackagePlus size={16} />}>{t("nav.newWaybill")}</LinkButton>}
        </>}
      />
      <Card>
        <div className="p-3">
          <Tabs value={tab} onChange={setTab} tabs={TABS.map((s) => ({ value: s, label: s === "all" ? t("common.all") : t(`opt.status.${s}`), count: s === "all" ? totalAll : counts[s] ?? 0 }))} />
        </div>
        <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <SearchBox value={q} onChange={setQ} placeholder={t("wb.searchPh")} />
          {user?.role !== "client" && senders.data && (
            <Select value={f.sender_id} onChange={(e) => setF({ ...f, sender_id: e.target.value })} aria-label={t("wb.sender")}>
              <option value="">{t("wb.allSenders")}</option>
              {senders.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          )}
          <Field><Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} aria-label={t("common.from")} /></Field>
          <Field><Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} aria-label={t("common.to")} /></Field>
          <div className="flex items-center gap-2">
            <Button variant={f.delayed ? "soft" : "secondary"} onClick={() => setF({ ...f, delayed: !f.delayed })}>{t("wb.delayed")}</Button>
            {user?.role !== "client" && <Button variant={f.unassigned ? "soft" : "secondary"} onClick={() => setF({ ...f, unassigned: !f.unassigned })}>{t("dash.unassigned")}</Button>}
          </div>
        </div>
        {error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : (
          <>
            <div className={loading ? "opacity-60 transition" : "transition"}>
              <Table rows={data?.items ?? []} columns={cols} rowKey={(w) => w.id} onRow={(w) => router.push(`/app/waybill?id=${w.id}`)} sort={sort} onSort={setSort} />
            </div>
            <Pagination page={page} size={SIZE} total={data?.total ?? 0} onPage={setPage} />
          </>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">{num(data?.total ?? 0, lang)} {t("wb.results")} · {meta?.company.name}</p>
    </>
  );
}
