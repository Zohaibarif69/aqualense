"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Camera, LayoutGrid, List } from "lucide-react";
import { subDays } from "date-fns";
import { useObservations, usePhotos, useSites } from "@/hooks/queries";
import { ObservationCard } from "@/components/observations";
import { Chip, DemoBadge, EmptyState, ErrorState, ListSkeleton, PageHeader, btnLink, cx, inputCls } from "@/components/ui";
import type { ObservationCategory, ObservationStatus } from "@/types";
import { CATEGORY, STATUS } from "@/utils/labels";

const PAGE = 6;
export default function Feed() {
  const [search, setSearch] = useState("");
  const [cats, setCats] = useState<ObservationCategory[]>([]);
  const [st, setSt] = useState<ObservationStatus | "">("");
  const [siteId, setSiteId] = useState("");
  const [days, setDays] = useState(0);
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const from = useMemo(() => (days ? subDays(new Date(), days).toISOString() : undefined), [days]);
  const q = useObservations({ search, categories: cats, statuses: st ? [st] : undefined, siteId: siteId || undefined, from, sort });
  const { data: sites } = useSites();
  const list = q.data ?? [];
  const shown = list.slice(0, page * PAGE);
  const photos = usePhotos(shown.flatMap((o) => o.photoIds));
  const clear = () => { setSearch(""); setCats([]); setSt(""); setSiteId(""); setDays(0); setPage(1); };

  return (
    <>
      <PageHeader title="Observation Feed" description="Public observations across the monitored area. Reporter identities are never shown." meta={<DemoBadge />} actions={<Link href="/app/observations/new" className={btnLink()}><Camera size={16} /> Report Observation</Link>} />
      <div className="mb-4 space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input aria-label="Search observations" className={cx(inputCls, "lg:col-span-2")} placeholder="Search by ID, place, or description" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select aria-label="Verification status" className={inputCls} value={st} onChange={(e) => setSt(e.target.value as ObservationStatus)}><option value="">Any status</option>{Object.entries(STATUS).filter(([k]) => k !== "draft").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select aria-label="Site" className={inputCls} value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">All sites</option>{sites?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select aria-label="Date range" className={inputCls} value={days} onChange={(e) => setDays(+e.target.value)}><option value={0}>All time</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select>
        </div>
        <div className="flex flex-wrap gap-1.5">{(Object.keys(CATEGORY) as ObservationCategory[]).map((c) => <Chip key={c} active={cats.includes(c)} onClick={() => setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c])}>{CATEGORY[c].label}</Chip>)}</div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2" aria-live="polite">{list.length} observations · <button onClick={clear} className="font-semibold text-primary">Clear all filters</button></p>
        <div className="flex items-center gap-2">
          <select aria-label="Sort" className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as "newest")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          <div className="flex rounded-lg border border-line bg-surface p-0.5">{(["grid", "list"] as const).map((v) => <button key={v} aria-label={`${v} view`} aria-pressed={view === v} onClick={() => setView(v)} className={cx("rounded-md p-1.5", view === v ? "bg-primary-light text-primary" : "text-ink-2")}>{v === "grid" ? <LayoutGrid size={16} /> : <List size={16} />}</button>)}</div>
        </div>
      </div>
      {q.isLoading ? <ListSkeleton rows={6} /> : q.isError ? <ErrorState message="We could not load observations. Try again." onRetry={() => q.refetch()} /> : list.length === 0 ? <EmptyState title="No observations match these filters." action={<button onClick={clear} className={btnLink("secondary")}>Clear filters</button>} /> : (
        <>
          <div className={view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>{shown.map((o) => <ObservationCard key={o.id} o={o} layout={view} photo={photos.data?.find((p) => p.id === o.photoIds[0])} hasAI={!!o.aiAnalysisId} />)}</div>
          {shown.length < list.length && <div className="mt-6 text-center"><button onClick={() => setPage(page + 1)} className={btnLink("secondary")}>Load more ({list.length - shown.length} remaining)</button></div>}
        </>
      )}
    </>
  );
}
