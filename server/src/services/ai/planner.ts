/**
 * Turns a natural-language request into a structured ResearchPlan.
 * The LLM (when configured) plans in JSON; the local parser is the always-available fallback.
 * Either way the same deterministic research workflow executes the plan.
 */
import { z } from "zod";
import { addDays, dayKey } from "../../lib/dates.js";
import { logger } from "../../lib/logger.js";
import { classifyQuery } from "../queryIntent.js";
import { getLlm, type LlmMessage } from "./llmProvider.js";

export const researchPlanSchema = z.object({
  action: z.enum(["research", "compare", "activity", "help"]),
  entity: z.string().max(120).nullish(),
  useContext: z.boolean().default(false),
  topic: z.string().max(160).nullish(),
  wantVideos: z.boolean().default(true),
  wantPlaylists: z.boolean().default(false),
  wantWeb: z.boolean().default(false),
  sort: z.enum(["relevance", "newest", "oldest", "views", "likes", "comments"]).nullish(),
  contentType: z.enum(["short", "live"]).nullish(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  days: z.number().int().min(1).max(365).nullish(),
  compareEntities: z.array(z.string().max(120)).max(6).nullish(),
});
export type ResearchPlan = z.infer<typeof researchPlanSchema>;

export interface AgentContext {
  channelId?: string;
  channelTitle?: string;
  videoId?: string;
  videoTitle?: string;
  today: string;
  tz: string;
}

const WEB_RE = /\b(web|internet|online|google|news|articles?|websites?|blogs?|sources?|interviews?|elsewhere|everywhere)\b/i;

export function localPlan(message: string, ctx: AgentContext): ResearchPlan {
  const m = message.trim();
  const lower = m.toLowerCase();
  const base = researchPlanSchema.parse({ action: "research" });

  if (!m || /^(help|hi|hello|hey|what can you do\??|how do (i|you) use (this|you)\??)$/i.test(m)) return { ...base, action: "help" };

  const daysMatch = lower.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/);
  const weekMatch = /\b(last|past|this) week\b/.test(lower);
  const monthMatch = /\b(last|past|this) month\b/.test(lower);
  const days = daysMatch ? Number(daysMatch[1]) : weekMatch ? 7 : monthMatch ? 30 : undefined;

  if (/\b(what|which|how many|show)\b.*\b(i|my)\b.*\b(search|searched|research|researched|activity|history)\b|\bmy (activity|searches|history)\b/i.test(lower)) {
    return { ...base, action: "activity", days: days ?? (/\btoday\b/.test(lower) ? 1 : 7) };
  }

  if (/\b(compare|comparison|versus|vs\.?)\b/i.test(lower)) {
    const cleaned = m
      .replace(/\b(compare|comparison of|comparison|the|videos?|channels?|performance|stats|statistics|over|in|during|for)\b/gi, " ")
      .replace(/\b(?:last|past|previous)\s+\d{1,3}\s+days?\b|\b(last|past|this) (week|month)\b/gi, " ");
    const usesContext = /\b(this|that|current|selected)\s+(creator|channel|person|youtuber)('s)?\b/i.test(cleaned);
    const names = cleaned
      .replace(/\b(this|that|current|selected)\s+(creator|channel|person|youtuber)('s)?\b/gi, " ")
      .split(/\s*(?:,|\band\b|\bvs\.?\b|\bversus\b|\bwith\b|\bto\b)\s*/i)
      .map((s) => s.replace(/[?.!'’s]+$/g, "").trim())
      .filter((s) => s.length > 1);
    return { ...base, action: "compare", useContext: usesContext, compareEntities: names, days: days ?? 30 };
  }

  const intent = classifyQuery(m);
  const wantWeb = WEB_RE.test(lower);
  const plan: ResearchPlan = {
    ...base,
    entity: intent.entity ?? intent.handle ?? intent.channelId ?? null,
    useContext: intent.usesContext,
    topic: intent.topic ?? null,
    wantVideos: intent.wants.videos,
    wantPlaylists: intent.wants.playlists,
    wantWeb,
    sort: intent.sort ?? null,
    contentType: intent.contentType ?? null,
  };
  if (intent.year) {
    plan.dateFrom = `${intent.year}-01-01`;
    plan.dateTo = `${intent.year}-12-31`;
  }
  if (days) {
    plan.dateFrom = addDays(ctx.today, -(days - 1));
    plan.dateTo = ctx.today;
    plan.days = days;
  }
  // Web phrasing leaves words like "web" in the parsed entity/topic — strip them.
  if (wantWeb) {
    const strip = (s?: string | null) => s?.replace(/\b(the )?(web|internet|online|google|and|youtube)\b/gi, " ").replace(/\s+/g, " ").trim() || null;
    plan.entity = strip(plan.entity);
    plan.topic = strip(plan.topic);
  }
  if (!plan.entity && !plan.topic && !plan.useContext) return { ...base, action: "help" };
  return plan;
}

const SYSTEM = (ctx: AgentContext) =>
  [
    "You convert a user's request inside a YouTube research dashboard into a JSON research plan.",
    'Return ONLY a JSON object with keys: action ("research" | "compare" | "activity" | "help"), entity (person/creator/channel name, @handle or channel ID, or null),',
    "useContext (true when the user says this/that creator/channel/person), topic (subject keywords or null), wantVideos, wantPlaylists,",
    "wantWeb (true ONLY when the user explicitly asks to search the web/internet/online/news/articles), sort (relevance|newest|oldest|views|likes|comments or null),",
    'contentType ("short" | "live" | null), dateFrom, dateTo (YYYY-MM-DD or null), days (integer or null), compareEntities (array of names for compare, else null).',
    "Use action=activity for questions about the user's own search history/activity; help for greetings or unclear requests.",
    `Today is ${ctx.today}.`,
    ctx.channelTitle ? `The dashboard currently has creator "${ctx.channelTitle}" open (channel ${ctx.channelId}).` : "No creator is currently open.",
    "Never invent entities that the user did not mention.",
  ].join(" ");

export async function planRequest(message: string, history: LlmMessage[], ctx: AgentContext): Promise<{ plan: ResearchPlan; engine: "llm" | "local" }> {
  const llm = getLlm();
  if (llm) {
    try {
      const raw = await llm.complete([{ role: "system", content: SYSTEM(ctx) }, ...history.slice(-6), { role: "user", content: message }], { json: true, maxTokens: 300, temperature: 0 });
      const parsed = researchPlanSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        const plan = parsed.data;
        if (plan.days && !plan.dateFrom) {
          plan.dateFrom = addDays(ctx.today, -(plan.days - 1));
          plan.dateTo = ctx.today;
        }
        return { plan, engine: "llm" };
      }
      logger.warn("agent.plan_invalid", { issues: parsed.error.issues.length });
    } catch (err) {
      logger.warn("agent.plan_failed", { error: String((err as Error)?.message ?? err) });
    }
  }
  return { plan: localPlan(message, ctx), engine: "local" };
}

export const todayFor = (tz: string) => dayKey(new Date(), tz);
