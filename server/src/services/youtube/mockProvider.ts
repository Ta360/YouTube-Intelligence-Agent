/**
 * DEMO DATA provider — used when no YOUTUBE_API_KEY is configured (and in tests).
 * All channels are fictional; every record is stored with dataSource = "mock" and the UI
 * labels it DEMO DATA. Demo videos are not real YouTube videos and cannot be played.
 */
import { AppError } from "../../lib/errors.js";
import type { ChannelRecord, CommentRecord, CommentThreadRecord, Page, PlaylistRecord, VideoRecord, VideoSearchParams, YouTubeProvider } from "./types.js";

interface DemoChannelSeed {
  code: string;
  title: string;
  handle: string;
  topic: string;
  words: string[];
  subscribers: number;
  country: string;
  since: string;
}

const SEEDS: DemoChannelSeed[] = [
  { code: "nova", title: "Nova Labs", handle: "@novalabs", topic: "Technology", words: ["AI", "Machine Learning", "Robotics", "GPT", "Neural Networks", "Coding"], subscribers: 2_450_000, country: "US", since: "2016-03-14" },
  { code: "aria", title: "Chef Aria", handle: "@chefaria", topic: "Food", words: ["Pasta", "Street Food", "Baking", "Curry", "Quick Meals", "Desserts"], subscribers: 980_000, country: "IN", since: "2018-07-02" },
  { code: "pixl", title: "Pixel Trail", handle: "@pixeltrail", topic: "Gaming", words: ["Speedrun", "Minecraft", "Indie Games", "Retro", "Boss Fight", "Game Dev"], subscribers: 5_120_000, country: "GB", since: "2014-11-20" },
  { code: "orbt", title: "Orbit Academy", handle: "@orbitacademy", topic: "Science", words: ["Space", "Black Holes", "Physics", "Mars", "Quantum", "AI in Science"], subscribers: 1_310_000, country: "CA", since: "2017-01-09" },
];

const DAY = 86_400_000;
const NOW = () => Date.now();

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const channelId = (code: string) => `UCdemo${code.padEnd(18, "0")}`;
const videoId = (code: string, i: number) => `dm${code.slice(0, 3)}${String(i).padStart(6, "0")}`;
const playlistId = (code: string, i: number) => `PLdemo${code}${String(i).padStart(6, "0")}`;

const VIDEO_TEMPLATES = ["{w} explained in 10 minutes", "I tried {w} for 30 days", "The truth about {w}", "{w}: beginner to pro", "Top 10 {w} moments", "{w} live Q&A", "Why {w} matters in 2026", "{w} #shorts"];

interface DemoChannel {
  seed: DemoChannelSeed;
  channel: ChannelRecord;
  videos: VideoRecord[];
  playlists: (PlaylistRecord & { videoIds: string[] })[];
}

let DATA: DemoChannel[] | null = null;

function build(): DemoChannel[] {
  return SEEDS.map((seed) => {
    const r = rng(hash(seed.code));
    const videos: VideoRecord[] = [];
    const count = 48;
    for (let i = 0; i < count; i++) {
      const w = seed.words[i % seed.words.length]!;
      const tpl = VIDEO_TEMPLATES[Math.floor(r() * VIDEO_TEMPLATES.length)]!;
      const isShort = tpl.includes("#shorts");
      const ageDays = Math.floor(i * 6.5 + r() * 5);
      const views = BigInt(Math.floor((isShort ? 40_000 : 120_000) + r() * seed.subscribers * (isShort ? 0.8 : 1.6)));
      const liveNow = i === 3;
      videos.push({
        youtubeId: videoId(seed.code, i + 1),
        channelYoutubeId: channelId(seed.code),
        channelTitle: seed.title,
        title: tpl.replace("{w}", w),
        description: `DEMO DATA — a fictional ${seed.topic.toLowerCase()} video about ${w} from ${seed.title}. Configure YOUTUBE_API_KEY for real YouTube results.`,
        thumbnailUrl: `/api/demo-assets/thumb/${videoId(seed.code, i + 1)}.svg`,
        publishedAt: new Date(NOW() - ageDays * DAY - Math.floor(r() * DAY)),
        details: {
          durationSeconds: isShort ? 15 + Math.floor(r() * 45) : 240 + Math.floor(r() * 1800),
          viewCount: views,
          likeCount: (views * BigInt(20 + Math.floor(r() * 40))) / 1000n,
          commentCount: (views * BigInt(1 + Math.floor(r() * 5))) / 1000n,
          tags: [seed.topic, w, seed.title],
          categoryId: seed.topic === "Gaming" ? "20" : seed.topic === "Food" ? "26" : "28",
          liveBroadcastContent: liveNow ? "live" : "none",
          embeddable: true,
          privacyStatus: "public",
          defaultLanguage: "en",
        },
      });
    }
    const playlists = seed.words.slice(0, 4).map((w, i) => {
      const ids = videos.filter((v) => v.title.includes(w)).map((v) => v.youtubeId);
      return {
        youtubeId: playlistId(seed.code, i + 1),
        channelYoutubeId: channelId(seed.code),
        channelTitle: seed.title,
        title: `${w} — full series`,
        description: `DEMO DATA playlist collecting ${seed.title}'s ${w} videos.`,
        thumbnailUrl: ids[0] ? `/api/demo-assets/thumb/${ids[0]}.svg` : null,
        itemCount: ids.length,
        publishedAt: new Date(Date.parse(seed.since) + i * 90 * DAY),
        videoIds: ids,
      };
    });
    const totalViews = videos.reduce((s, v) => s + (v.details?.viewCount ?? 0n), 0n) * 7n;
    return {
      seed,
      videos,
      playlists,
      channel: {
        youtubeId: channelId(seed.code),
        title: seed.title,
        handle: seed.handle,
        customUrl: seed.handle,
        description: `DEMO DATA — ${seed.title} is a fictional ${seed.topic.toLowerCase()} channel used when the YouTube Data API is not configured.`,
        thumbnailUrl: `/api/demo-assets/avatar/${encodeURIComponent(seed.title)}.svg`,
        bannerUrl: null,
        country: seed.country,
        publishedAt: new Date(seed.since),
        subscriberCount: BigInt(seed.subscribers),
        hiddenSubscriberCount: false,
        videoCount: count,
        viewCount: totalViews,
        uploadsPlaylistId: `UUdemo${seed.code.padEnd(18, "0")}`,
        keywords: seed.words.join(" "),
        topicCategories: [seed.topic],
      },
    };
  });
}

