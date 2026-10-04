"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Notice } from "@/lib/types";

export default function Notifications() {
  const { t, lang, err } = useT();
  const { data, error, loading, reload } = useFetch<{ unseen: number; items: Notice[] }>("/notifications?limit=80");
  useEffect(() => { if (data?.unseen) { const id = setTimeout(() => api("/notifications/seen", { method: "POST" }).catch(() => {}), 2500); return () => clearTimeout(id); } }, [data?.unseen]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ? err(error) : ""} onRetry={reload} />;
  return (
    <>
      <PageHeader title={t("nav.notifications")} actions={<Button icon={<CheckCheck size={16} />} onClick={() => api("/notifications/seen", { method: "POST" }).then(reload)}>{t("note.markAll")}</Button>} />
      <Card className="divide-y divide-line">
        {!data.items.length && <p className="p-10 text-center text-sm text-muted">{t("note.none")}</p>}
        {data.items.map((n) => {
          const body = (
            <div className={`flex items-start gap-3 p-4 ${n.seen ? "" : "bg-brandsoft/40"}`}>
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brandsoft text-brand"><Bell size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold"><span className="num">{n.title}</span> · {t(`note.${n.kind}`)}</div>
                {n.body && <div className="truncate text-sm text-muted">{n.body}</div>}
              </div>
              <span className="text-xs whitespace-nowrap text-muted">{relative(n.at, lang)}</span>
            </div>
          );
          return n.link ? <Link key={n.id} href={n.link} className="block hover:bg-card2">{body}</Link> : <div key={n.id}>{body}</div>;
        })}
      </Card>
    </>
  );
}
