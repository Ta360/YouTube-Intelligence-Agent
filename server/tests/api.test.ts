import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const TZ = "UTC";

async function newUser(email: string) {
  const agent = request.agent(app);
  const r = await agent.post("/api/auth/signup").send({ name: "Tester", email, password: "passw0rd-123" });
  expect(r.status).toBe(201);
  return agent;
}

let a: ReturnType<typeof request.agent>;
let b: ReturnType<typeof request.agent>;

beforeAll(async () => {
  a = await newUser("a@example.com");
  b = await newUser("b@example.com");
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("security", () => {
  it("requires a session for dashboard routes", async () => {
    const r = await request(app).post("/api/search").send({ query: "Nova Labs" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("UNAUTHORIZED");
  });
  it("validates IDs and input", async () => {
    expect((await a.get("/api/youtube/videos/not-an-id")).status).toBe(400);
    expect((await a.get("/api/youtube/channels/xyz")).status).toBe(400);
    expect((await a.post("/api/search").send({ query: "" })).status).toBe(400);
    expect((await a.put("/api/settings/chart-colors").send({ primary: "red" })).status).toBe(400);
  });
  it("never returns secrets in config", async () => {
    const r = await a.get("/api/settings/config");
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/AIza|sk-/);
    expect(r.body.variables.find((v: { name: string }) => v.name === "YOUTUBE_API_KEY")).toMatchObject({ set: false, required: true });
  });
});

describe("search → creator → videos → player data", () => {
  let channelId = "";
  it("identifies the channel for a creator search and returns its videos + playlists", async () => {
    const r = await a.post(`/api/search?tz=${TZ}`).send({ query: "Nova Labs", source: "GLOBAL_SEARCH" });
    expect(r.status).toBe(200);
    expect(r.body.dataSource).toBe("mock");
    expect(r.body.creator).toMatchObject({ title: "Nova Labs", handle: "@novalabs" });
    channelId = r.body.creator.id;
    expect(r.body.videos.items.length).toBeGreaterThan(0);
    expect(r.body.videos.items.every((v: { channelId: string }) => v.channelId === channelId)).toBe(true);
    expect(r.body.playlists.items.length).toBeGreaterThan(0);
    expect(r.body.searchId).toBeTruthy();
  });
  it("finds a channel by @handle", async () => {
    const r = await a.post("/api/search").send({ query: "@pixeltrail" });
    expect(r.body.intent.type).toBe("HANDLE");
    expect(r.body.creator.title).toBe("Pixel Trail");
  });
  it("lists only that channel's videos with sorting and pagination", async () => {
    const r = await a.get(`/api/youtube/channels/${channelId}/videos?sort=views&pageSize=5`);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(5);
    const views = r.body.items.map((v: { viewCount: number }) => v.viewCount);
    expect([...views].sort((x, y) => y - x)).toEqual(views);
    const shorts = await a.get(`/api/youtube/channels/${channelId}/videos?content=short`);
    expect(shorts.body.items.every((v: { contentType: string }) => v.contentType === "SHORT")).toBe(true);
  });
  it("loads more uploads page by page", async () => {
    const before = (await a.get(`/api/youtube/channels/${channelId}`)).body.storedVideoCount;
    const more = await a.post(`/api/youtube/channels/${channelId}/videos/more`);
    expect(more.status).toBe(200);
    expect(before).toBeGreaterThan(0);
  });
  it("returns video details, related content and playlist items", async () => {
    const list = await a.get(`/api/youtube/channels/${channelId}/videos?pageSize=1`);
    const vid = list.body.items[0].id;
    const v = await a.get(`/api/youtube/videos/${vid}`);
    expect(v.body).toMatchObject({ id: vid, channelTitle: "Nova Labs" });
    expect((await a.get(`/api/youtube/videos/${vid}/related`)).body.videos.length).toBeGreaterThan(0);
    const pls = await a.get(`/api/youtube/channels/${channelId}/playlists`);
    const pl = await a.get(`/api/youtube/playlists/${pls.body.items[0].id}`);
    expect(pl.status).toBe(200);
    expect(pl.body.items.length).toBeGreaterThan(0);
    expect((await a.post(`/api/youtube/videos/${vid}/play`)).status).toBe(201);
  });
  it("reads a video's public comments with sorting, search, paging and replies", async () => {
    const list = await a.get(`/api/youtube/channels/${channelId}/videos?pageSize=1`);
    const vid = list.body.items[0].id;
    const top = await a.get(`/api/youtube/videos/${vid}/comments?order=relevance`);
    expect(top.status).toBe(200);
    expect(top.body.items).toHaveLength(20);
    expect(top.body.nextPageToken).toBeTruthy();
    const likes = top.body.items.map((c: { likeCount: number }) => c.likeCount);
    expect([...likes].sort((x, y) => y - x)).toEqual(likes);
    const page2 = await a.get(`/api/youtube/videos/${vid}/comments?order=relevance&pageToken=${top.body.nextPageToken}`);
    expect(page2.body.items.length).toBeGreaterThan(0);
    const found = await a.get(`/api/youtube/videos/${vid}/comments?q=editing`);
    expect(found.body.items.every((c: { text: string }) => /editing/i.test(c.text))).toBe(true);
    const threaded = top.body.items.find((c: { replyCount: number }) => c.replyCount > 0);
    const replies = await a.get(`/api/youtube/comments/${encodeURIComponent(threaded.id)}/replies`);
    expect(replies.body.items).toHaveLength(threaded.replyCount);
    expect((await a.get(`/api/youtube/videos/${vid}/comments?order=bogus`)).status).toBe(400);
  });
  it("falls back to topic search when no channel matches", async () => {
    const r = await a.post("/api/search").send({ query: "videos about robotics" });
    expect(r.body.intent.type).toBe("TOPIC");
    expect(r.body.videos.items.length).toBeGreaterThan(0);
  });
  it("records failed searches with a helpful status", async () => {
    const r = await a.post("/api/search").send({ query: "@doesnotexist123" });
    expect(r.status).toBe(404);
    const h = await a.get("/api/history?status=NO_RESULTS");
    expect(h.body.items.some((i: { query: string }) => i.query === "@doesnotexist123")).toBe(true);
  });
});

describe("history, calendar and analytics", () => {
  it("stores every search with type, results and status", async () => {
    const r = await a.get("/api/history");
    expect(r.body.total).toBeGreaterThanOrEqual(4);
    const row = r.body.items.find((i: { query: string }) => i.query === "Nova Labs");
    expect(row).toMatchObject({ searchType: "PERSON", status: "SUCCESS", source: "GLOBAL_SEARCH", entityName: "Nova Labs" });
    expect(row.resultCount).toBeGreaterThan(0);
  });
  it("keeps each user's data private", async () => {
    const r = await b.get("/api/history");
    expect(r.body.total).toBe(0);
    expect((await b.get("/api/library/videos")).body.total).toBe(0);
  });
  it("tracks activity by date in the calendar", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await a.get(`/api/calendar?from=${today}&to=${today}&tz=${TZ}`);
    expect(r.body.days[0]).toMatchObject({ day: today });
    expect(r.body.days[0].searches).toBeGreaterThanOrEqual(4);
    expect(r.body.days[0].creators).toBe(2);
    expect(r.body.days[0].plays).toBe(1);
    const d = await a.get(`/api/calendar/day/${today}?tz=${TZ}`);
    expect(d.body.searches.length).toBe(r.body.days[0].searches);
  });
  it("summarises KPIs and activity for a date range", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const s = await a.get(`/api/analytics/summary?from=${today}&to=${today}`);
    expect(s.body.current.totalSearches).toBeGreaterThanOrEqual(4);
    expect(s.body.current.creatorsResearched).toBe(2);
    const act = await a.get(`/api/analytics/activity?from=2026-01-01&to=${today}&granularity=month`);
    expect(act.body.points.at(-1).searches).toBeGreaterThanOrEqual(4);
    const empty = await a.get(`/api/analytics/summary?from=2020-01-01&to=2020-01-31`);
    expect(empty.body.current.totalSearches).toBe(0);
    for (const dim of ["searchesByCreator", "videosByCreator", "videosByContentType", "searchCategories", "savedVideos", "playlistsDiscovered"]) {
      const d = await a.get(`/api/analytics/distribution?dimension=${dim}&from=${today}&to=${today}`);
      expect(d.status).toBe(200);
    }
    const byCreator = await a.get(`/api/analytics/distribution?dimension=searchesByCreator&from=${today}&to=${today}`);
    expect(byCreator.body.slices.map((x: { label: string }) => x.label)).toContain("Nova Labs");
  });
});

describe("saved research and workspace", () => {
  it("saves and unsaves videos, creators and research", async () => {
    const lib = await a.get("/api/library/videos?pageSize=1");
    const vid = lib.body.items[0].id;
    expect((await a.post("/api/saved/videos").send({ id: vid })).status).toBe(201);
    expect((await a.get("/api/saved/ids")).body.videos).toContain(vid);
    await a.delete(`/api/saved/videos/${vid}`);
    expect((await a.get("/api/saved/ids")).body.videos).not.toContain(vid);
    await a.post("/api/saved/videos").send({ id: vid });
    const ch = (await a.get("/api/library/channels")).body.items[0].id;
    expect((await a.post("/api/saved/channels").send({ id: ch })).status).toBe(201);
    const r = await a.post("/api/saved/research").send({ kind: "NOTE", title: "My notes", payload: { note: "hi" } });
    expect(r.status).toBe(201);
    const all = await a.get("/api/saved");
    expect(all.body.videos).toHaveLength(1);
    expect(all.body.channels).toHaveLength(1);
    expect(all.body.research[0].title).toBe("My notes");
    // Another user cannot delete it.
    expect((await b.delete(`/api/saved/research/${r.body.id}`)).status).toBe(404);
  });
  it("builds a research session and compares creators", async () => {
    const s = await a.post("/api/research/sessions").send({ name: "AI Creator Research" });
    const nova = (await a.post("/api/search").send({ query: "Nova Labs" })).body.creator.id;
    const orbit = (await a.post("/api/search").send({ query: "Orbit Academy" })).body.creator.id;
    await a.post(`/api/research/sessions/${s.body.id}/items`).send({ kind: "CHANNEL", youtubeId: nova });
    await a.post(`/api/research/sessions/${s.body.id}/items`).send({ kind: "CHANNEL", youtubeId: orbit });
    const cmp = await a.get(`/api/research/sessions/${s.body.id}/compare?days=90`);
    expect(cmp.body.creators.map((c: { title: string }) => c.title)).toEqual(["Nova Labs", "Orbit Academy"]);
    expect(cmp.body.creators[0].window.count).toBeGreaterThan(0);
    expect((await b.get(`/api/research/sessions/${s.body.id}/compare`)).status).toBe(404);
  });
});

describe("AI Intelligence Agent (local engine)", () => {
  let sessionId = "";
  it("researches a creator and returns structured, playable results", async () => {
    const r = await a.post(`/api/agent/chat?tz=${TZ}`).send({ message: "Find all videos from Nova Labs" });
    expect(r.status).toBe(200);
    sessionId = r.body.sessionId;
    const p = r.body.message.payload;
    expect(p.kind).toBe("research");
    expect(p.channel.title).toBe("Nova Labs");
    expect(p.videos.length).toBeGreaterThan(0);
    expect(p.videos[0].source).toBe("YouTube");
    expect(p.playlistsFound).toBeGreaterThan(0);
    expect(p.latestVideo).toBeTruthy();
    expect(r.body.message.content).toMatch(/Nova Labs/);
  });
  it("uses the open creator for 'this creator' requests", async () => {
    const nova = (await a.post("/api/search").send({ query: "Nova Labs" })).body.creator.id;
    const r = await a.post("/api/agent/chat").send({ message: "Find the most viewed videos from this channel", sessionId, context: { channelId: nova } });
    const views = r.body.message.payload.videos.map((v: { viewCount: number }) => v.viewCount);
    expect([...views].sort((x: number, y: number) => y - x)).toEqual(views);
    expect(r.body.sessionId).toBe(sessionId);
  });
  it("finds topic videos within a creator", async () => {
    const r = await a.post("/api/agent/chat").send({ message: "Find videos about robotics from Nova Labs" });
    expect(r.body.message.payload.videos.every((v: { title: string }) => /robotics/i.test(v.title))).toBe(true);
  });
  it("compares creators", async () => {
    const r = await a.post("/api/agent/chat").send({ message: "Compare Nova Labs and Pixel Trail over the last 30 days" });
    expect(r.body.message.payload.kind).toBe("compare");
    expect(r.body.message.payload.comparison.creators).toHaveLength(2);
  });
  it("explains when web search is not configured", async () => {
    const r = await a.post("/api/agent/chat").send({ message: "Search YouTube and the web for Chef Aria" });
    expect(r.body.message.payload.warnings.join(" ")).toMatch(/Web search is not configured/);
    expect(r.body.message.payload.channel.title).toBe("Chef Aria");
  });
  it("records AI sessions and queries in history and the calendar", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const cal = await a.get(`/api/calendar?from=${today}&to=${today}`);
    expect(cal.body.days[0].aiSessions).toBeGreaterThanOrEqual(1);
    expect(cal.body.days[0].aiQueries).toBeGreaterThanOrEqual(4);
    const h = await a.get("/api/history?source=AI_AGENT");
    expect(h.body.total).toBeGreaterThanOrEqual(3);
    const sessions = await a.get("/api/agent/sessions");
    expect(sessions.body.items.length).toBeGreaterThanOrEqual(1);
    const s = await a.get(`/api/agent/sessions/${sessionId}`);
    expect(s.body.messages.length).toBeGreaterThanOrEqual(4);
    expect((await b.get(`/api/agent/sessions/${sessionId}`)).status).toBe(404);
  });
});

describe("settings and status", () => {
  it("persists chart colors per user", async () => {
    const r = await a.put("/api/settings/chart-colors").send({ primary: "#112233" });
    expect(r.body.colors.primary).toBe("#112233");
    expect((await b.get("/api/settings/chart-colors")).body.colors.primary).toBe("#6366F1");
    expect((await a.post("/api/settings/chart-colors/reset")).body.colors.primary).toBe("#6366F1");
  });
  it("reports system status", async () => {
    const r = await a.get("/api/system/status");
    expect(r.body).toMatchObject({ dataSource: "mock", youtube: { state: "demo" }, database: { state: "connected" }, web: { state: "not_configured" } });
  });
});
