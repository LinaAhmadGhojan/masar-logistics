"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

// ------------------------------------------------------------------ buttons
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft" | "dark";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
};
const VAR = {
  primary: "bg-gradient-to-br from-[#31b88b] to-[#12877f] text-white shadow-sm shadow-brand/25 hover:brightness-95",
  secondary: "bg-card text-text border border-line hover:bg-card2",
  ghost: "text-muted hover:bg-card2 hover:text-text",
  danger: "bg-bad text-white hover:opacity-90",
  soft: "bg-brandsoft text-brand hover:brightness-95",
  dark: "bg-ink text-white hover:bg-ink2",
};
const SIZE = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2" };

export function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, type = "button", ...p }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50", VAR[variant], SIZE[size], className)}
      {...p}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "secondary", size = "md", icon, children, className }: { href: string; variant?: BtnProps["variant"]; size?: BtnProps["size"]; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition active:scale-[0.98]", VAR[variant ?? "secondary"], SIZE[size ?? "md"], className)}>
      {icon}
      {children}
    </Link>
  );
}

// -------------------------------------------------------------------- cards
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-xl border border-line bg-card shadow-card", className)} {...p}>
      {children}
    </div>
  );
}

export function Section({ title, hint, action, children, className }: { title?: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx("p-4 sm:p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold">{title}</h3>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

export function PageHeader({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: string }) {
  const { dir } = useT();
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand">
            {dir === "rtl" ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            <BackLabel />
          </Link>
        )}
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
const BackLabel = () => <>{useT().t("common.back")}</>;

export function Stat({ label, value, sub, tone = "default", icon, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "brand" | "ok" | "warn" | "bad" | "info"; icon?: React.ReactNode; href?: string }) {
  const tones = { default: "bg-card2 text-muted", brand: "bg-brandsoft text-brand", ok: "bg-oksoft text-ok", warn: "bg-warnsoft text-warn", bad: "bg-badsoft text-bad", info: "bg-infosoft text-info" };
  const body = (
    <Card className={cx("flex items-start gap-3 p-4", href && "transition hover:border-brand")}>
      {icon && <div className={cx("grid size-10 shrink-0 place-items-center rounded-lg", tones[tone])}>{icon}</div>}
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-muted">{label}</div>
        <div className="num text-2xl leading-tight font-extrabold">{value}</div>
        {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
      </div>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

// ------------------------------------------------------------------- badges
const BADGE = {
  gray: "bg-card2 text-muted border-line",
  brand: "bg-brandsoft text-brand border-transparent",
  ok: "bg-oksoft text-ok border-transparent",
  warn: "bg-warnsoft text-warn border-transparent",
  bad: "bg-badsoft text-bad border-transparent",
  info: "bg-infosoft text-info border-transparent",
  violet: "bg-violetsoft text-violet border-transparent",
};
export type Tone = keyof typeof BADGE;

export function Badge({ tone = "gray", children, dot, className }: { tone?: Tone; children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", BADGE[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = { new: "info", post: "warn", delivered: "ok", verified: "violet", invoiced: "gray", cancelled: "bad" };
export const STAGE_TONE: Record<string, Tone> = { pending: "gray", assigned: "info", accepted: "info", picked_up: "brand", in_transit: "brand", arrived: "violet", delivered: "ok", failed: "bad" };
export const INV_TONE: Record<string, Tone> = { draft: "gray", issued: "info", partial: "warn", paid: "ok", void: "bad" };

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return <Badge tone={STATUS_TONE[status] ?? "gray"} dot>{t(`opt.status.${status}`)}</Badge>;
}
export function StageBadge({ stage }: { stage: string }) {
  const { t } = useT();
  return <Badge tone={STAGE_TONE[stage] ?? "gray"}>{t(`opt.stage.${stage}`)}</Badge>;
}

// ------------------------------------------------------------------- fields
export function Field({ label, hint, error, required, children, className }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | false | null; required?: boolean; children: React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cx("min-w-0", className)}>
      {label && (
        <label htmlFor={id} className="mb-1 flex items-center gap-1 text-[13px] font-semibold">
          {label}
          {required && <span className="text-bad">*</span>}
        </label>
      )}
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {error ? <p className="mt-1 text-xs text-bad">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
const FieldId = createContext<string | undefined>(undefined);

const INPUT = "h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-card2 disabled:text-muted read-only:bg-card2";

export function Input({ className, invalid, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const id = useContext(FieldId);
  return <input id={id} className={cx(INPUT, invalid && "border-bad", className)} {...p} />;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useContext(FieldId);
  return <textarea id={id} className={cx(INPUT, "h-auto min-h-20 py-2", className)} {...p} />;
}

export function Select({ className, children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useContext(FieldId);
  return (
    <select id={id} className={cx(INPUT, "appearance-none bg-no-repeat pe-8", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%2364748b' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.75rem center" }} {...p}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2.5 text-sm", disabled && "cursor-not-allowed opacity-50")}>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-brand" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} />
      </button>
      {label}
    </label>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span className={cx("grid size-5 place-items-center rounded-md border transition", checked ? "border-brand bg-brand text-white" : "border-line bg-card")}>{checked && <Check size={14} strokeWidth={3} />}</span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-lg border border-line bg-card2 p-0.5", className)}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onChange(o.value)} className={cx("rounded-md px-3 py-1.5 text-[13px] font-semibold whitespace-nowrap transition", value === o.value ? "bg-card text-text shadow-sm" : "text-muted hover:text-text")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    const id = setTimeout(() => v !== value && onChange(v), 300);
    return () => clearTimeout(id);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cx("relative", className)}>
      <Search size={16} className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-muted" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} className={cx(INPUT, "ps-9")} />
    </div>
  );
}

// -------------------------------------------------------------- feedback UI
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-muted", className)} size={20} />;
}

export function Loading() {
  return (
    <div className="grid place-items-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty({ title, hint, action, icon }: { title?: string; hint?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="grid place-items-center gap-2 px-4 py-14 text-center">
      {icon && <div className="grid size-14 place-items-center rounded-2xl bg-card2 text-muted">{icon}</div>}
      <div className="font-bold">{title ?? t("common.empty")}</div>
      {hint && <div className="max-w-sm text-sm text-muted">{hint}</div>}
      {action}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-bad/30 bg-badsoft p-4 text-sm text-bad">
      {message}
      {onRetry && (
        <Button size="sm" variant="secondary" className="ms-3" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- modals
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx("anim-up flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-card shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-card2" aria-label="close">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

type ConfirmOpts = { title: string; body?: React.ReactNode; confirm?: string; danger?: boolean; input?: { label: string; required?: boolean } };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<string | null>>(async () => null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: string | null) => void }) | null>(null);
  const [text, setText] = useState("");
  const ask = useCallback((o: ConfirmOpts) => new Promise<string | null>((resolve) => { setText(""); setState({ ...o, resolve }); }), []);
  const done = (v: string | null) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => done(null)} title={state?.title}
        footer={<>
          <Button onClick={() => done(null)}>{t("common.cancel")}</Button>
          <Button variant={state?.danger ? "danger" : "primary"} disabled={!!state?.input?.required && !text.trim()} onClick={() => done(text)}>{state?.confirm ?? t("common.confirm")}</Button>
        </>}>
        {state?.body && <div className="mb-3 text-sm text-muted">{state.body}</div>}
        {state?.input && <Field label={state.input.label}><Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} /></Field>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

// ------------------------------------------------------------------- toasts
type Toast = { id: number; text: string; tone: "ok" | "bad" };
const ToastCtx = createContext<(text: string, tone?: "ok" | "bad") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    const id = ++n.current;
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), tone === "bad" ? 5500 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((i) => (
          <div key={i.id} className={cx("anim-up pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-xl", i.tone === "ok" ? "bg-ink" : "bg-bad")}>
            {i.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// -------------------------------------------------------------------- table
export type Column<T> = { key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; className?: string; sort?: string; align?: "end" | "center" };

export function Table<T>({ rows, columns, rowKey, onRow, sort, onSort, dense, empty, selectable, selected, onSelect }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; onRow?: (r: T) => void; sort?: string; onSort?: (s: string) => void; dense?: boolean; empty?: React.ReactNode;
  selectable?: boolean; selected?: Set<string | number>; onSelect?: (s: Set<string | number>) => void;
}) {
  const allSel = selectable && rows.length > 0 && rows.every((r) => selected?.has(rowKey(r)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-start text-xs font-bold text-muted">
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <Checkbox checked={!!allSel} onChange={(v) => onSelect?.(v ? new Set(rows.map(rowKey)) : new Set())} />
              </th>
            )}
            {columns.map((c) => {
              const active = c.sort && sort?.replace("-", "") === c.sort;
              return (
                <th key={c.key} className={cx("px-3 py-2.5 text-start font-bold whitespace-nowrap", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                  {c.sort && onSort ? (
                    <button className={cx("inline-flex items-center gap-1 hover:text-text", active && "text-text")} onClick={() => onSort(active && !sort!.startsWith("-") ? `-${c.sort}` : c.sort!)}>
                      {c.header}
                      <span className="text-[10px]">{active ? (sort!.startsWith("-") ? "▼" : "▲") : ""}</span>
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} onClick={onRow ? () => onRow(r) : undefined} className={cx("border-b border-line/70 last:border-0", onRow && "cursor-pointer hover:bg-card2", selected?.has(k) && "bg-brandsoft/50")}>
                {selectable && (
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={!!selected?.has(k)} onChange={(v) => { const s = new Set(selected); v ? s.add(k) : s.delete(k); onSelect?.(s); }} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cx("px-3", dense ? "py-2" : "py-3", c.align === "end" && "text-end", c.align === "center" && "text-center", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (empty ?? <Empty />)}
    </div>
  );
}

export function Pagination({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const { t, dir } = useT();
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-3 text-sm text-muted">
      <span className="num">{t("common.showing", { from, to, total })}</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("common.prev")}><Prev size={16} /></Button>
        <span className="num px-2 font-semibold text-text">{page} / {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("common.next")}><Next size={16} /></Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: React.ReactNode; count?: number }[] }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((tb) => (
        <button key={tb.value} onClick={() => onChange(tb.value)} className={cx("-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition", value === tb.value ? "border-brand text-text" : "border-transparent text-muted hover:text-text")}>
          {tb.label}
          {tb.count !== undefined && <span className={cx("num rounded-full px-1.5 text-[11px]", value === tb.value ? "bg-brandsoft text-brand" : "bg-card2 text-muted")}>{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KV({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-words">{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "ok" | "warn" | "bad" }) {
  const c = { brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-card2">
      <div className={cx("h-full rounded-full transition-all", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
