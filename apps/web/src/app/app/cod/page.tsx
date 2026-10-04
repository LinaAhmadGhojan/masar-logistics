"use client";

import { HandCoins } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Stat, useConfirm, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { useMeta } from "@/lib/auth";
import { dateTime, money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Waybill } from "@/lib/types";

type Cod = { total: number; groups: { driver_id: number | null; driver_name: string; total: number; items: Waybill[] }[] };

export default function CodPage() {
  const { t, lang, err } = useT();
  const { meta } = useMeta();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useFetch<Cod>("/cod");
  const [busy, setBusy] = useState<number | null>(null);
  const cur = meta?.company.currency ?? "";
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;

  const settle = async (g: Cod["groups"][number]) => {
    if ((await confirm({ title: t("cod.settleTitle", { name: g.driver_name }), body: `${money(g.total, lang)} ${cur}`, confirm: t("cod.settle") })) === null) return;
    setBusy(g.driver_id ?? 0);
    try {
      await api("/cod/settle", { method: "POST", body: { waybill_ids: g.items.map((w) => w.id) } });
      toast(t("common.saved"));
      reload();
    } catch (e) { toast(err(e), "bad"); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHeader title={t("nav.cod")} sub={t("cod.sub")} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`${t("cod.inHand")} (${cur})`} value={money(data.total, lang)} tone="warn" icon={<HandCoins size={20} />} />
        <Stat label={t("nav.drivers")} value={data.groups.length} />
      </div>
      {!data.groups.length && <Card className="p-10 text-center text-sm text-muted">{t("cod.none")}</Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.groups.map((g) => (
          <Card key={g.driver_id ?? 0} className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><div className="font-bold">{g.driver_name}</div><div className="text-xs text-muted">{g.items.length} {t("nav.waybills")}</div></div>
              <div className="flex items-center gap-3"><Badge tone="warn"><span className="num text-sm">{money(g.total, lang)} {cur}</span></Badge><Button variant="primary" size="sm" loading={busy === (g.driver_id ?? 0)} onClick={() => settle(g)}>{t("cod.settle")}</Button></div>
            </div>
            <ul className="divide-y divide-line text-sm">
              {g.items.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/app/waybill?id=${w.id}`} className="min-w-0 hover:text-brand"><span className="num font-semibold">{w.number}</span><span className="block truncate text-xs text-muted">{w.to_name} · {dateTime(w.delivered_at, lang)}</span></Link>
                  <span className="num font-semibold">{money(w.cod_amount, lang)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
