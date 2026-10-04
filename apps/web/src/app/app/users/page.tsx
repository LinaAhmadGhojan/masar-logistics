"use client";

import Master from "@/components/Master";
import { Badge, Tone } from "@/components/ui";
import { useFetch } from "@/lib/api";
import { relative } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { Driver, Sender, User } from "@/lib/types";

const ROLES = ["admin", "dispatcher", "finance", "client", "driver"];
const TONE: Record<string, Tone> = { admin: "violet", dispatcher: "info", finance: "warn", client: "brand", driver: "ok" };

export default function Users() {
  const { t, lang } = useT();
  const senders = useFetch<Sender[]>("/senders");
  const drivers = useFetch<Driver[]>("/drivers");
  return (
    <Master<User>
      title={t("nav.users")} sub={t("users.sub")} endpoint="/users" canWrite deletable nameOf={(u) => u.full_name}
      blank={{ role: "dispatcher", login: "", password: "", full_name: "", phone: "", active: true, view_all: true, sender_id: "", driver_id: "" }}
      toForm={(u) => ({ role: u.role, login: u.login, password: "", full_name: u.full_name, phone: u.phone ?? "", active: u.active, view_all: u.view_all, sender_id: u.sender_id ?? "", driver_id: u.driver_id ?? "" })}
      toBody={(f) => ({ ...f, password: f.password || null, sender_id: f.role === "client" && f.sender_id ? Number(f.sender_id) : null, driver_id: f.role === "driver" && f.driver_id ? Number(f.driver_id) : null })}
      columns={[
        { key: "n", header: t("common.name"), cell: (u) => <div><div className="font-bold">{u.full_name}</div><div className="num text-xs text-muted">{u.login}</div></div> },
        { key: "r", header: t("users.role"), cell: (u) => <Badge tone={TONE[u.role]}>{t(`role.${u.role}`)}</Badge> },
        { key: "l", header: t("users.linked"), cell: (u) => u.sender_name ?? u.driver_name ?? "—" },
        { key: "v", header: t("users.viewAll"), cell: (u) => (["client", "driver"].includes(u.role) ? "—" : u.view_all ? t("common.yes") : t("common.no")) },
        { key: "ll", header: t("users.lastLogin"), cell: (u) => <span className="text-muted">{u.last_login ? relative(u.last_login, lang) : "—"}</span> },
        { key: "s", header: t("common.status"), cell: (u) => <Badge tone={u.active ? "ok" : "gray"} dot>{u.active ? t("common.active") : t("common.inactive")}</Badge> },
      ]}
      fields={[
        { key: "full_name", label: t("common.name"), type: "text", required: true },
        { key: "role", label: t("users.role"), type: "select", options: ROLES.map((r) => ({ value: r, label: t(`role.${r}`) })) },
        { key: "login", label: t("login.login"), type: "text", required: true, ltr: true },
        { key: "password", label: t("common.password"), type: "password", hint: t("users.pwHint") },
        { key: "phone", label: t("common.phone"), type: "text", ltr: true },
        { key: "sender_id", label: t("wb.sender"), type: "select", required: true, show: (f) => f.role === "client", options: [{ value: "", label: t("wb.pickSender") }, ...(senders.data ?? []).map((s) => ({ value: s.id, label: s.name }))] },
        { key: "driver_id", label: t("wb.driver"), type: "select", required: true, show: (f) => f.role === "driver", options: [{ value: "", label: "—" }, ...(drivers.data ?? []).map((d) => ({ value: d.id, label: d.name }))] },
        { key: "view_all", label: t("users.viewAll"), type: "bool", show: (f) => f.role !== "client" && f.role !== "driver", hint: t("users.viewAllHint") },
        { key: "active", label: t("common.active"), type: "bool" },
      ]}
    />
  );
}
