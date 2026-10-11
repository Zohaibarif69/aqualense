"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Database, FlaskConical, Info, Inbox, Loader2, X } from "lucide-react";
import type { ObservationCategory, ObservationStatus } from "@/types";
import { CATEGORY, STATUS, rel, fmt, type Tone } from "@/utils/labels";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const TONE: Record<Tone, string> = {
  primary: "bg-primary-light text-primary-dark",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-info-light text-info",
  neutral: "bg-muted text-ink-2",
};
export function Badge({ tone = "neutral", children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONE[tone])}>{icon}{children}</span>;
}
const STATUS_ICON: Record<Tone, ReactNode> = {
  success: <CheckCircle2 size={12} aria-hidden />, warning: <Clock size={12} aria-hidden />, info: <Info size={12} aria-hidden />,
  primary: <CheckCircle2 size={12} aria-hidden />, neutral: <span aria-hidden className="size-1.5 rounded-full bg-current" />, danger: <AlertTriangle size={12} aria-hidden />,
};
export function StatusBadge({ status }: { status: ObservationStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone} icon={STATUS_ICON[s.tone]}>{s.label}</Badge>;
}
export function CategoryBadge({ category }: { category: ObservationCategory }) {
  return <span className="inline-flex rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink">{CATEGORY[category].label}</span>;
}
export const AIBadge = () => <Badge tone="info" icon={<FlaskConical size={12} aria-hidden />}>AI-suggested</Badge>;
export const DemoBadge = ({ className }: { className?: string }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-light px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning", className)}><Database size={11} aria-hidden /> Demo data</span>
);

export function Button({ variant = "primary", size = "md", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  return <button {...p} className={cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
    variant === "primary" && "bg-primary text-white hover:bg-primary-dark",
    variant === "secondary" && "border border-line bg-surface text-ink hover:bg-muted",
    variant === "ghost" && "text-ink-2 hover:bg-muted hover:text-ink",
    variant === "danger" && "bg-danger text-white hover:bg-danger/90",
    className)} />;
}
export const btnLink = (variant: "primary" | "secondary" = "primary") => cx("inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors",
  variant === "primary" ? "bg-primary text-white hover:bg-primary-dark" : "border border-line bg-surface text-ink hover:bg-muted");

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}
export function CardHeader({ title, action, sub }: { title: ReactNode; action?: ReactNode; sub?: ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="text-base font-semibold text-navy">{title}</h2>{sub && <p className="text-[13px] text-ink-2">{sub}</p>}</div>{action}</div>;
}

export function PageHeader({ title, description, actions, meta }: { title: string; description?: string; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy lg:text-[30px]">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-ink-2">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({ label, value, icon, hint, loading }: { label: string; value?: number | string; icon: ReactNode; hint: string; loading?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className="grid size-9 place-items-center rounded-lg bg-primary-light text-primary">{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <div className="mt-2 text-[30px] font-bold leading-tight text-navy tabular-nums">{value ?? "—"}</div>}
      <p className="mt-1 text-xs text-ink-2">{hint}</p>
    </Card>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx("animate-pulse rounded-md bg-muted", className)} />;
export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="space-y-3 p-4" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="flex gap-3"><Skeleton className="size-12 shrink-0" /><div className="flex-1 space-y-2"><Skeleton className="h-3 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
);
export const Spinner = ({ label }: { label?: string }) => <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-2"><Loader2 size={16} className="animate-spin" aria-hidden />{label}</span>;

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-ink-2">{icon ?? <Inbox size={20} aria-hidden />}</span>
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-10 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-danger-light text-danger"><AlertTriangle size={20} aria-hidden /></span>
      <p className="font-semibold text-ink">{message ?? "We could not load this information."}</p>
      {onRetry && <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
export function Notice({ tone = "info", title, children }: { tone?: "info" | "warning" | "danger" | "success"; title?: string; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div className={cx("flex gap-3 rounded-lg p-3 text-sm", TONE[tone])} role={tone === "danger" ? "alert" : undefined}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden /><div className="text-ink">{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}
export function DataFreshnessLabel({ at, stale }: { at?: string; stale?: boolean }) {
  return <span className={cx("inline-flex items-center gap-1 text-xs", stale ? "text-warning" : "text-ink-2")}><Clock size={12} aria-hidden />{at ? `${stale ? "Stale · " : "Updated "}${rel(at)}` : "Update time unknown"}</span>;
}
export const SourceAttribution = ({ source, at }: { source?: string; at?: string }) => (
  <p className="text-xs text-ink-2">Source: {source ?? "Not specified"}{at && ` · ${fmt(at)}`}</p>
);

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-2">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
export const inputCls = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-2/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cx("rounded-full border px-3 py-1 text-[13px] font-medium transition-colors", active ? "border-primary bg-primary-light text-primary-dark" : "border-line bg-surface text-ink-2 hover:text-ink")}>{children}</button>;
}

export function Dialog({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, textarea, input, select")?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-navy/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="w-full max-w-md rounded-2xl bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 id="dlg-title" className="font-semibold text-navy">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-2 hover:bg-muted"><X size={18} /></button></div>
        <div className="px-5 py-4 text-sm text-ink">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

type Toast = { id: number; msg: string; tone: "success" | "danger" | "info" };
const ToastCtx = createContext<(msg: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-20 z-[3000] flex flex-col gap-2 lg:bottom-4">
        {list.map((t) => <div key={t.id} className={cx("flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg", t.tone === "success" ? "bg-success" : t.tone === "danger" ? "bg-danger" : "bg-navy")}>{t.tone === "success" ? <CheckCircle2 size={16} /> : <Info size={16} />}{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
