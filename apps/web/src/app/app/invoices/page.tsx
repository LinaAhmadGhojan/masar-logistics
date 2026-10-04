"use client";

import { Download } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, Column, ErrorBox, INV_TONE, Loading, PageHeader, Segmented, Stat, Table } from "@/components/ui";
import { qs, useFetch } from "@/lib/api";
import { useAuth, useMeta } from "@/lib/auth";
import { downloadCSV } from "@/lib/csv";
import { date, money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Invoice } from "@/lib/types";

export default function Invoices() {
  const { t, lang, err } = useT();
  const { user } = useAuth();
  const { meta } = useMeta();
  const router = useRouter();
  const sp = useSearchParams();
  const [f, setF] = useState(sp.get("overdue") === "1" ? "overdue" : "all");
  const { data, error, loading, reload } = useFetch<Invoice[]>(`/invoices${qs({ status: ["draft", "issued", "partial", "paid", "void"].includes(f) ? f : "", overdue: f === "overdue" })}`);
  const cur = meta?.company.currency ?? "";

  const cols: Column<Invoice>[] = [
    { key: "n", header: t("inv.number"), cell: (i) => <span className="num font-bold">{i.number}</span> },
    ...(user?.role !== "client" ? [{ key: "s", header: t("wb.sender"), cell: (i: Invoice) => i.sender_name }] : []),
    { key: "d", header: t("inv.issueDate"), cell: (i) => <span className="num text-muted">{date(i.issue_date, lang)}</span> },
    { key: "du", header: t("inv.dueDate"), cell: (i) => <span className={`num ${i.overdue ? "font-bold text-bad" : "text-muted"}`}>{date(i.due_date, lang)}</span> },
    { key: "t", header: `${t("wb.total")} (${cur})`, align: "end", cell: (i) => <span className="num font-bold">{money(i.total, lang)}</span> },
    { key: "b", header: t("common.balance"), align: "end", cell: (i) => <span className="num">{money(i.balance, lang)}</span> },
    { key: "st", header: t("common.status"), cell: (i) => <div className="flex gap-1.5"><Badge tone={INV_TONE[i.status]} dot>{t(`opt.invstatus.${i.status}`)}</Badge>{i.overdue && <Badge tone="bad">{t("dash.overdue")}</Badge>}</div> },
  ];
  const total = (data ?? []).filter((i) => i.status !== "void").reduce((a, i) => a + i.total, 0);
  const open = (data ?? []).filter((i) => ["issued", "partial"].includes(i.status)).reduce((a, i) => a + i.balance, 0);

  return (
    <>
      <PageHeader title={t("nav.invoices")} sub={t("inv.sub")} actions={<Button icon={<Download size={16} />} onClick={() => downloadCSV("invoices", data ?? [], [
        { key: "n", label: t("inv.number"), value: (i) => i.number }, { key: "s", label: t("wb.sender"), value: (i) => i.sender_name }, { key: "d", label: t("inv.issueDate"), value: (i) => i.issue_date },
        { key: "du", label: t("inv.dueDate"), value: (i) => i.due_date }, { key: "t", label: t("wb.total"), value: (i) => i.total }, { key: "p", label: t("inv.paid"), value: (i) => i.paid }, { key: "st", label: t("common.status"), value: (i) => t(`opt.invstatus.${i.status}`) },
      ])}>{t("common.export")}</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={t("inv.count")} value={data?.length ?? 0} />
        <Stat label={`${t("wb.total")} (${cur})`} value={money(total, lang)} tone="brand" />
        <Stat label={`${t("dash.receivables")} (${cur})`} value={money(open, lang)} tone="warn" />
      </div>
      <Card>
        <div className="overflow-x-auto p-3"><Segmented value={f} onChange={setF} options={[{ value: "all", label: t("common.all") }, ...["draft", "issued", "partial", "paid", "void"].filter((s) => user?.role !== "client" || s !== "draft").map((s) => ({ value: s, label: t(`opt.invstatus.${s}`) })), { value: "overdue", label: t("dash.overdue") }]} /></div>
        {error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : loading && !data ? <Loading /> : <Table rows={data ?? []} columns={cols} rowKey={(i) => i.id} onRow={(i) => router.push(`/app/invoice?id=${i.id}`)} />}
      </Card>
    </>
  );
}
