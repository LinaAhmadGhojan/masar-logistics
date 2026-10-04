import { saveFile } from "./native";

export type Col<T> = { key: string; label: string; value: (row: T) => string | number | null | undefined };

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV<T>(rows: T[], cols: Col<T>[]) {
  return [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(c.value(r))).join(","))].join("\r\n");
}

/** UTF-8 with a BOM so Excel shows Arabic text correctly. */
export function downloadCSV<T>(name: string, rows: T[], cols: Col<T>[]) {
  return saveFile(name.endsWith(".csv") ? name : `${name}.csv`, "﻿" + toCSV(rows, cols), "text/csv");
}
