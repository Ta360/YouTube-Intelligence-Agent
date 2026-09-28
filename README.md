# YouTube Intelligence Agent

A research and analytics dashboard for YouTube. You can search any person, creator, @handle, channel ID, video, playlist or topic. It identifies the right channel, lists its videos and playlists, and plays them in an embedded player so you stay in the dashboard. Every search is recorded in history, analytics and a calendar. An **AI Intelligence Agent** on the right accepts natural-language requests and researches YouTube, plus the web when you ask it to.

It uses only public data through official APIs: the **YouTube Data API v3** and the **YouTube IFrame Player**. There is no scraping, no downloading and no attempt to access private, deleted or restricted content.

## Quick start

```bash
npm install
npm run dev          # embedded PostgreSQL :5435 + API :4300 + dashboard :5473
```

Open **http://localhost:5473**. The first account you sign up becomes the owner. After that, sign-up is closed unless `ALLOW_SIGNUP=true`.

> On Windows, if a launcher passes a short `C:\Users\NAME~1\…` path, use `npm run dev:launch`. It re-resolves the real path for Vite.

Configure `server/.env` (copy it from `server/.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `YOUTUBE_API_KEY` | yes (for live data) | YouTube Data API v3 key. Without it the app serves labelled **DEMO DATA**. |
| `WEB_SEARCH_API_KEY` + `WEB_SEARCH_PROVIDER` | optional | Web research for the agent (`serper` or `tavily`). |
| `OPENAI_API_KEY` + `OPENAI_MODEL` | optional | LLM planning and summaries for the agent. Without it, a built-in language parser runs the same workflow. |
| `DATABASE_URL` | yes | PostgreSQL. Local dev starts an embedded server automatically. |
| `SESSION_SECRET` | yes in production | 32+ random characters that sign the session cookies. |
| `YOUTUBE_DAILY_QUOTA`, `YOUTUBE_CACHE_TTL_SECONDS`, `YOUTUBE_REGION`, `ALLOW_SIGNUP`, `OWNER_EMAIL` | optional | See `.env.example`. |

**Settings → API configuration** in the app shows which variables are set (never their values), the live status of each service and your quota usage.

## Architecture

```
client/ (React 19 + Vite + Tailwind 4 + Recharts + React Query + Zustand)
  theme/theme.ts          ← central UI HEX tokens (dark-first + light)
  theme/chartTheme.tsx    ← central chart palette (PRIMARY…PINK), per-user overrides from Settings
  components/layout       DashboardLayout · Sidebar · TopHeader (GlobalSearch, DateRangePicker, notifications, API status)
  components/video        VideoCard · VideoGrid · PlaylistCard · VideoPlayer (IFrame API) · VideoDetailsPanel
  components/creator      CreatorProfile (Overview / Videos / Shorts / Playlists / Analytics / Search History / Related)
  components/charts       BarChart · LineChart (zoom) · DonutChart · KPIStats · AnalyticsDashboard
  components/agent        AIAgentPanel · ResearchResult
  store/appStore.ts       UI state only (selectedCreator, selectedVideo, filters, dateRange, aiMessages, researchSession, playerState)
server/ (Express 5 + TypeScript + Prisma + PostgreSQL + Zod)
  services/youtube/       youtubeApiProvider (official API, caching, quota tracking) · mockProvider · youtubeService
  services/searchService  intent-aware unified search (queryIntent.ts classifies the query)
  services/ai/            llmProvider (modular) · planner (JSON plan / local parser) · aiService (research workflow)
  services/web/           webSearchService (Serper / Tavily)
  services/               analyticsService · calendarService · researchService · activityService · settingsService · systemService
  prisma/schema.prisma    users, people, channels, videos, playlists, playlist_videos, search_history, saved_*,
                          saved_research, research_sessions/items, ai_sessions, ai_messages, analytics_events,
                          calendar_activity, api_usage, user_discoveries, user_settings
```

- **No duplicate YouTube records.** Channels, videos and playlists are unique by their YouTube IDs and shared. Everything a user does is scoped by `userId`, and `user_discoveries` keeps each user's library private.
- **Quota-aware.** The app resolves a channel by ID or `@handle` for 1 unit before falling back to search (100 units). Channel uploads come from the uploads playlist 50 at a time (1 unit per page), with **Load more**. Stored records and cached responses are reused, and `api_usage` tracks every call.
- **AI agent workflow.** Plan the request → identify the channel → fetch videos and playlists → search the web (only when asked) → dedupe and rank → return a structured result → record history, analytics and calendar. Web results are labelled "Web Search" and shown as unverified.

## Tests

```bash
npm test         # 43 server tests (unit + API integration on a throwaway PostgreSQL) + client tests
npm run typecheck
```

## Deploy

`Dockerfile` builds one container (API plus the built dashboard) that listens on `PORT` (8080). Point `DATABASE_URL` at a managed PostgreSQL and set `NODE_ENV=production` and a strong `SESSION_SECRET`.

## Notes and limitations

- The YouTube Data API has no "is Short" flag, so a video of 60 seconds or less, or 3 minutes or less tagged `#shorts`, is treated as a Short.
- YouTube removed related-video search in 2023. "Related videos" means more from the same channel plus its playlists.
- The API does not expose channel verification badges. The profile says so rather than guessing.
- Some owners disable embedding. The player then shows YouTube's message with a **Watch on YouTube** link.
