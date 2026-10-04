"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CitySelect, GpsField } from "./fields";
import { Button, Card, Checkbox, Column, ErrorBox, Field, Input, Loading, Modal, PageHeader, SearchBox, Select, Table, Textarea, Toggle, useConfirm, useToast } from "./ui";
import { api, ApiError, useFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

export type FieldDef = {
  key: string;
  label: string;
  type: "text" | "email" | "number" | "date" | "select" | "city" | "gps" | "bool" | "textarea" | "password" | "multi";
  options?: { value: string | number; label: string }[];
  required?: boolean;
  span?: 2;
  hint?: string;
  show?: (f: Record<string, unknown>) => boolean;
  ltr?: boolean;
};

type Props<T extends { id: number }> = {
  title: string;
  sub?: string;
  endpoint: string;
  columns: Column<T>[];
  fields: FieldDef[];
  blank: Record<string, unknown>;
  canWrite: boolean;
  deletable?: boolean;
  nameOf: (r: T) => string;
  toForm?: (r: T) => Record<string, unknown>;
  toBody?: (f: Record<string, unknown>) => Record<string, unknown>;
  actions?: React.ReactNode;
  extraRow?: (r: T) => React.ReactNode;
  onOpen?: (r: T) => void;
  searchKeys?: (r: T) => string;
  wide?: boolean;
  filter?: (r: T) => boolean;
  reloadKey?: unknown;
};

export default function Master<T extends { id: number }>(p: Props<T>) {
  const { t, err } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useFetch<T[]>(p.endpoint);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: number | null; form: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    return (data ?? []).filter((r) => (p.filter ? p.filter(r) : true) && (!k || (p.searchKeys ? p.searchKeys(r) : JSON.stringify(r)).toLowerCase().includes(k)));
  }, [data, q, p.filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setProblem("");
    try {
      const body = p.toBody ? p.toBody(edit.form) : edit.form;
      await api(edit.id ? `${p.endpoint}/${edit.id}` : p.endpoint, { method: edit.id ? "PUT" : "POST", body });
      toast(t("common.saved"));
      setEdit(null);
      reload();
    } catch (e) {
      const ex = e as ApiError;
      setProblem(ex.code === "invalid" ? `${t("err.invalid")}: ${(ex.fields ?? []).join(", ")}` : err(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: T) => {
    if ((await confirm({ title: t("master.deleteTitle", { name: p.nameOf(r) }), body: t("master.deleteBody"), danger: true, confirm: t("common.delete") })) === null) return;
    try {
      await api(`${p.endpoint}/${r.id}`, { method: "DELETE" });
      toast(t("common.saved"));
      reload();
    } catch (e) {
      toast(err(e), "bad");
    }
  };

  const cols: Column<T>[] = [
    ...p.columns,
    ...(p.canWrite
      ? [{ key: "_a", header: "", align: "end" as const, cell: (r: T) => (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {p.extraRow?.(r)}
            <Button size="sm" onClick={() => setEdit({ id: r.id, form: p.toForm ? p.toForm(r) : { ...(r as unknown as Record<string, unknown>) } })}>{t("common.edit")}</Button>
            {p.deletable && <Button size="sm" variant="ghost" onClick={() => remove(r)} aria-label={t("common.delete")}><Trash2 size={15} /></Button>}
          </div>
        ) }]
      : p.extraRow ? [{ key: "_a", header: "", align: "end" as const, cell: (r: T) => <div className="flex justify-end">{p.extraRow!(r)}</div> }] : []),
  ];

  const f = edit?.form ?? {};
  const set = (k: string, v: unknown) => setEdit((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <>
      <PageHeader title={p.title} sub={p.sub} actions={<>{p.actions}{p.canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setProblem(""); setEdit({ id: null, form: { ...p.blank } }); }}>{t("common.add")}</Button>}</>} />
      <Card>
        <div className="p-3"><SearchBox value={q} onChange={setQ} placeholder={t("common.search")} className="max-w-sm" /></div>
        {error ? <div className="p-3"><ErrorBox message={err(error)} onRetry={reload} /></div> : loading && !data ? <Loading /> : <Table rows={rows} columns={cols} rowKey={(r) => r.id} onRow={p.onOpen} />}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide={p.wide ?? true} title={edit?.id ? t("common.edit") : t("common.add")}
        footer={<><Button onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("common.save")}</Button></>}>
        {problem && <div className="mb-4"><ErrorBox message={problem} /></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {p.fields.filter((d) => !d.show || d.show(f)).map((d) => {
            const v = f[d.key];
            const common = { label: d.label, required: d.required, hint: d.hint, className: d.span === 2 ? "sm:col-span-2" : undefined };
            if (d.type === "bool") return <div key={d.key} className="flex items-end pb-2 sm:col-span-1"><Toggle checked={!!v} onChange={(x) => set(d.key, x)} label={d.label} /></div>;
            if (d.type === "multi")
              return (
                <Field key={d.key} {...common} className="sm:col-span-2">
                  <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
                    {d.options?.map((o) => {
                      const arr = (v as (string | number)[]) ?? [];
                      return <Checkbox key={o.value} checked={arr.includes(o.value)} onChange={(c) => set(d.key, c ? [...arr, o.value] : arr.filter((x) => x !== o.value))} label={o.label} />;
                    })}
                  </div>
                </Field>
              );
            return (
              <Field key={d.key} {...common}>
                {d.type === "select" ? (
                  <Select value={String(v ?? "")} onChange={(e) => set(d.key, e.target.value)}>
                    {d.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : d.type === "city" ? (
                  <CitySelect value={(v as number) ?? null} onChange={(x) => set(d.key, x)} />
                ) : d.type === "gps" ? (
                  <GpsField value={String(v ?? "")} onChange={(x) => set(d.key, x)} refCityId={(f.city_id as number) ?? null} />
                ) : d.type === "textarea" ? (
                  <Textarea rows={2} value={String(v ?? "")} onChange={(e) => set(d.key, e.target.value)} />
                ) : (
                  <Input type={d.type} className={d.ltr || d.type === "email" || d.type === "number" ? "ltr" : undefined} value={String(v ?? "")} onChange={(e) => set(d.key, d.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
                )}
              </Field>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
