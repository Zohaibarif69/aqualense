"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Camera, ChevronRight } from "lucide-react";
import { useObservations, usePhotos, useUser } from "@/hooks/queries";
import { Thumb } from "@/components/observations";
import { Card, EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge, btnLink, inputCls } from "@/components/ui";
import type { ObservationStatus } from "@/types";
import { CATEGORY, STATUS, fmt } from "@/utils/labels";

export default function MyReports() {
  const { data: user } = useUser();
  const [search, setSearch] = useState("");
  const [st, setSt] = useState<ObservationStatus | "">("");
  const q = useObservations({ submittedBy: user?.id, search, statuses: st ? [st] : undefined });
  const list = user?.role === "citizen" || !user ? q.data ?? [] : q.data ?? [];
  const photos = usePhotos(list.flatMap((o) => o.photoIds));
  const needs = list.filter((o) => o.status === "more_information_requested").length;
  return (
    <>
      <PageHeader title="My Reports" description="Track the observations you've submitted." actions={<Link href="/app/observations/new" className={btnLink()}><Camera size={16} />Report Observation</Link>} />
      {needs > 0 && <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning-light p-4 text-sm"><AlertCircle size={18} className="text-warning" /><span><strong>{needs} report{needs > 1 ? "s need" : " needs"} your input.</strong> A reviewer requested more information.</span></div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_240px]">
        <input aria-label="Search my reports" className={inputCls} placeholder="Search by ID, place, or description" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" className={inputCls} value={st} onChange={(e) => setSt(e.target.value as ObservationStatus)}><option value="">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>
      <Card>
        {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : list.length === 0 ? <EmptyState title={search || st ? "No reports match these filters." : "You have not submitted any observations yet."} action={<Link href="/app/observations/new" className={btnLink()}>Report your first observation</Link>} /> : (
          <ul className="divide-y divide-line">{list.map((o) => (
            <li key={o.id}><Link href={`/app/observations/${o.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/60">
              <Thumb photo={photos.data?.find((p) => p.id === o.photoIds[0])} alt={`Observation ${o.id}`} className="size-16 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{o.categories.map((c) => CATEGORY[c].label).join(", ")}</p><StatusBadge status={o.status} /></div>
                <p className="text-sm text-ink-2">{o.location.placeName} · {o.id} · {fmt(o.createdAt)}</p>
                <p className="mt-0.5 text-[13px] text-ink">{STATUS[o.status].citizen}</p>
              </div>
              <ChevronRight size={18} className="text-ink-2" />
            </Link></li>))}</ul>
        )}
      </Card>
    </>
  );
}
