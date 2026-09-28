import { useNavigate } from "react-router-dom";
import { AlertTriangle, ExternalLink, Eye, Globe, ListVideo, Play, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { DemoBadge, SourceBadge } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { VideoGrid } from "@/components/video/VideoCard";
import { PlaylistGrid } from "@/components/video/Cards";
import { usePlay } from "@/hooks/queries";
import { api } from "@/lib/api";
import { compact, dateShort, full, pct } from "@/lib/format";
import type { AgentPayload, ResearchResult as RR, Video } from "@/lib/types";
import { cn } from "@/lib/utils";

function CompactVideo({ v }: { v: Video }) {
  const play = usePlay();
  return (
    <div className="flex gap-2.5 rounded-lg p-1.5 hover:bg-accent">
      <button type="button" onClick={() => play(v)} className="relative aspect-video w-28 shrink-0 cursor-pointer overflow-hidden rounded-md bg-muted" aria-label={`Play ${v.title}`}>
        {v.thumbnailUrl && <img src={v.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />}
        <span className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
          <Play className="size-5 fill-white text-white" />
        </span>
      </button>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug">{v.title}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {v.channelTitle} · {dateShort(v.publishedAt)}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Eye className="size-3" /> {compact(v.viewCount)}
          </span>
          <SourceBadge source={v.source} />
          <Button size="sm" className="ml-auto h-6 px-2 text-[11px]" onClick={() => play(v)}>
            <Play className="size-3 fill-current" /> Play
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Structured research result — compact (agent panel) or full (dashboard page). */
export function ResearchResultView({ payload, query, full: isFull }: { payload: AgentPayload; query?: string; full?: boolean }) {
  const navigate = useNavigate();
  if (payload.kind === "help") return null;

  const save = async () => {
    try {
      await api.saveResearch({ kind: "AI_SESSION", title: payload.title, query, payload: payload as unknown as Record<string, unknown> });
      toast.success("Research saved");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (payload.kind === "activity") {
    const c = payload.summary.current;
    return (
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <p className="text-sm font-semibold">{payload.title}</p>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Searches" value={c.totalSearches} />
          <Field label="Creators" value={c.creatorsResearched} />
          <Field label="Videos" value={compact(c.videosFound)} />
          <Field label="Playlists" value={c.playlistsFound} />
          <Field label="Saved" value={c.savedVideos} />
          <Field label="AI sessions" value={c.aiSessions} />
        </div>
        <Button size="sm" variant="outline" onClick={() => navigate("/history")}>
          Open search history
        </Button>
      </div>
    );
  }

  if (payload.kind === "compare") {
    return (
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{payload.title}</p>
          <DemoBadge dataSource={payload.dataSource} />
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[26rem] text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 text-left font-medium">Creator</th>
                <th className="px-2 text-right font-medium">Subs</th>
                <th className="px-2 text-right font-medium">Uploads ({payload.comparison.days}d)</th>
                <th className="px-2 text-right font-medium">Avg views</th>
                <th className="pl-2 text-right font-medium">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {payload.comparison.creators.map((c) => (
                <tr key={c.channelId} className="border-t">
                  <td className="py-1.5 pr-2">
                    <button type="button" className="cursor-pointer font-medium hover:text-primary" onClick={() => navigate(`/channels/${c.channelId}`)}>
                      {c.title}
                    </button>
                  </td>
                  <td className="px-2 text-right tabular-nums">{compact(c.subscriberCount)}</td>
                  <td className="px-2 text-right tabular-nums">{c.window.count}</td>
                  <td className="px-2 text-right tabular-nums">{compact(c.window.avgViews)}</td>
                  <td className="pl-2 text-right tabular-nums">{pct(c.window.avgEngagement, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {payload.warnings.map((w) => (
          <p key={w} className="flex gap-1.5 text-[11px] text-warning">
            <AlertTriangle className="mt-px size-3 shrink-0" /> {w}
          </p>
        ))}
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => navigate("/research")}>
            Open research workspace
          </Button>
          <Button size="sm" variant="ghost" onClick={save}>
            <Save /> Save
          </Button>
        </div>
      </div>
    );
  }

  const r: RR = payload;
  return (
    <div className={cn("space-y-3 rounded-xl border bg-muted/30 p-3", isFull && "p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Research Result</p>
        <DemoBadge dataSource={r.dataSource} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        <Field label="Person" value={r.person ?? "—"} />
        <Field label="YouTube Channel" value={r.channel ? r.channel.title : "—"} />
        <Field label="Videos Found" value={full(r.videosFound)} />
        <Field label="Playlists Found" value={full(r.playlistsFound)} />
        <Field label="Latest Video" value={r.latestVideo?.title ?? "—"} />
        {r.channel && <Field label="Subscribers" value={compact(r.channel.subscriberCount)} />}
      </div>
      {r.filters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {r.filters.map((f) => (
            <Badge key={f} variant="outline">
              {f}
            </Badge>
          ))}
        </div>
      )}
      {r.warnings.map((w) => (
        <p key={w} className="flex gap-1.5 text-[11px] text-warning">
          <AlertTriangle className="mt-px size-3 shrink-0" /> {w}
        </p>
      ))}
      {r.candidates.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Not the right channel? Also matched:{" "}
          {r.candidates.map((c, i) => (
            <button key={c.id} type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => navigate(`/channels/${c.id}`)}>
              {c.title}
              {i < r.candidates.length - 1 ? ", " : ""}
            </button>
          ))}
        </p>
      )}

      {isFull ? (
        <>
          {r.videos.length > 0 && <VideoGrid videos={r.videos} dense />}
          {r.playlists.length > 0 && (
            <>
              <p className="pt-2 text-sm font-semibold">Playlists</p>
              <PlaylistGrid playlists={r.playlists} />
            </>
          )}
        </>
      ) : (
        <>
          {r.videos.length > 0 && (
            <div className="-mx-1.5 space-y-0.5">
              {r.videos.slice(0, 6).map((v) => (
                <CompactVideo key={`${v.id}-${v.source}`} v={v} />
              ))}
            </div>
          )}
          {r.playlists.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Playlists</p>
              {r.playlists.slice(0, 4).map((p) => (
                <button key={p.id} type="button" onClick={() => navigate(`/playlists/${p.id}`)} className="flex w-full cursor-pointer items-center gap-2 rounded-lg p-1.5 text-left text-xs hover:bg-accent">
                  <ListVideo className="size-4 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="text-muted-foreground">{p.itemCount ?? "?"}</span>
                  <SourceBadge source={p.source} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {r.web.length > 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Globe className="size-3.5" /> Web Search — third-party sources, not verified
          </p>
          {r.web.slice(0, isFull ? 12 : 5).map((w) => (
            <a key={w.url} href={w.url} target="_blank" rel="noopener noreferrer nofollow" className="block rounded-lg p-1.5 text-xs hover:bg-accent">
              <span className="flex items-center gap-1.5">
                <SourceBadge source="Web Search" />
                <span className="truncate font-medium">{w.title}</span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {w.domain}
                {w.youtube?.videoId ? " · YouTube video (playable above)" : ""} — {w.snippet}
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {r.channel && (
          <Button size="sm" variant="outline" onClick={() => navigate(`/channels/${r.channel!.id}`)}>
            <UserRound /> Creator profile
          </Button>
        )}
        {!isFull && (
          <Button size="sm" variant="outline" onClick={() => navigate("/agent")}>
            View all in dashboard
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={save}>
          <Save /> Save research
        </Button>
      </div>
    </div>
  );
}
