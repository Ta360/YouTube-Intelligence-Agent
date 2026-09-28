import { useState, type FormEvent, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, MessageSquareOff, Search, ThumbsUp, X } from "lucide-react";
import { Segmented } from "@/components/charts/Charts";
import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api";
import { compact, full, timeAgo } from "@/lib/format";
import type { Comment, CommentThread, Video } from "@/lib/types";
import { cn } from "@/lib/utils";
import { playerControls } from "./youtubeIframe";

const TIMESTAMP_RE = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;

/** Plain-text comment with clickable timestamps that seek the dashboard player. Never rendered as HTML. */
function CommentText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TIMESTAMP_RE)) {
    const [raw, h, mi, s] = m;
    const secs = Number(h ?? 0) * 3600 + Number(mi) * 60 + Number(s);
    if (Number(s) > 59) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      <button key={m.index} type="button" onClick={() => playerControls.seek?.(secs)} className="cursor-pointer font-medium text-primary hover:underline" title={`Jump to ${raw}`}>
        {raw}
      </button>,
    );
    last = m.index! + raw.length;
  }
  parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{parts}</p>;
}

function Avatar({ c, small }: { c: Comment; small?: boolean }) {
  const size = small ? "size-7" : "size-9";
  return c.authorAvatarUrl ? (
    <img src={c.authorAvatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn(size, "shrink-0 rounded-full bg-muted object-cover")} />
  ) : (
    <div className={cn(size, "grid shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary")}>{c.authorName.replace(/^@/, "").slice(0, 1).toUpperCase()}</div>
  );
}

function CommentBody({ c, isOwner, small }: { c: Comment; isOwner: boolean; small?: boolean }) {
  return (
    <div className="flex gap-3">
      <Avatar c={c} small={small} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs">
          {c.authorChannelUrl ? (
            <a href={c.authorChannelUrl} target="_blank" rel="noopener noreferrer nofollow" className={cn("font-semibold hover:underline", isOwner && "rounded bg-muted px-1.5")}>
              {c.authorName}
            </a>
          ) : (
            <span className="font-semibold">{c.authorName}</span>
          )}
          <span className="text-muted-foreground" title={c.publishedAt ?? undefined}>
            {timeAgo(c.publishedAt)}
            {c.updatedAt && c.publishedAt && c.updatedAt !== c.publishedAt ? " (edited)" : ""}
          </span>
        </p>
        <CommentText text={c.text} />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ThumbsUp className="size-3.5" /> {compact(c.likeCount)}
        </p>
      </div>
    </div>
  );
}

function Thread({ t, ownerName }: { t: CommentThread; ownerName: string }) {
  const [open, setOpen] = useState(false);
  const needsMore = t.replyCount > t.replies.length;
  const all = useQuery({ queryKey: ["replies", t.id], queryFn: () => api.replies(t.id), enabled: open && needsMore, staleTime: 5 * 60_000 });
  // comments.list returns newest first; show oldest first like YouTube.
  const replies = all.data ? [...all.data.items].reverse() : t.replies;
  const isOwner = (c: Comment) => c.authorName.replace(/^@/, "").toLowerCase().replace(/\s/g, "") === ownerName.toLowerCase().replace(/\s/g, "");
  return (
    <li className="space-y-2 border-b py-3 last:border-0">
      <CommentBody c={t} isOwner={isOwner(t)} />
      {t.replyCount > 0 && (
        <div className="pl-12">
          <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10" aria-expanded={open}>
            {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />} {full(t.replyCount)} {t.replyCount === 1 ? "reply" : "replies"}
          </button>
          {open && (
            <ul className="mt-2 space-y-3">
              {all.isLoading && <Skeleton className="h-10 w-full" />}
              {all.error ? <p className="text-xs text-danger">{(all.error as Error).message}</p> : null}
              {replies.map((r) => (
                <li key={r.id}>
                  <CommentBody c={r} isOwner={isOwner(r)} small />
                </li>
              ))}
              {all.data?.nextPageToken && <li className="text-xs text-muted-foreground">Showing the first {all.data.items.length} of {full(t.replyCount)} replies.</li>}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Public comments for a video, read inside the dashboard (YouTube commentThreads API — 1 quota unit per page). */
export function CommentsPanel({ video, onClose }: { video: Video; onClose: () => void }) {
  const [order, setOrder] = useState<"relevance" | "time">("relevance");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const comments = useInfiniteQuery({
    queryKey: ["comments", video.id, order, q],
    queryFn: ({ pageParam }) => api.comments(video.id, { order, pageToken: pageParam, q: q || undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextPageToken ?? undefined,
    staleTime: 5 * 60_000,
  });
  const threads = comments.data?.pages.flatMap((p) => p.items) ?? [];
  const disabled = comments.error instanceof ApiError && comments.error.code === "COMMENTS_DISABLED";
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQ(input.trim());
  };

  return (
    <section aria-label="Comments" className="space-y-3 border-t p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <MessageSquare className="size-4 text-primary" /> {video.commentCount !== null ? `${full(video.commentCount)} Comments` : "Comments"}
        </h3>
        {comments.data?.pages[0]?.dataSource === "mock" && <Badge variant="demo">DEMO DATA</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Segmented label="Sort comments" value={order} onChange={setOrder} options={[{ id: "relevance", label: "Top" }, { id: "time", label: "Newest" }]} />
          <form onSubmit={search} className="relative" role="search">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search comments…" aria-label="Search comments" maxLength={100} className="h-8 w-44 pl-8 pr-7 text-xs" />
            {q && (
              <button type="button" onClick={() => (setInput(""), setQ(""))} className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground" aria-label="Clear comment search">
                <X className="size-3.5" />
              </button>
            )}
          </form>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close comments" title="Close comments">
            <X />
          </Button>
        </div>
      </div>

      {comments.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : disabled ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          <MessageSquareOff className="size-5" /> Comments are turned off for this video.
        </div>
      ) : comments.error ? (
        <ErrorState error={comments.error} onRetry={() => void comments.refetch()} compact />
      ) : threads.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{q ? `No comments mention “${q}”.` : "No comments yet."}</p>
      ) : (
        <>
          <ul className="max-h-[36rem] overflow-y-auto pr-1 scrollbar-thin">
            {threads.map((t) => (
              <Thread key={t.id} t={t} ownerName={video.channelTitle} />
            ))}
          </ul>
          {comments.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => void comments.fetchNextPage()} disabled={comments.isFetchingNextPage}>
                {comments.isFetchingNextPage && <Loader2 className="animate-spin" />} Load more comments
              </Button>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Showing {threads.length} public comment threads{q ? ` matching “${q}”` : ""}. Timestamps like 3:12 jump the player to that moment.
          </p>
        </>
      )}
    </section>
  );
}
