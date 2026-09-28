import { useNavigate } from "react-router-dom";
import { Bookmark, BookmarkCheck, FlaskConical, ListVideo, Users, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { DemoBadge, SourceBadge } from "@/components/common/states";
import { useAddToResearch, useIsSaved, useToggleSave } from "@/hooks/queries";
import { compact, dateShort } from "@/lib/format";
import type { Channel, Playlist } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const navigate = useNavigate();
  const saved = useIsSaved("playlist", playlist.id);
  const toggle = useToggleSave("playlist");
  const add = useAddToResearch();
  return (
    <Card className="group flex flex-col overflow-hidden" style={{ contentVisibility: "auto", containIntrinsicSize: "300px" }}>
      <button type="button" onClick={() => navigate(`/playlists/${playlist.id}`)} className="relative aspect-video cursor-pointer overflow-hidden bg-muted" aria-label={`Open playlist ${playlist.title}`}>
        {playlist.thumbnailUrl && <img src={playlist.thumbnailUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
        <span className="absolute inset-y-0 right-0 flex w-2/5 flex-col items-center justify-center gap-1 bg-black/70 text-white">
          <ListVideo className="size-5" />
          <span className="text-sm font-semibold">{playlist.itemCount ?? "?"}</span>
          <span className="text-[10px] uppercase tracking-wide opacity-80">videos</span>
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap gap-1">
          <SourceBadge source={playlist.source} />
          <DemoBadge dataSource={playlist.dataSource} />
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold">{playlist.title}</h3>
        <button type="button" onClick={() => navigate(`/channels/${playlist.channelId}`)} className="w-fit cursor-pointer truncate text-xs text-muted-foreground hover:text-primary">
          {playlist.channelTitle}
        </button>
        <p className="text-xs text-muted-foreground">Created {dateShort(playlist.publishedAt)}</p>
        <div className="mt-auto flex gap-1.5 pt-1">
          <Button size="sm" variant="secondary" onClick={() => navigate(`/playlists/${playlist.id}`)}>
            <ListVideo /> Open playlist
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => toggle.mutate({ id: playlist.id, saved })} aria-label={saved ? "Unsave playlist" : "Save playlist"}>
            {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => add.mutate({ kind: "PLAYLIST", youtubeId: playlist.id })} aria-label="Add to research" title="Add to research">
            <FlaskConical />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PlaylistGrid({ playlists, className }: { playlists: Playlist[]; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", className)}>
      {playlists.map((p) => (
        <PlaylistCard key={p.id} playlist={p} />
      ))}
    </div>
  );
}

export function Avatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return src ? (
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("size-10 shrink-0 rounded-full bg-muted object-cover", className)} />
  ) : (
    <div className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-primary/20 font-bold text-primary", className)}>{name.slice(0, 1).toUpperCase()}</div>
  );
}

export function ChannelCard({ channel, onSelect, active }: { channel: Channel; onSelect?: () => void; active?: boolean }) {
  const navigate = useNavigate();
  const saved = useIsSaved("channel", channel.id);
  const toggle = useToggleSave("channel");
  const add = useAddToResearch();
  return (
    <Card className={cn("flex flex-col gap-3 p-4", active && "ring-2 ring-primary")}>
      <button type="button" className="flex cursor-pointer items-center gap-3 text-left" onClick={onSelect ?? (() => navigate(`/channels/${channel.id}`))}>
        <Avatar src={channel.thumbnailUrl} name={channel.title} className="size-12" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{channel.title}</p>
          <p className="truncate text-xs text-muted-foreground">{channel.handle ?? channel.id}</p>
        </div>
      </button>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" /> {channel.hiddenSubscriberCount ? "Hidden" : compact(channel.subscriberCount)}
        </span>
        <span className="inline-flex items-center gap-1">
          <VideoIcon className="size-3.5" /> {compact(channel.videoCount)} videos
        </span>
        <DemoBadge dataSource={channel.dataSource} />
      </div>
      <div className="mt-auto flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={() => navigate(`/channels/${channel.id}`)}>
          View profile
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => toggle.mutate({ id: channel.id, saved })} aria-label={saved ? "Unsave creator" : "Save creator"}>
          {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => add.mutate({ kind: "CHANNEL", youtubeId: channel.id })} aria-label="Add to research" title="Add to research">
          <FlaskConical />
        </Button>
      </div>
    </Card>
  );
}
