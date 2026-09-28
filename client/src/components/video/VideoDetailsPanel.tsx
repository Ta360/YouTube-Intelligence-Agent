import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck, FlaskConical, ListVideo, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Sheet, Skeleton } from "@/components/ui/primitives";
import { DemoBadge, ErrorState } from "@/components/common/states";
import { useAddToResearch, useIsSaved, usePlay, useToggleSave } from "@/hooks/queries";
import { api } from "@/lib/api";
import { CONTENT_LABEL, dateTime, duration, full, pct, engagement } from "@/lib/format";
import { useAppStore } from "@/store/appStore";

/** Slide-over with every available detail for the selected video. */
export function VideoDetailsPanel() {
  const id = useAppStore((s) => s.detailsVideoId);
  const openDetails = useAppStore((s) => s.openDetails);
  return (
    <Sheet open={Boolean(id)} onClose={() => openDetails(null)} title="Video details" className="max-w-lg">
      {id && <Details id={id} onClose={() => openDetails(null)} />}
    </Sheet>
  );
}

function Details({ id, onClose }: { id: string; onClose: () => void }) {
  const navigate = useNavigate();
  const play = usePlay();
  const { data: v, isLoading, error, refetch } = useQuery({ queryKey: ["video", id], queryFn: () => api.video(id), staleTime: 5 * 60_000 });
  const saved = useIsSaved("video", id);
  const toggle = useToggleSave("video");
  const add = useAddToResearch();

  if (isLoading)
    return (
      <div className="space-y-3 p-5">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  if (error || !v) return <ErrorState error={error} onRetry={() => void refetch()} className="m-5" />;

  const rows: [string, React.ReactNode][] = [
    ["Channel", <button key="c" className="cursor-pointer text-primary hover:underline" onClick={() => (onClose(), navigate(`/channels/${v.channelId}`))}>{v.channelTitle}</button>],
    ["Published", dateTime(v.publishedAt)],
    ["Duration", duration(v.durationSeconds) || "—"],
    ["Views", full(v.viewCount)],
    ["Likes", v.likeCount === null ? "Hidden by owner" : full(v.likeCount)],
    [
      "Comments",
      v.commentCount === null ? (
        "Disabled / hidden"
      ) : (
        <button key="cm" className="cursor-pointer text-primary hover:underline" onClick={() => (play(v), useAppStore.getState().setCommentsOpen(true), onClose())}>
          {full(v.commentCount)} · Read comments
        </button>
      ),
    ],
    ["Engagement", pct(engagement(v), 2)],
    ["Type", CONTENT_LABEL[v.contentType]],
    ["Category", v.categoryName ?? "—"],
    ["Language", v.defaultLanguage ?? "—"],
    ["Video ID", <span key="id" className="font-mono">{v.id}</span>],
    ["Embeddable", v.embeddable === null ? "—" : v.embeddable ? "Yes" : "No"],
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="relative aspect-video w-full shrink-0 bg-muted">{v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />}</div>
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-1">
          <DemoBadge dataSource={v.dataSource} />
          {v.contentType !== "VIDEO" && <Badge variant="info">{CONTENT_LABEL[v.contentType]}</Badge>}
        </div>
        <h2 className="text-lg font-semibold leading-snug">{v.title}</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => (play(v), onClose())}>
            <Play className="fill-current" /> Play
          </Button>
          <Button variant={saved ? "secondary" : "outline"} onClick={() => toggle.mutate({ id: v.id, saved })}>
            {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />} {saved ? "Saved" : "Save"}
          </Button>
          <Button variant="outline" onClick={() => add.mutate({ kind: "VIDEO", youtubeId: v.id })}>
            <FlaskConical /> Add to research
          </Button>
        </div>
        <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
          {rows.map(([k, val]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0 break-words">{val}</dd>
            </div>
          ))}
        </dl>
        {v.playlists && v.playlists.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Playlists</p>
            <div className="flex flex-wrap gap-1.5">
              {v.playlists.map((p) => (
                <Button key={p.id} size="sm" variant="outline" onClick={() => (onClose(), navigate(`/playlists/${p.id}`))}>
                  <ListVideo /> {p.title.slice(0, 36)}
                </Button>
              ))}
            </div>
          </div>
        )}
        {v.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Tags</p>
            <div className="flex flex-wrap gap-1">
              {v.tags.slice(0, 30).map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {v.description && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Description</p>
            <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{v.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
