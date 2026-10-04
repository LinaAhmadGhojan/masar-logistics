"use client";

import { ExternalLink, LocateFixed, MapPin, Wand2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useMeta } from "@/lib/auth";
import { gpsParts, mapsLink } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { getPosition } from "@/lib/native";
import Map from "./Map";
import { Button, Input, Modal, Select, useToast } from "./ui";

export function CitySelect({ value, onChange, disabled, allowEmpty = true, ...rest }: { value: number | null | undefined; onChange: (v: number | null) => void; disabled?: boolean; allowEmpty?: boolean } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const { meta } = useMeta();
  const { lang, t } = useT();
  const cities = meta?.cities ?? [];
  const countries = [...new Set(cities.map((c) => c.country))];
  return (
    <Select {...rest} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      {allowEmpty && <option value="">{t("common.none")}</option>}
      {countries.map((co) => (
        <optgroup key={co} label={t(`country.${co}`)}>
          {cities.filter((c) => c.country === co).sort((a, b) => (lang === "ar" ? a.ar.localeCompare(b.ar, "ar") : a.en.localeCompare(b.en))).map((c) => (
            <option key={c.id} value={c.id}>{lang === "ar" ? c.ar : c.en}</option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function OptSelect({ kind, options, value, onChange, allowEmpty, ...rest }: { kind: string; options: string[]; value: string | null | undefined; onChange: (v: string) => void; allowEmpty?: boolean } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  const { t } = useT();
  return (
    <Select {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{t("common.none")}</option>}
      {options.map((o) => (
        <option key={o} value={o}>{t(`opt.${kind}.${o}`)}</option>
      ))}
    </Select>
  );
}

export const cityName = (c: { ar: string; en: string } | null | undefined, lang: string) => (c ? (lang === "ar" ? c.ar : c.en) : "—");

/** lat,lng input that also accepts a pasted Google Maps link or Plus Code, can pick on a map, or use the device position. */
export function GpsField({ value, onChange, refCityId, readOnly, placeholder }: { value: string; onChange: (v: string) => void; refCityId?: number | null; readOnly?: boolean; placeholder?: string }) {
  const { t, err } = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const p = gpsParts(value);

  const resolve = async () => {
    if (!value.trim() || p) return;
    setBusy(true);
    try {
      const r = await api<{ gps: string }>("/geo/resolve", { method: "POST", body: { text: value, ref_city_id: refCityId ?? null } });
      onChange(r.gps);
    } catch (e) {
      toast(err(e), "bad");
    } finally {
      setBusy(false);
    }
  };
  const here = async () => {
    try {
      const pos = await getPosition();
      onChange(`${pos.lat.toFixed(6)},${pos.lng.toFixed(6)}`);
    } catch {
      toast(t("gps.denied"), "bad");
    }
  };

  return (
    <>
      <div className="flex gap-1.5">
        <Input value={value} readOnly={readOnly} className="ltr min-w-0 flex-1" placeholder={placeholder ?? t("gps.placeholder")} onChange={(e) => onChange(e.target.value)} onBlur={resolve} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), resolve())} />
        {!readOnly && (
          <>
            <Button size="md" variant="secondary" loading={busy} onClick={resolve} disabled={!value || !!p} title={t("gps.resolve")} icon={<Wand2 size={16} />} />
            <Button size="md" variant="secondary" onClick={() => setPick(true)} title={t("gps.pick")} icon={<MapPin size={16} />} />
            <Button size="md" variant="secondary" onClick={here} title={t("gps.here")} icon={<LocateFixed size={16} />} className="hidden sm:inline-flex" />
          </>
        )}
        {p && (
          <a href={mapsLink(value)!} target="_blank" rel="noreferrer" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-ok hover:bg-card2" title="Google Maps">
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      <Modal open={pick} onClose={() => setPick(false)} title={t("gps.pick")} wide footer={<Button variant="primary" onClick={() => setPick(false)}>{t("common.confirm")}</Button>}>
        <p className="mb-3 text-sm text-muted">{t("gps.pickHint")}</p>
        <Map height={380} markers={p ? [{ lat: p[0], lng: p[1], kind: "pin", label: "●" }] : []} onPick={(la, ln) => onChange(`${la.toFixed(6)},${ln.toFixed(6)}`)} fitKey={p ? "has" : "none"} />
        <div className="num mt-2 text-xs text-muted">{value}</div>
      </Modal>
    </>
  );
}
