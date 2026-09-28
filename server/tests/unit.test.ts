import { describe, expect, it } from "vitest";
import { bucketOf, parseIsoDuration } from "../src/lib/dates.js";
import { redact } from "../src/lib/logger.js";
import { classifyQuery } from "../src/services/queryIntent.js";
import { localPlan } from "../src/services/ai/planner.js";
import { classifyContent, scoreChannel } from "../src/services/youtube/youtubeService.js";
import { applyVideoFilters, engagementRate, videoFilterSchema } from "../src/services/youtube/videoFilters.js";
import type { Video } from "@prisma/client";

describe("classifyQuery", () => {
  it("treats a single creator name as a channel", () => {
    const i = classifyQuery("MrBeast");
    expect(i.type).toBe("CHANNEL");
    expect(i.entity).toBe("MrBeast");
  });
  it("treats a capitalised full name as a person", () => {
    expect(classifyQuery("Taylor Swift")).toMatchObject({ type: "PERSON", entity: "Taylor Swift" });
    expect(classifyQuery("John Doe")).toMatchObject({ type: "PERSON", entity: "John Doe" });
  });
  it("recognises handles, channel IDs and links", () => {
    expect(classifyQuery("@veritasium")).toMatchObject({ type: "HANDLE", handle: "@veritasium" });
    expect(classifyQuery("UCX6OQ3DkcsbYNE6H8uQQuVA")).toMatchObject({ type: "CHANNEL_ID", channelId: "UCX6OQ3DkcsbYNE6H8uQQuVA" });
    expect(classifyQuery("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({ type: "VIDEO", videoId: "dQw4w9WgXcQ" });
    expect(classifyQuery("https://youtu.be/dQw4w9WgXcQ?t=3")).toMatchObject({ type: "VIDEO", videoId: "dQw4w9WgXcQ" });
    expect(classifyQuery("youtube.com/shorts/abcdefghijk")).toMatchObject({ type: "VIDEO", videoId: "abcdefghijk" });
    expect(classifyQuery("https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")).toMatchObject({ type: "PLAYLIST" });
    expect(classifyQuery("https://www.youtube.com/@MrBeast/videos")).toMatchObject({ type: "HANDLE", handle: "@MrBeast" });
  });
  it("detects video, playlist and topic intents", () => {
    expect(classifyQuery("MrBeast latest videos")).toMatchObject({ type: "VIDEO", entity: "MrBeast", sort: "newest" });
    expect(classifyQuery("MrBeast playlists")).toMatchObject({ type: "PLAYLIST", entity: "MrBeast" });
    expect(classifyQuery("videos about AI")).toMatchObject({ type: "TOPIC", topic: "AI" });
    expect(classifyQuery("videos about artificial intelligence")).toMatchObject({ type: "TOPIC", topic: "artificial intelligence" });
  });
  it("handles filtered research requests", () => {
    const i = classifyQuery("Find videos and playlists of MrBeast from 2025");
    expect(i).toMatchObject({ entity: "MrBeast", year: 2025 });
    expect(i.wants).toMatchObject({ videos: true, playlists: true });
  });
  it("detects topic-within-creator and context references", () => {
    expect(classifyQuery("AI videos from MrBeast")).toMatchObject({ type: "VIDEO", entity: "MrBeast", topic: "AI" });
    const ctx = classifyQuery("Find videos about AI from this creator");
    expect(ctx).toMatchObject({ usesContext: true, topic: "AI" });
    expect(ctx.entity).toBeUndefined();
    expect(classifyQuery("Find all videos from MrBeast.")).toMatchObject({ entity: "MrBeast", type: "VIDEO" });
    expect(classifyQuery("Find the most viewed videos from this channel")).toMatchObject({ usesContext: true, sort: "views" });
  });
  it("keeps names that start with 'The'", () => {
    expect(classifyQuery("The Weeknd").entity).toBe("The Weeknd");
  });
});

describe("agent local planner", () => {
  const ctx = { today: "2026-09-28", tz: "UTC" };
  it("plans creator research", () => {
    expect(localPlan("Find all videos from MrBeast.", ctx)).toMatchObject({ action: "research", entity: "MrBeast", wantVideos: true, wantWeb: false });
  });
  it("plans web research only when asked", () => {
    const p = localPlan("Search YouTube and the web for Taylor Swift", ctx);
    expect(p.wantWeb).toBe(true);
    expect(p.entity).toBe("Taylor Swift");
    expect(localPlan("Search the web for videos featuring this person.", ctx)).toMatchObject({ wantWeb: true, useContext: true });
  });
  it("plans comparisons with a day window", () => {
    expect(localPlan("Compare this creator's videos over the last 30 days.", ctx)).toMatchObject({ action: "compare", useContext: true, days: 30 });
    expect(localPlan("Compare MrBeast and Veritasium", ctx)).toMatchObject({ action: "compare", compareEntities: ["MrBeast", "Veritasium"] });
  });
  it("plans activity questions and help", () => {
    expect(localPlan("What did I search this week?", ctx)).toMatchObject({ action: "activity", days: 7 });
    expect(localPlan("hello", ctx).action).toBe("help");
  });
  it("turns 'last N days' into a date window", () => {
    expect(localPlan("latest videos from Nova Labs in the last 14 days", ctx)).toMatchObject({ dateFrom: "2026-09-15", dateTo: "2026-09-28" });
  });
});

describe("helpers", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1DT1S")).toBe(86401);
    expect(parseIsoDuration("bad")).toBeNull();
  });
  it("buckets days by week (Monday), month and year", () => {
    expect(bucketOf("2026-09-27", "week")).toBe("2026-09-21"); // Sunday → Monday
    expect(bucketOf("2026-09-28", "week")).toBe("2026-09-28");
    expect(bucketOf("2026-09-28", "month")).toBe("2026-09");
    expect(bucketOf("2026-09-28", "year")).toBe("2026");
  });
  it("redacts API keys from logs", () => {
    expect(redact("https://x/?key=AIzaSyA1234567890abcdefghijklmn")).not.toContain("AIzaSy");
    expect(redact("Bearer sk-abcdefghijklmnop")).toBe("[REDACTED]");
  });
  it("ranks exact channel matches above bigger partial matches", () => {
    const exact = scoreChannel({ title: "Veritasium", handle: "@veritasium", subscriberCount: 10_000_000n }, "Veritasium");
    const partial = scoreChannel({ title: "Veritasium Clips Fan", handle: null, subscriberCount: 900_000_000n }, "Veritasium");
    expect(exact).toBeGreaterThan(partial);
  });
  it("classifies Shorts and live content", () => {
    const base = { youtubeId: "x", channelYoutubeId: "c", channelTitle: "c", title: "t", description: "", thumbnailUrl: null, publishedAt: null };
    const d = { viewCount: null, likeCount: null, commentCount: null, tags: [], categoryId: null, embeddable: true, privacyStatus: "public", defaultLanguage: null };
    expect(classifyContent({ ...base, details: { ...d, durationSeconds: 45, liveBroadcastContent: "none" } })).toBe("SHORT");
    expect(classifyContent({ ...base, title: "wow #shorts", details: { ...d, durationSeconds: 150, liveBroadcastContent: "none" } })).toBe("SHORT");
    expect(classifyContent({ ...base, details: { ...d, durationSeconds: 150, liveBroadcastContent: "none" } })).toBe("VIDEO");
    expect(classifyContent({ ...base, details: { ...d, durationSeconds: 0, liveBroadcastContent: "live" } })).toBe("LIVE");
  });
  it("filters and sorts videos", () => {
    const mk = (id: string, views: number, likes: number, days: number, type: Video["contentType"] = "VIDEO", duration = 600) =>
      ({ id, youtubeId: id, viewCount: BigInt(views), likeCount: BigInt(likes), commentCount: 0n, publishedAt: new Date(Date.UTC(2026, 0, days)), contentType: type, durationSeconds: duration, title: id, description: "", tags: [], channelYoutubeId: "c" }) as unknown as Video;
    const vids = [mk("a", 100, 10, 1), mk("b", 1000, 5, 5), mk("c", 50, 20, 3, "SHORT", 30)];
    const f = (p: Record<string, unknown>) => applyVideoFilters(vids, videoFilterSchema.parse(p)).map((v) => v.youtubeId);
    expect(f({ sort: "views" })).toEqual(["b", "a", "c"]);
    expect(f({ sort: "oldest" })).toEqual(["a", "c", "b"]);
    expect(f({ sort: "likes" })).toEqual(["c", "a", "b"]);
    expect(f({ content: "short" })).toEqual(["c"]);
    expect(f({ minViews: 90, sort: "newest" })).toEqual(["b", "a"]);
    expect(f({ from: "2026-01-02", to: "2026-01-04", sort: "newest" })).toEqual(["c"]);
    expect(f({ duration: "short" })).toEqual(["c"]);
    expect(engagementRate(vids[2]!)).toBe(40);
    expect(f({ minEngagement: 15 })).toEqual(["c"]);
  });
});
