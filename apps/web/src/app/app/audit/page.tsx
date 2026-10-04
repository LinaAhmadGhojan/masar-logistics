"use client";

import { Card, Column, ErrorBox, Loading, PageHeader, Table } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Row = { id: number; at: string; user: string | null; action: string; entity: string | null; entity_id: number | null; detail: string | null };

export default function Audit() {
  const { t, lang, err } = useT();
  const { data, error, loading, reload } = useFetch<Row[]>("/audit?limit=200");
  const cols: Column<Row>[] = [
    { key: "at", header: t("common.date"), cell: (r) => <span className="num text-muted">{dateTime(r.at, lang)}</span> },
    { key: "u", header: t("aud.user"), cell: (r) => r.user ?? "—" },
    { key: "a", header: t("aud.action"), cell: (r) => <span className="num font-semibold">{r.action}</span> },
    { key: "e", header: t("aud.entity"), cell: (r) => (r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ""}` : "—") },
    { key: "d", header: t("common.details"), cell: (r) => <span className="text-muted">{r.detail}</span> },
  ];
  return (
    <>
      <PageHeader title={t("nav.audit")} sub={t("aud.sub")} />
      <Card>{error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : loading && !data ? <Loading /> : <Table rows={data ?? []} columns={cols} rowKey={(r) => r.id} dense />}</Card>
    </>
  );
}
