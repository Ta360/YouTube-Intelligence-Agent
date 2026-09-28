import type { ContentType, Video } from "@prisma/client";
import { z } from "zod";

/** Filters & sorting shared by channel videos, library videos and search results. */
export const videoFilterSchema = z.object({
  sort: z.enum(["relevance", "newest", "oldest", "views", "likes", "comments", "engagement"]).default("newest"),
  content: z.enum(["all", "video", "short", "live"]).default("all"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  duration: z.enum(["any", "short", "medium", "long"]).default("any"),
  minViews: z.coerce.number().int().min(0).optional(),
  minLikes: z.coerce.number().int().min(0).optional(),
  minComments: z.coerce.number().int().min(0).optional(),
  minEngagement: z.coerce.number().min(0).max(100).optional(),
  q: z.string().trim().max(100).optional(),
  channelId: z.string().max(40).optional(),
});
export type VideoFilters = z.infer<typeof videoFilterSchema>;

const n = (v: bigint | null) => (v === null ? -1 : Number(v));
/** (likes + comments) / views, in percent. */
export const engagementRate = (v: Pick<Video, "viewCount" | "likeCount" | "commentCount">) =>
  v.viewCount && v.viewCount > 0n ? ((Number(v.likeCount ?? 0n) + Number(v.commentCount ?? 0n)) / Number(v.viewCount)) * 100 : null;

const CONTENT: Record<string, ContentType[]> = { video: ["VIDEO"], short: ["SHORT"], live: ["LIVE", "UPCOMING"] };

export function applyVideoFilters(videos: Video[], f: VideoFilters): Video[] {
  let out = videos;
  if (f.channelId) out = out.filter((v) => v.channelYoutubeId === f.channelId);
  if (f.content !== "all") out = out.filter((v) => CONTENT[f.content]!.includes(v.contentType));
  if (f.from) {
    const from = new Date(`${f.from}T00:00:00Z`);
    out = out.filter((v) => v.publishedAt && v.publishedAt >= from);
  }
  if (f.to) {
    const to = new Date(`${f.to}T23:59:59.999Z`);
    out = out.filter((v) => v.publishedAt && v.publishedAt <= to);
  }
  if (f.duration !== "any") {
    out = out.filter((v) => {
      const d = v.durationSeconds;
      if (d === null) return false;
      return f.duration === "short" ? d < 240 : f.duration === "medium" ? d >= 240 && d <= 1200 : d > 1200;
    });
  }
  if (f.minViews) out = out.filter((v) => n(v.viewCount) >= f.minViews!);
  if (f.minLikes) out = out.filter((v) => n(v.likeCount) >= f.minLikes!);
  if (f.minComments) out = out.filter((v) => n(v.commentCount) >= f.minComments!);
  if (f.minEngagement) out = out.filter((v) => (engagementRate(v) ?? -1) >= f.minEngagement!);

  let scored: { v: Video; s: number }[] | null = null;
  if (f.q) {
    const tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    scored = out
      .map((v) => {
        const t = `${v.title} ${v.tags.join(" ")}`.toLowerCase();
        const d = v.description.toLowerCase();
        return { v, s: tokens.reduce((s, tok) => s + (t.includes(tok) ? 3 : 0) + (d.includes(tok) ? 1 : 0), 0) };
      })
      .filter((x) => x.s > 0);
    out = scored.map((x) => x.v);
  }

  const time = (v: Video) => v.publishedAt?.getTime() ?? 0;
  const sorted = [...out];
  switch (f.sort) {
    case "newest":
      sorted.sort((a, b) => time(b) - time(a));
      break;
    case "oldest":
      sorted.sort((a, b) => time(a) - time(b));
      break;
    case "views":
      sorted.sort((a, b) => n(b.viewCount) - n(a.viewCount));
      break;
    case "likes":
      sorted.sort((a, b) => n(b.likeCount) - n(a.likeCount));
      break;
    case "comments":
      sorted.sort((a, b) => n(b.commentCount) - n(a.commentCount));
      break;
    case "engagement":
      sorted.sort((a, b) => (engagementRate(b) ?? -1) - (engagementRate(a) ?? -1));
      break;
    case "relevance":
      if (scored) {
        const score = new Map(scored.map((x) => [x.v.id, x.s]));
        sorted.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || n(b.viewCount) - n(a.viewCount));
      }
      break;
  }
  return sorted;
}
