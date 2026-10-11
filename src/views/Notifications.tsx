"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/services";
import { useNotifications } from "@/hooks/queries";
import { Button, Card, DemoBadge, EmptyState, ErrorState, ListSkeleton, PageHeader, cx, useToast } from "@/components/ui";
import { rel } from "@/utils/labels";

export default function Notifications() {
  const q = useNotifications();
  const qc = useQueryClient();
  const toast = useToast();
  const mark = useMutation({ mutationFn: (id: string) => api.notifications.markRead(id), onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ["notifications"] }); if (id === "all") toast("All notifications marked as read"); } });
  const list = q.data ?? [];
  return (
    <>
      <PageHeader title="Notifications" description="Updates on your observations and reviews." meta={<DemoBadge />} actions={<Button variant="secondary" onClick={() => mark.mutate("all")} disabled={!list.some((n) => !n.read)}><CheckCheck size={16} />Mark all as read</Button>} />
      <Card>
        {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : list.length === 0 ? <EmptyState icon={<Bell size={20} />} title="No notifications yet" /> : (
          <ul className="divide-y divide-line">{list.map((n) => (
            <li key={n.id} className={cx("flex gap-4 px-5 py-4", !n.read && "bg-primary-light/40")}>
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary")} aria-label={n.read ? "Read" : "Unread"} />
              <div className="flex-1"><p className={cx("text-sm", !n.read && "font-semibold")}>{n.title}</p><p className="text-sm text-ink-2">{n.body}</p><p className="mt-1 text-xs text-ink-2">{rel(n.createdAt)}{n.observationId && <> · <Link href={`/app/observations/${n.observationId}`} onClick={() => mark.mutate(n.id)} className="font-semibold text-primary">View {n.observationId}</Link></>}</p></div>
              {!n.read && <Button size="sm" variant="ghost" onClick={() => mark.mutate(n.id)}>Mark as read</Button>}
            </li>))}</ul>
        )}
      </Card>
    </>
  );
}
