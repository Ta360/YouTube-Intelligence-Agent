import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck, Eye, FlaskConical, Info, ListVideo, MessageSquare, Play, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { DemoBadge, SourceBadge } from "@/components/common/states";
import { useAddToResearch, useIsSaved, usePlay, useToggleSave } from "@/hooks/queries";
import { compact, CONTENT_LABEL, dateShort, duration } from "@/lib/format";
import type { Video } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";

export const VideoCard = memo(function VideoCard({ video, playlistId, dense }: { video: Video; playlistId?: string; dense?: boolean }) {
  const play = usePlay();
  const navigate = useNavigate();
  const openDetails = useAppStore((s) => s.openDetails);
  const setCommentsOpen = useAppStore((s) => s.setCommentsOpen);
  const nowPlaying = useAppStore((s) => s.selectedVideo?.id === video.id);
  const saved = useIsSaved("video", video.id);
  const toggleSave = useToggleSave("video");
  const addToResearch = useAddToResearch();
  const playlist = playlistId ?? video.playlists?.[0]?.id;

  return (
    <Card className={cn("group flex flex-col overflow-hidden transition-shadow hover:shadow-lg hover:shadow-black/20", nowPlaying && "ring-2 ring-primary")} style={{ contentVisibility: "auto", containIntrinsicSize: "360px" }}>
      <button type="button" onClick={() => play(video)} className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted" aria-label={`Play ${video.title}`}>
        {video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">No thumbnail</div>
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/30">
          <span className="grid size-12 scale-90 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
        {video.durationSeconds ? <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white">{duration(video.durationSeconds)}</span> : null}
        <span className="absolute left-2 top-2 flex gap-1">
          {video.contentType !== "VIDEO" && <Badge className="bg-black/70 text-white">{CONTENT_LABEL[video.contentType]}</Badge>}
          {nowPlaying && <Badge className="bg-primary text-white">Now playing</Badge>}
        </span>
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1">
          <SourceBadge source={video.source} />
          <DemoBadge dataSource={video.dataSource} />
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug" title={video.title}>
          {video.title}
        </h3>
        <button type="button" className="w-fit cursor-pointer truncate text-left text-xs text-muted-foreground hover:text-primary" onClick={() => navigate(`/channels/${video.channelId}`)}>
          {video.channelTitle}
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{dateShort(video.publishedAt)}</span>
          <span className="inline-flex items-center gap-1" title="Views">
            <Eye className="size-3.5" /> {compact(video.viewCount)}
          </span>
          {video.likeCount !== null && (
            <span className="inline-flex items-center gap-1" title="Likes">
              <ThumbsUp className="size-3.5" /> {compact(video.likeCount)}
            </span>
          )}
          {video.commentCount !== null && (
            <button
              type="button"
              onClick={() => {
                play(video);
                setCommentsOpen(true);
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded px-1 -mx-1 hover:bg-primary/15 hover:text-primary"
              title="Read comments"
              aria-label={`Read ${video.commentCount} comments`}
            >
              <MessageSquare className="size-3.5" /> {compact(video.commentCount)}
            </button>
          )}
        </div>
        {!dense && video.description && <p className="line-clamp-2 text-xs text-muted-foreground/90">{video.description}</p>}
        {!dense && (
          <p className="text-[11px] text-muted-foreground">
            ID <span className="font-mono">{video.id}</span>
            {video.playlists?.length ? <> · In playlist “{video.playlists[0]!.title}”</> : null}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" onClick={() => play(video)} aria-label="Play in dashboard">
            <Play className="fill-current" /> Play
          </Button>
          <Button size="icon-sm" variant={saved ? "secondary" : "outline"} onClick={() => toggleSave.mutate({ id: video.id, saved })} aria-label={saved ? "Unsave video" : "Save video"} title={saved ? "Saved" : "Save"}>
            {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => openDetails(video.id)} aria-label="View details" title="View details">
            <Info />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => addToResearch.mutate({ kind: "VIDEO", youtubeId: video.id })} aria-label="Add to research" title="Add to research">
            <FlaskConical />
          </Button>
          {playlist && (
            <Button size="icon-sm" variant="outline" onClick={() => navigate(`/playlists/${playlist}`)} aria-label="Open playlist" title="Open playlist">
              <ListVideo />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
});

export function VideoGrid({ videos, playlistId, dense, className }: { videos: Video[]; playlistId?: string; dense?: boolean; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", className)}>
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} playlistId={playlistId} dense={dense} />
      ))}
    </div>
  );
}
