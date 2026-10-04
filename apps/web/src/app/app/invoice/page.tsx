"use client";

import { Ban, CreditCard, Printer, Send } from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Badge, Button, ErrorBox, Field, INV_TONE, Input, Loading, Modal, PageHeader, Select, useConfirm, useToast } from "@/components/ui";
import { api, useFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, isoDay, money } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { isNative } from "@/lib/native";
import type { Invoice } from "@/lib/types";

export default function InvoicePage() {
  const { t, lang, err } = useT();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: inv, error, loading, reload } = useFetch<Invoice>(id ? `/invoices/${id}` : null);
  const [pay, setPay] = useState(false);
  const [p, setP] = useState({ amount: "", method: "bank", ref: "", date: isoDay() });
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (inv) QRCode.toDataURL(`${inv.company?.name_en ?? "Masar"} | ${inv.number} | ${inv.total} ${inv.company?.currency} | VAT ${inv.company?.vat_no ?? ""}`, { margin: 1, width: 160 }).then(setQr).catch(() => {});
  }, [inv]);

  if (loading && !inv) return <Loading />;
  if (error || !inv) return <ErrorBox message={error ? err(error) : ""} />;
  const c = inv.company!;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok); reload(); } catch (e) { toast(err(e), "bad"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader back="/app/invoices" title={<span className="flex items-center gap-3"><span className="num">{inv.number}</span><Badge tone={INV_TONE[inv.status]} dot>{t(`opt.invstatus.${inv.status}`)}</Badge>{inv.overdue && <Badge tone="bad">{t("dash.overdue")}</Badge>}</span>}
        actions={<>
          {inv.status === "draft" && can("invoices.write") && <Button variant="primary" icon={<Send size={16} />} loading={busy} onClick={() => act(() => api(`/invoices/${id}/issue`, { method: "POST" }), t("inv.issued"))}>{t("inv.issue")}</Button>}
          {["issued", "partial"].includes(inv.status) && can("payments") && <Button variant="primary" icon={<CreditCard size={16} />} onClick={() => { setP({ amount: String(inv.balance), method: "bank", ref: "", date: isoDay() }); setPay(true); }}>{t("inv.pay")}</Button>}
          {["draft", "issued"].includes(inv.status) && !inv.payments?.length && can("invoices.write") && <Button variant="danger" icon={<Ban size={16} />} onClick={async () => { if ((await confirm({ title: t("inv.voidTitle"), body: t("inv.voidBody"), danger: true, confirm: t("inv.void") })) !== null) act(() => api(`/invoices/${id}/void`, { method: "POST" }), t("inv.voided")); }}>{t("inv.void")}</Button>}
          {!isNative() && <Button icon={<Printer size={16} />} onClick={() => window.print()}>{t("common.print")}</Button>}
        </>} />

      <div className="print-sheet mx-auto max-w-[860px] rounded-xl border border-line bg-card p-6 shadow-card sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-text pb-4">
          <div>
            <Logo />
            <div className="mt-2 text-sm font-bold">{lang === "ar" ? c.name : c.name_en || c.name}</div>
            <div className="text-xs text-muted">{c.address}</div>
            <div className="num text-xs text-muted">{c.phone} {c.email ? `· ${c.email}` : ""}</div>
            {c.vat_no && <div className="num text-xs text-muted">VAT: {c.vat_no}</div>}
          </div>
          <div className="text-end">
            <div className="text-xs font-bold tracking-widest text-muted uppercase">{t("inv.taxInvoice")}</div>
            <div className="num text-2xl font-extrabold">{inv.number}</div>
            <div className="num text-xs text-muted">{t("inv.issueDate")}: {date(inv.issue_date, lang)}</div>
            <div className="num text-xs text-muted">{t("inv.dueDate")}: {date(inv.due_date, lang)}</div>
          </div>
          {qr && <img src={qr} alt="" className="size-20" />}
        </div>

        <div className="my-5 rounded-lg bg-card2 p-3 text-sm">
          <div className="text-xs font-bold text-muted">{t("inv.billTo")}</div>
          <div className="font-bold">{inv.sender?.name}</div>
          <div className="text-muted">{inv.sender?.address}</div>
          {inv.sender?.vat_no && <div className="num text-xs text-muted">VAT: {inv.sender.vat_no}</div>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-text text-xs font-bold text-muted"><th className="py-2 text-start">#</th><th className="text-start">{t("inv.description")}</th><th className="text-end">{t("common.amount")}</th><th className="text-end">{t("wb.vat")}</th></tr></thead>
            <tbody>
              {inv.lines?.map((l, i) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-2.5 text-muted">{i + 1}</td>
                  <td>{l.waybill_id ? <Link className="num hover:text-brand" href={`/app/waybill?id=${l.waybill_id}`}>{l.description}</Link> : l.description}</td>
                  <td className="num text-end">{money(l.amount, lang)}</td>
                  <td className="num text-end text-muted">{money(l.vat, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 ms-auto grid max-w-xs gap-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted">{t("common.subtotal")}</span><span className="num">{money(inv.subtotal, lang)}</span></div>
          <div className="flex justify-between"><span className="text-muted">{t("wb.vat")} ({c.vat_rate}%)</span><span className="num">{money(inv.vat, lang)}</span></div>
          <div className="flex justify-between border-t-2 border-text pt-2 text-lg font-extrabold"><span>{t("common.total")}</span><span className="num">{money(inv.total, lang)} {c.currency}</span></div>
          <div className="flex justify-between"><span className="text-muted">{t("inv.paid")}</span><span className="num text-ok">{money(inv.paid, lang)}</span></div>
          <div className="flex justify-between font-bold"><span>{t("common.balance")}</span><span className="num">{money(inv.balance, lang)}</span></div>
        </div>

        {!!inv.payments?.length && (
          <div className="mt-6 border-t border-line pt-4">
            <h4 className="mb-2 text-sm font-bold">{t("inv.payments")}</h4>
            {inv.payments.map((x) => <div key={x.id} className="flex justify-between border-b border-line/60 py-1.5 text-sm"><span className="num text-muted">{date(x.date, lang)} · {t(`opt.paymethod.${x.method}`)} {x.ref ? `· ${x.ref}` : ""}</span><span className="num font-semibold">{money(x.amount, lang)}</span></div>)}
          </div>
        )}
      </div>

      <Modal open={pay} onClose={() => setPay(false)} title={t("inv.pay")} footer={<><Button onClick={() => setPay(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!Number(p.amount)} onClick={() => act(async () => { await api(`/invoices/${id}/pay`, { method: "POST", body: { amount: Number(p.amount), method: p.method, ref: p.ref || null, date: p.date } }); setPay(false); }, t("common.saved"))}>{t("common.save")}</Button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t("common.amount")} (${c.currency})`} hint={`${t("common.balance")}: ${money(inv.balance, lang)}`}><Input type="number" step="0.01" className="num" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} /></Field>
          <Field label={t("common.date")}><Input type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
          <Field label={t("inv.method")}><Select value={p.method} onChange={(e) => setP({ ...p, method: e.target.value })}>{["bank", "cash", "card", "cheque"].map((m) => <option key={m} value={m}>{t(`opt.paymethod.${m}`)}</option>)}</Select></Field>
          <Field label={t("inv.ref")}><Input className="ltr" value={p.ref} onChange={(e) => setP({ ...p, ref: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}
