"use client";

import { Printer } from "lucide-react";
import QRCode from "qrcode";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cityName } from "@/components/fields";
import { Logo } from "@/components/Logo";
import { Button, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { BASE, useFetch } from "@/lib/api";
import { useMeta } from "@/lib/auth";
import { date, km, kg, num } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { isNative } from "@/lib/native";
import type { Waybill } from "@/lib/types";

export default function PrintWaybill() {
  const { t, lang, err } = useT();
  const { meta } = useMeta();
  const id = Number(useSearchParams().get("id") ?? 0);
  const { data: w, error } = useFetch<Waybill>(id ? `/waybills/${id}` : null);
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (!w) return;
    const url = `${window.location.origin}${BASE}/track/?n=${encodeURIComponent(w.number)}`;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: "#0b2c23", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [w]);

  if (error) return <ErrorBox message={err(error)} />;
  if (!w || !meta) return <Loading />;
  const c = meta.company;
  const row = (label: string, value: React.ReactNode) => (
    <tr>
      <th className="w-40 border border-line bg-card2 px-2 py-1.5 text-start text-xs font-bold">{label}</th>
      <td className="border border-line px-2 py-1.5">{value || "—"}</td>
    </tr>
  );

  return (
    <>
      <PageHeader back={`/app/waybill?id=${id}`} title={`${t("common.print")} · ${w.number}`} actions={!isNative() ? <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>{t("common.print")}</Button> : undefined} />
      <div className="print-sheet mx-auto max-w-[800px] rounded-xl border border-line bg-white p-6 text-[13px] text-black shadow-card">
        <div className="mb-4 flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <Logo />
            <div className="mt-1 text-xs">{lang === "ar" ? c.name : c.name_en || c.name}</div>
            <div className="text-xs">{c.address} {c.phone ? `· ${c.phone}` : ""}</div>
            {c.vat_no && <div className="text-xs">VAT: <span className="num">{c.vat_no}</span></div>}
          </div>
          <div className="text-center">
            <div className="text-xs font-bold tracking-widest uppercase">{t("print.waybill")}</div>
            <div className="num text-2xl font-extrabold">{w.number}</div>
            <div className="num text-xs">{date(w.date, lang)}</div>
          </div>
          {qr && <img src={qr} alt="QR" className="size-24" />}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <table className="w-full border-collapse"><tbody>
            <tr><th colSpan={2} className="border border-line bg-black px-2 py-1 text-start text-xs text-white">{t("wb.from")}</th></tr>
            {row(t("wb.sender"), w.sender_name)}
            {row(t("wb.fromCity"), cityName(w.from_city, lang))}
            {row(t("common.address"), w.from_address)}
            {row(t("common.mobile"), <span className="num">{w.from_mobile}</span>)}
            {row(t("wb.orderNo"), <span className="num">{w.order_no}</span>)}
            {row(t("wb.shipmentNo"), <span className="num">{w.shipment_no}</span>)}
            {row(t("wb.deliveryNote"), <span className="num">{w.delivery_note}</span>)}
          </tbody></table>
          <table className="w-full border-collapse"><tbody>
            <tr><th colSpan={2} className="border border-line bg-black px-2 py-1 text-start text-xs text-white">{t("wb.to")}</th></tr>
            {row(t("wb.consignee"), w.to_name)}
            {row(t("wb.toCity"), cityName(w.to_city, lang))}
            {row(t("common.address"), w.to_address)}
            {row(t("common.mobile"), <span className="num">{w.to_mobile ?? w.to_phone}</span>)}
            {row(t("wb.nad"), <span className="num">{w.to_nad}</span>)}
            {row(t("wb.deliverType"), t(`opt.deliver_type.${w.deliver_type}`))}
            {row(t("wb.distance"), <span className="num">{km(w.distance_km, lang)}</span>)}
          </tbody></table>
        </div>

        <table className="mt-4 w-full border-collapse">
          <thead><tr className="bg-black text-xs text-white"><th className="px-2 py-1 text-start">{t("wb.pkgType")}</th><th className="px-2 py-1 text-start">{t("wb.qty")}</th><th className="px-2 py-1 text-start">{t("wb.weightKg")}</th><th className="px-2 py-1 text-start">{t("wb.dims")}</th></tr></thead>
          <tbody>
            {w.packages.map((p, i) => (
              <tr key={i}><td className="border border-line px-2 py-1">{t(`opt.pkg.${p.type}`)}</td><td className="num border border-line px-2 py-1">{num(p.qty, lang)}</td><td className="num border border-line px-2 py-1">{num(p.weight, lang)}</td><td className="num border border-line px-2 py-1">{p.height || p.width || p.length ? `${p.height}×${p.width}×${p.length}` : "—"}</td></tr>
            ))}
            <tr className="font-bold"><td className="border border-line px-2 py-1">{t("common.total")}</td><td className="num border border-line px-2 py-1">{num(w.qty, lang)}</td><td className="num border border-line px-2 py-1">{kg(w.weight, lang)}</td><td className="num border border-line px-2 py-1">{num(w.volume_m3, lang, 2)} m³</td></tr>
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-2 gap-4">
          <table className="w-full border-collapse"><tbody>
            {row(t("wb.material"), w.material && t(`opt.material.${w.material}`))}
            {row(t("wb.paymentMode"), w.payment_mode && t(`opt.payment_mode.${w.payment_mode}`))}
            {row(t("wb.invoiceType"), w.invoice_type && t(`opt.invoice_type.${w.invoice_type}`))}
            {w.cod_amount ? row(t("wb.codAmount"), <span className="num">{num(w.cod_amount, lang, 2)} {c.currency}</span>) : null}
          </tbody></table>
          <table className="w-full border-collapse"><tbody>
            {row(t("wb.driver"), w.driver_name)}
            {row(t("wb.vehicle"), <span className="num">{w.vehicle_no}</span>)}
            {row(t("wb.returnRef"), (w.return_refs ?? []).map((r) => t(`opt.return_ref.${r}`)).join("، "))}
            {row(t("wb.instructions"), w.shipment_det)}
          </tbody></table>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs">
          {[t("print.senderSign"), t("print.driverSign"), t("print.receiverSign")].map((s) => (
            <div key={s}><div className="h-16 border-b border-black" />{s}</div>
          ))}
        </div>
        <p className="mt-6 text-center text-[10px] text-slate-500">{t("print.footer", { url: "" })}</p>
      </div>
    </>
  );
}
