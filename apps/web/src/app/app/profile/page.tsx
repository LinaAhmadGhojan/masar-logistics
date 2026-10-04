"use client";

import { useState } from "react";
import { Button, Field, Input, KV, PageHeader, Section, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export default function Profile() {
  const { t, err } = useT();
  const { user } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ old: "", new: "" });
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const save = async () => {
    setBusy(true);
    try { await api("/auth/password", { method: "POST", body: p }); toast(t("common.saved")); setP({ old: "", new: "" }); } catch (e) { toast(err(e), "bad"); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title={t("nav.profile")} />
      <div className="grid max-w-3xl gap-5">
        <Section title={user.full_name}>
          <dl className="grid grid-cols-2 gap-4"><KV label={t("login.login")}><span className="ltr">{user.login}</span></KV><KV label={t("users.role")}>{t(`role.${user.role}`)}</KV><KV label={t("common.phone")}><span className="num">{user.phone}</span></KV><KV label={t("users.linked")}>{user.sender_name ?? user.driver_name}</KV></dl>
        </Section>
        <Section title={t("prof.changePw")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("prof.current")}><Input type="password" autoComplete="current-password" value={p.old} onChange={(e) => setP({ ...p, old: e.target.value })} /></Field>
            <Field label={t("prof.new")} hint={t("prof.min")}><Input type="password" autoComplete="new-password" value={p.new} onChange={(e) => setP({ ...p, new: e.target.value })} /></Field>
          </div>
          <Button className="mt-4" variant="primary" loading={busy} disabled={!p.old || p.new.length < 6} onClick={save}>{t("common.save")}</Button>
        </Section>
      </div>
    </>
  );
}
