import "dotenv/config";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  // API_PORT wins over PORT so a PORT injected for the frontend dev server can't collide;
  // hosting platforms that only set PORT (Azure, Render, …) still work.
  API_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(4300),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:5473"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  YOUTUBE_API_MODE: z.enum(["auto", "youtube", "mock"]).default("auto"),
  YOUTUBE_API_KEY: optionalString,
  YOUTUBE_DAILY_QUOTA: z.coerce.number().int().min(1).default(10000),
  YOUTUBE_REGION: z.string().regex(/^[A-Z]{2}$/).default("US"),
  YOUTUBE_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(86400).default(1800),

  WEB_SEARCH_PROVIDER: z.enum(["serper", "tavily"]).default("serper"),
  WEB_SEARCH_API_KEY: optionalString,

  LLM_PROVIDER: z.enum(["openai", "local"]).default("openai"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  ALLOW_SIGNUP: bool,
  OWNER_EMAIL: optionalString,
  SESSION_SECRET: z.string().default("dev-only-insecure-session-secret"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print variable names only — never values.
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

const e = parsed.data;

if (e.NODE_ENV === "production" && (e.SESSION_SECRET === "dev-only-insecure-session-secret" || e.SESSION_SECRET.length < 32)) {
  console.error("SESSION_SECRET must be set to a random string of at least 32 characters in production.");
  process.exit(1);
}

export const env = {
  port: e.API_PORT ?? e.PORT,
  nodeEnv: e.NODE_ENV,
  isProduction: e.NODE_ENV === "production",
  corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  databaseUrl: e.DATABASE_URL,
  youtube: {
    mode: e.YOUTUBE_API_MODE,
    apiKey: e.YOUTUBE_API_KEY,
    dailyQuota: e.YOUTUBE_DAILY_QUOTA,
    region: e.YOUTUBE_REGION,
    cacheTtlSeconds: e.YOUTUBE_CACHE_TTL_SECONDS,
    /** True when live YouTube Data API calls are made; false = labelled demo data. */
    get live() {
      return this.mode === "youtube" || (this.mode === "auto" && Boolean(this.apiKey));
    },
  },
  web: { provider: e.WEB_SEARCH_PROVIDER, apiKey: e.WEB_SEARCH_API_KEY },
  llm: { provider: e.LLM_PROVIDER, openaiKey: e.OPENAI_API_KEY, openaiModel: e.OPENAI_MODEL },
  auth: { allowSignup: e.ALLOW_SIGNUP, ownerEmail: e.OWNER_EMAIL?.toLowerCase(), sessionSecret: e.SESSION_SECRET },
};

export type Env = typeof env;