const data = () => (DATA ??= build());
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const matches = (text: string, q: string) => {
  const t = text.toLowerCase();
  const tokens = q.toLowerCase().split(/\s+/).filter((x) => x.length > 1);
  return tokens.length > 0 && tokens.every((tok) => t.includes(tok));
};

function paginate<T>(items: T[], pageToken: string | undefined, size: number): Page<T> {
  const start = pageToken ? Number(pageToken.replace(/^p/, "")) || 0 : 0;
  const slice = items.slice(start, start + size);
  return { items: slice, nextPageToken: start + size < items.length ? `p${start + size}` : null, totalResults: items.length };
}

export class MockYouTubeProvider implements YouTubeProvider {
  readonly dataSource = "mock" as const;

  async searchChannels(q: string, pageToken?: string, maxResults = 8) {
    const nq = norm(q);
    const hits = data().filter((d) => norm(d.channel.title).includes(nq) || norm(d.seed.handle).includes(nq) || nq.includes(norm(d.channel.title)) || matches(`${d.channel.title} ${d.seed.topic} ${d.seed.words.join(" ")}`, q));
    return paginate(hits.map((d) => d.channel), pageToken, maxResults);
  }

  async getChannels(by: { ids?: string[]; handle?: string; username?: string }) {
    if (by.ids) return data().filter((d) => by.ids!.includes(d.channel.youtubeId)).map((d) => d.channel);
    const h = norm(by.handle ?? by.username ?? "");
    return data().filter((d) => norm(d.seed.handle) === h).map((d) => d.channel);
  }

  async searchVideos(p: VideoSearchParams) {
    let vids = data().flatMap((d) => d.videos);
    if (p.channelId) vids = vids.filter((v) => v.channelYoutubeId === p.channelId);
    if (p.q) vids = vids.filter((v) => matches(`${v.title} ${v.channelTitle} ${v.details?.tags.join(" ")}`, p.q!));
    if (p.publishedAfter) vids = vids.filter((v) => v.publishedAt && v.publishedAt >= new Date(p.publishedAfter!));
    if (p.publishedBefore) vids = vids.filter((v) => v.publishedAt && v.publishedAt <= new Date(p.publishedBefore!));
    if (p.eventType === "live") vids = vids.filter((v) => v.details?.liveBroadcastContent === "live");
    if (p.videoDuration === "short") vids = vids.filter((v) => (v.details?.durationSeconds ?? 0) < 240);
    if (p.videoDuration === "long") vids = vids.filter((v) => (v.details?.durationSeconds ?? 0) > 1200);
    if (p.order === "date") vids.sort((a, b) => +b.publishedAt! - +a.publishedAt!);
    if (p.order === "viewCount") vids.sort((a, b) => Number((b.details?.viewCount ?? 0n) - (a.details?.viewCount ?? 0n)));
    return paginate(vids, p.pageToken, p.maxResults ?? 24);
  }

  async getVideos(ids: string[]) {
    const all = new Map(data().flatMap((d) => d.videos).map((v) => [v.youtubeId, v]));
    return ids.map((id) => all.get(id)).filter((v): v is VideoRecord => Boolean(v));
  }

