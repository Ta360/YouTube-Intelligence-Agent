import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bookmark, BookmarkCheck, Check, ChevronDown, ChevronUp, Copy, ExternalLink, Eye, FlaskConical, Info, Maximize2, MessageSquare, Minimize2, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { DemoBadge } from "@/components/common/states";
import { useAddToResearch, useIsSaved, usePlay, useToggleSave } from "@/hooks/queries";
import { api } from "@/lib/api";
import { compact, CONTENT_LABEL, dateShort, duration, full } from "@/lib/format";
import type { Video } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { CommentsPanel } from "./CommentsPanel";
import { loadYouTubeIframeApi, PLAYER_STATE, playerControls, playerErrorMessage, type YTPlayer } from "./youtubeIframe";

/**
 * The dashboard's single embedded player. It lives in the layout, so playback continues while
 * navigating, and selecting another video swaps it in place (no new tabs). Uses YouTube's own
 * IFrame player (privacy-enhanced youtube-nocookie.com host) — play, pause, volume, seek and
 * fullscreen are YouTube's native controls.
 */
export function VideoPlayer() {
  const video = useAppStore((s) => s.selectedVideo);
  const state = useAppStore((s) => s.playerState);
  const setState = useAppStore((s) => s.setPlayerState);
  const close = useAppStore((s) => s.closePlayer);
  const commentsOpen = useAppStore((s) => s.commentsOpen);
  const setCommentsOpen = useAppStore((s) => s.setCommentsOpen);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentId = useRef<string | null>(null);
  const [embedBlocked, setEmbedBlocked] = useState(false);

  const isDemo = video?.dataSource === "mock";

  useEffect(() => {
    if (!video) return;
    if (isDemo) {
      playerRef.current?.pauseVideo();
      return;
    }
    let cancelled = false;
    setEmbedBlocked(false);
    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        if (playerRef.current) {
          if (currentId.current !== video.id) {
            currentId.current = video.id;
            playerRef.current.loadVideoById(video.id);
          }
          return;
        }
        const mount = document.createElement("div");
        hostRef.current.replaceChildren(mount);
        currentId.current = video.id;
        playerRef.current = new YT.Player(mount, {
          videoId: video.id,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, origin: window.location.origin },
          events: {
            onReady: (e) => {
              e.target.playVideo();
              playerControls.seek = (seconds) => {
                e.target.seekTo(seconds, true);
                e.target.playVideo();
                hostRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              };
            },
            onStateChange: (e) => setState({ status: PLAYER_STATE[e.data] ?? "paused", error: null }),
            onError: (e) => {
              const m = playerErrorMessage(e.data);
              setEmbedBlocked(m.embeddingBlocked);
              setState({ status: "error", error: m.text });
            },
          },
        });
      })
      .catch((err: Error) => setState({ status: "error", error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [video, isDemo, setState]);

  // Tear the player down when it is closed.
  useEffect(() => {
    if (video) return;
    playerRef.current?.destroy();
    playerRef.current = null;
    playerControls.seek = null;
    currentId.current = null;
  }, [video]);

  if (!video) return null;
  const minimized = state.minimized;

  return (
    <section
      aria-label="Video player"
      className={cn(
        minimized
          ? "fixed bottom-20 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] md:bottom-4"
          : "relative",
      )}
    >
      <Card className={cn("overflow-hidden", minimized ? "shadow-2xl shadow-black/40" : "")}>
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", state.status === "playing" ? "bg-success" : state.status === "error" ? "bg-danger" : "bg-warning")} aria-hidden />
            <span className="truncate font-medium">{minimized ? video.title : "Now playing"}</span>
            {!minimized && <DemoBadge dataSource={video.dataSource} />}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => setState({ minimized: !minimized })} aria-label={minimized ? "Expand player" : "Minimize player"} title={minimized ? "Expand" : "Mini player"}>
              {minimized ? <Maximize2 /> : <Minimize2 />}
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={close} aria-label="Close player" title="Close">
              <X />
            </Button>
          </div>
        </div>

        <div className={cn(!minimized && "grid gap-0 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]")}>
          <div className="relative aspect-video w-full bg-black">
            {/* Always mounted so the YouTube player survives switching to/from demo items. */}
            <div ref={hostRef} className={cn("absolute inset-0 [&>iframe]:size-full", isDemo && "invisible")} />
            {isDemo && (
              <div className="absolute inset-0 grid place-items-center p-6 text-center text-white/90">
                <div className="max-w-sm space-y-2">
                  <Badge variant="demo">DEMO DATA</Badge>
                  <p className="text-sm">This is a fictional demo video, so there is nothing to play. Add YOUTUBE_API_KEY to server/.env to research and play real YouTube videos here.</p>
                </div>
              </div>
            )}
            {state.status === "error" && state.error && (
              <div className="absolute inset-0 grid place-items-center bg-black/85 p-6 text-center text-white">
                <div className="max-w-sm space-y-3">
                  <AlertTriangle className="mx-auto size-8 text-warning" />
                  <p className="text-sm">{state.error}</p>
                  {embedBlocked && (
                    <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25">
                      Watch on YouTube <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          {!minimized && <NowPlayingDetails video={video} />}
        </div>
        {!minimized && commentsOpen && <CommentsPanel video={video} onClose={() => setCommentsOpen(false)} />}
        {!minimized && <RelatedStrip video={video} />}
      </Card>
    </section>
  );
}

function NowPlayingDetails({ video: initial }: { video: Video }) {
  const navigate = useNavigate();
  const openDetails = useAppStore((s) => s.openDetails);
  const commentsOpen = useAppStore((s) => s.commentsOpen);
  const setCommentsOpen = useAppStore((s) => s.setCommentsOpen);
  const { data } = useQuery({ queryKey: ["video", initial.id], queryFn: () => api.video(initial.id), enabled: initial.dataSource === "youtube" || initial.dataSource === "mock", staleTime: 5 * 60_000, placeholderData: initial });
  const video = data ?? initial;
  const saved = useIsSaved("video", video.id);
  const toggle = useToggleSave("video");
  const add = useAddToResearch();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(video.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 p-4 xl:max-h-[30rem] xl:overflow-y-auto xl:border-l scrollbar-thin">
      <div className="flex flex-wrap gap-1">
        {video.contentType !== "VIDEO" && <Badge variant="info">{CONTENT_LABEL[video.contentType]}</Badge>}
        {video.categoryName && <Badge variant="secondary">{video.categoryName}</Badge>}
        {video.durationSeconds ? <Badge variant="outline">{duration(video.durationSeconds)}</Badge> : null}
      </div>
      <h2 className="text-base font-semibold leading-snug">{video.title}</h2>
      <button type="button" onClick={() => navigate(`/channels/${video.channelId}`)} className="w-fit cursor-pointer text-sm font-medium text-primary hover:underline">
        {video.channelTitle}
      </button>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Published" value={dateShort(video.publishedAt)} />
        <Stat label="Views" value={full(video.viewCount)} icon={<Eye className="size-3.5" />} />
        <Stat label="Likes" value={full(video.likeCount)} icon={<ThumbsUp className="size-3.5" />} />
        <Stat
          label="Comments"
          value={full(video.commentCount)}
          icon={<MessageSquare className="size-3.5" />}
          active={commentsOpen}
          onClick={() => {
            setCommentsOpen(!commentsOpen);
            if (!commentsOpen) setTimeout(() => document.querySelector("section[aria-label=Comments]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
          }}
          hint={commentsOpen ? "Hide comments" : "Read comments"}
        />
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{video.url}</span>
        <Button size="icon-sm" variant="ghost" onClick={copy} aria-label="Copy video URL">
          {copied ? <Check className="text-success" /> : <Copy />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant={saved ? "secondary" : "outline"} onClick={() => toggle.mutate({ id: video.id, saved })}>
          {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />} {saved ? "Saved" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => add.mutate({ kind: "VIDEO", youtubeId: video.id })}>
          <FlaskConical /> Research
        </Button>
        <Button size="sm" variant="outline" onClick={() => openDetails(video.id)}>
          <Info /> Details
        </Button>
      </div>
      {video.description && (
        <div>
          <p className={cn("whitespace-pre-line break-words text-sm text-muted-foreground", !expanded && "line-clamp-2")}>{video.description}</p>
          <button type="button" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary" onClick={() => setExpanded((e) => !e)}>
            {expanded ? (
              <>
                Show less <ChevronUp className="size-3.5" />
              </>
            ) : (
              <>
                Show more <ChevronDown className="size-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, onClick, active, hint }: { label: string; value: string; icon?: React.ReactNode; onClick?: () => void; active?: boolean; hint?: string }) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={active}
        title={hint}
        className={cn("group cursor-pointer rounded-lg px-2.5 py-1.5 text-left ring-1 ring-primary/30 transition-colors hover:bg-primary/15 hover:ring-primary/60", active ? "bg-primary/20 ring-primary" : "bg-muted/50")}
      >
        <p className="flex items-center justify-between text-[11px] text-muted-foreground">
          {label} <span className="font-medium text-primary">{hint}</span>
        </p>
        <p className="inline-flex items-center gap-1 font-semibold">
          {icon}
          {value}
        </p>
      </button>
    );
  }
  return (
    <div className="rounded-lg bg-muted/50 px-2.5 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="inline-flex items-center gap-1 font-semibold">
        {icon}
        {value}
      </p>
    </div>
  );
}

function RelatedStrip({ video }: { video: Video }) {
  const play = usePlay();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["related", video.id], queryFn: () => api.related(video.id), staleTime: 5 * 60_000, retry: false });
  if (!isLoading && !data?.videos.length && !data?.playlists.length) return null;
  return (
    <div className="space-y-3 border-t p-4">
      <p className="text-sm font-semibold">More from {video.channelTitle}</p>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
        {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="aspect-video w-48 shrink-0 rounded-lg" />)}
        {data?.videos.map((v) => (
          <button key={v.id} type="button" onClick={() => play(v)} className="group w-48 shrink-0 cursor-pointer text-left">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
              {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />}
              {v.durationSeconds ? <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] text-white">{duration(v.durationSeconds)}</span> : null}
            </div>
            <p className="mt-1 line-clamp-2 text-xs font-medium">{v.title}</p>
            <p className="text-[11px] text-muted-foreground">{compact(v.viewCount)} views</p>
          </button>
        ))}
      </div>
      {data?.playlists.length ? (
        <>
          <p className="text-sm font-semibold">Related playlists</p>
          <div className="flex flex-wrap gap-2">
            {data.playlists.map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => navigate(`/playlists/${p.id}`)}>
                {p.title.slice(0, 40)} <span className="text-muted-foreground">· {p.itemCount ?? "?"}</span>
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
