import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { llmConfigured } from "./services/ai/llmProvider.js";
import { getYouTubeProvider } from "./services/youtube/provider.js";

const app = createApp();
const provider = getYouTubeProvider();

const server = app.listen(env.port, () => {
  logger.info("server.started", {
    url: `http://localhost:${env.port}`,
    youtube: provider.dataSource,
    webSearch: env.web.apiKey ? env.web.provider : "not configured",
    ai: llmConfigured() ? `openai:${env.llm.openaiModel}` : "local",
  });
  if (provider.dataSource === "mock") console.log("⚠  YOUTUBE_API_KEY not set — serving labelled DEMO DATA");
});

async function shutdown() {
  server.close();
  await prisma.$disconnect().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
