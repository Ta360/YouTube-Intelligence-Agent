/**
 * LLM provider abstraction. The agent only depends on `LlmProvider`; add another vendor by
 * implementing `complete()` and returning it from `getLlm()`. Keys never leave the server.
 */
import { env } from "../../config/env.js";
import { recordApiUsage } from "../apiUsageService.js";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(messages: LlmMessage[], opts?: { json?: boolean; maxTokens?: number; temperature?: number }): Promise<string>;
}

class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    readonly model: string,
  ) {}

  async complete(messages: LlmMessage[], opts: { json?: boolean; maxTokens?: number; temperature?: number } = {}) {
    let ok = false;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 700,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`OPENAI_HTTP_${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      ok = true;
      return body.choices?.[0]?.message?.content ?? "";
    } finally {
      await recordApiUsage("openai", "chat.completions", 1, ok, ok ? undefined : "LLM_ERROR");
    }
  }
}

let llm: LlmProvider | null | undefined;

export function getLlm(): LlmProvider | null {
  if (llm !== undefined) return llm;
  llm = env.llm.provider === "openai" && env.llm.openaiKey ? new OpenAiProvider(env.llm.openaiKey, env.llm.openaiModel) : null;
  return llm;
}

export const llmConfigured = () => getLlm() !== null;