  async searchPlaylists(q: string, pageToken?: string, channelId?: string) {
    let pls = data().flatMap((d) => d.playlists);
    if (channelId) pls = pls.filter((p) => p.channelYoutubeId === channelId);
    pls = pls.filter((p) => matches(`${p.title} ${p.channelTitle}`, q) || matches(p.channelTitle, q));
    return paginate(pls.map(stripIds), pageToken, 12);
  }

  async getChannelPlaylists(channelId: string, pageToken?: string) {
    return paginate(data().flatMap((d) => d.playlists).filter((p) => p.channelYoutubeId === channelId).map(stripIds), pageToken, 25);
  }

  async getPlaylists(ids: string[]) {
    return data().flatMap((d) => d.playlists).filter((p) => ids.includes(p.youtubeId)).map(stripIds);
  }

  async getPlaylistItems(playlistId: string, pageToken?: string, maxResults = 25) {
    const d = data().find((c) => c.channel.uploadsPlaylistId === playlistId);
    if (d) return paginate(d.videos.map((v, i) => ({ videoId: v.youtubeId, position: i })), pageToken, maxResults);
    const pl = data().flatMap((c) => c.playlists).find((p) => p.youtubeId === playlistId);
    if (!pl) throw new AppError("PLAYLIST_NOT_FOUND");
    return paginate(pl.videoIds.map((videoId, position) => ({ videoId, position })), pageToken, maxResults);
  }

  async getCategories() {
    return { "20": "Gaming", "26": "Howto & Style", "28": "Science & Technology" };
  }

  async getComments(videoId: string, opts: { order: "relevance" | "time"; pageToken?: string; searchTerms?: string }): Promise<Page<CommentThreadRecord>> {
    const video = data().flatMap((d) => d.videos).find((v) => v.youtubeId === videoId);
    if (!video) throw new AppError("VIDEO_UNAVAILABLE");
    const r = rng(hash(videoId));
    const lines = ["This explained it better than any class I took.", "Timestamp 3:12 is the best part!", "Can you make a follow-up on this?", "Watching this for the third time 😄", "Great editing as always.", "I disagree with one point, but solid video.", "Who else is here after the latest upload?", "The research that went into this is wild."];
    let threads: CommentThreadRecord[] = Array.from({ length: 30 }, (_, i) => {
      const replies: CommentRecord[] = Array.from({ length: i % 4 === 0 ? 2 : 0 }, (_, j) => ({ id: `${videoId}-c${i}-r${j}`, authorName: `Demo Viewer ${i + j + 40}`, authorAvatarUrl: null, authorChannelUrl: null, text: j ? "Same here!" : "Agreed, great point.", likeCount: Math.floor(r() * 50), publishedAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(), updatedAt: null }));
      return { id: `${videoId}-c${i}`, authorName: `Demo Viewer ${i + 1}`, authorAvatarUrl: null, authorChannelUrl: null, text: `DEMO — ${lines[i % lines.length]}`, likeCount: Math.floor(r() * 5000), publishedAt: new Date(Date.now() - i * 5_400_000).toISOString(), updatedAt: null, replyCount: replies.length, replies };
    });
    if (opts.searchTerms) threads = threads.filter((t) => t.text.toLowerCase().includes(opts.searchTerms!.toLowerCase()));
    if (opts.order === "relevance") threads.sort((a, b) => b.likeCount - a.likeCount);
    return paginate(threads, opts.pageToken, 20);
  }

  async getReplies(parentId: string): Promise<Page<CommentRecord>> {
    const videoId = parentId.split("-c")[0]!;
    const page = await this.getComments(videoId, { order: "time" });
    return { items: page.items.find((t) => t.id === parentId)?.replies ?? [], nextPageToken: null };
  }

  async ping() {}
}

function stripIds(p: PlaylistRecord & { videoIds: string[] }): PlaylistRecord {
  const { videoIds: _ids, ...rest } = p;
  return rest;
}

// ─── Synthetic images for demo records (contain no user data) ────────────────
const PALETTE = ["#6366F1", "#06B6D4", "#F59E0B", "#EC4899", "#22C55E", "#8B5CF6"];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function demoAvatarSvg(name: string) {
  const c = PALETTE[hash(name) % PALETTE.length];
  const initials = name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="176" viewBox="0 0 176 176"><rect width="176" height="176" rx="88" fill="${c}"/><text x="88" y="104" font-family="Inter,Arial,sans-serif" font-size="56" font-weight="700" fill="#fff" text-anchor="middle">${esc(initials)}</text></svg>`;
}

export function demoThumbSvg(id: string) {
  const h = hash(id);
  const a = PALETTE[h % PALETTE.length];
  const b = PALETTE[(h >> 3) % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="480" height="270" fill="url(#g)"/><circle cx="240" cy="135" r="34" fill="rgba(0,0,0,.35)"/><path d="M230 117 L256 135 L230 153 Z" fill="#fff"/><text x="16" y="254" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="rgba(255,255,255,.9)">DEMO DATA</text></svg>`;
}
