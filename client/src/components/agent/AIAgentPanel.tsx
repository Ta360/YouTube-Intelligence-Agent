import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bot, History, Loader2, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/popover";
import { StatusDot } from "@/components/common/states";
import { useSystemStatus } from "@/hooks/queries";
import { api, ApiError } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import type { AgentMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { ResearchResultView } from "./ResearchResult";

export const EXAMPLE_PROMPTS = [
  "Find all videos from MrBeast.",
  "Show me the latest videos from this creator.",
  "Find playlists related to this person.",
  "Search the web for videos featuring this person.",
  "Find the most viewed videos from this channel.",
  "Compare this creator's videos over the last 30 days.",
  "Find videos about AI from this creator.",
  "Search YouTube and the web for this person.",
];

/** Sends a message to the agent, updating the conversation in the store. */
export function useAgent() {
  const qc = useQueryClient();
  const sessionId = useAppStore((s) => s.aiSessionId);
  const setSession = useAppStore((s) => s.setAiSession);
  const push = useAppStore((s) => s.pushAiMessage);
  const replace = useAppStore((s) => s.replaceAiMessage);
  const channelId = useAppStore((s) => s.selectedCreatorId);
  const videoId = useAppStore((s) => s.selectedVideo?.id);
  const busy = useAppStore((s) => s.aiBusy);
  const setBusy = (b: boolean) => useAppStore.setState({ aiBusy: b });

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    const now = new Date().toISOString();
    const pendingId = `pending-${Date.now()}`;
    push({ id: `u-${Date.now()}`, role: "user", content: message, createdAt: now });
    push({ id: pendingId, role: "assistant", content: "Researching…", createdAt: now, pending: true });
    setBusy(true);
    try {
      const r = await api.agentChat({ message, sessionId: sessionId ?? undefined, context: { channelId: channelId ?? undefined, videoId: videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : undefined } });
      if (r.sessionId !== sessionId) useAppStore.setState({ aiSessionId: r.sessionId });
      replace(pendingId, r.message);
      for (const k of ["analytics", "history", "calendar", "recentSearches", "agentSessions", "library", "notifications", "status"]) void qc.invalidateQueries({ queryKey: [k] });
    } catch (err) {
      replace(pendingId, { id: pendingId, role: "assistant", content: err instanceof ApiError ? err.message : "The agent couldn't complete that request.", error: true, createdAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };
  return { send, busy, newSession: () => setSession(null, []) };
}

/** Sends a request to the agent and makes sure its answer is visible (dock on desktop, agent page otherwise). */
export function useAskAgent() {
  const { send } = useAgent();
  const navigate = useNavigate();
  return (message: string) => {
    const docked = window.matchMedia("(min-width: 1280px)").matches && useAppStore.getState().ui.agentOpen;
    if (!docked) navigate("/agent");
    void send(message);
  };
}

function MessageBubble({ m, query }: { m: AgentMessage; query?: string }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-white">{m.content}</p>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <div className="grid size-7 shrink-0 place-items-center rounded-lg brand-gradient text-white">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className={cn("whitespace-pre-wrap rounded-2xl rounded-tl-md bg-muted/70 px-3 py-2 text-sm", m.error && "border border-danger/40 text-danger")}>
          {m.pending ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Researching YouTube…
            </span>
          ) : (
            m.content
          )}
        </div>
        {m.payload && m.payload.kind !== "help" && <ResearchResultView payload={m.payload} query={query} />}
      </div>
    </div>
  );
}

export function AgentConversation({ className, full }: { className?: string; full?: boolean }) {
  const messages = useAppStore((s) => s.aiMessages);
  const { send, busy } = useAgent();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className={cn("flex-1 space-y-4 overflow-y-auto p-3 scrollbar-thin", className)} aria-live="polite">
      {messages.length === 0 ? (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Sparkles className="mb-1 size-4 text-primary" />
            I identify channels, pull their public videos and playlists from the YouTube Data API, search the web when you ask, and put every result in the dashboard — press <b>Play</b> to watch without leaving.
          </div>
          <p className="text-xs font-semibold text-muted-foreground">Try asking</p>
          <div className={cn("flex flex-col gap-1.5", full && "sm:grid sm:grid-cols-2")}>
            {EXAMPLE_PROMPTS.map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => void send(p)} className="cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/60 hover:bg-accent disabled:opacity-50">
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : (
        messages.map((m, i) => <MessageBubble key={m.id} m={m} query={messages[i - 1]?.role === "user" ? messages[i - 1]!.content : undefined} />)
      )}
      <div ref={endRef} />
    </div>
  );
}

export function AgentComposer() {
  const { send, busy } = useAgent();
  const [text, setText] = useState("");
  const channelId = useAppStore((s) => s.selectedCreatorId);
  const clearCreator = useAppStore((s) => s.setSelectedCreator);
  const { data: channel } = useQuery({ queryKey: ["channel", channelId], queryFn: () => api.channel(channelId!), enabled: Boolean(channelId), staleTime: 10 * 60_000, retry: false });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    setText("");
    void send(t);
  };
  return (
    <form onSubmit={submit} className="space-y-2 border-t p-3">
      {channel && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Context:</span>
          <Badge variant="default" className="max-w-[70%]">
            <span className="truncate">“this creator” = {channel.title}</span>
          </Badge>
          <button type="button" onClick={() => clearCreator(null)} className="cursor-pointer rounded p-0.5 hover:bg-accent" aria-label="Clear creator context">
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={2}
          maxLength={1000}
          placeholder="Ask me to research YouTube and the web…"
          aria-label="Message the AI Intelligence Agent"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-input bg-background/60 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" className="size-10 rounded-xl" disabled={busy || !text.trim()} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
    </form>
  );
}

function SessionMenu() {
  const qc = useQueryClient();
  const setSession = useAppStore((s) => s.setAiSession);
  const current = useAppStore((s) => s.aiSessionId);
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ queryKey: ["agentSessions"], queryFn: api.agentSessions, enabled: open });
  const load = async (id: string) => {
    const s = await api.agentSession(id);
    setSession(s.id, s.messages.map((m) => ({ ...m, role: m.role as "user" | "assistant" })));
    setOpen(false);
  };
  return (
    <Popover
      className="w-72"
      open={open}
      onOpenChange={setOpen}
      trigger={({ toggle }) => (
        <Button size="icon-sm" variant="ghost" onClick={toggle} aria-label="Previous AI sessions" title="Previous sessions">
          <History />
        </Button>
      )}
    >
      <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">AI research sessions</p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin">
        {(data?.items ?? []).length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">No sessions yet.</li>}
        {data?.items.map((s) => (
          <li key={s.id} className={cn("group flex items-center gap-1 rounded-lg hover:bg-accent", s.id === current && "bg-primary/10")}>
            <button type="button" onClick={() => void load(s.id)} className="min-w-0 flex-1 cursor-pointer px-2 py-1.5 text-left">
              <p className="truncate text-sm">{s.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {s.messages} messages · {timeAgo(s.updatedAt)}
              </p>
            </button>
            <button
              type="button"
              aria-label="Delete session"
              className="mr-1 cursor-pointer rounded p-1 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100"
              onClick={async () => {
                await api.deleteAgentSession(s.id);
                if (s.id === current) setSession(null, []);
                void qc.invalidateQueries({ queryKey: ["agentSessions"] });
              }}
            >
              <Trash2 className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}

/** Persistent right-side AI Intelligence Agent panel. */
export function AIAgentPanel({ onClose }: { onClose?: () => void }) {
  const { newSession } = useAgent();
  const { data: status } = useSystemStatus();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b p-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl brand-gradient text-white">
          <Bot className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-wide">AI INTELLIGENCE AGENT</p>
          <p className="truncate text-xs text-muted-foreground">Ask me to research YouTube and the web</p>
          {status && (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground" title={status.ai.detail}>
              <StatusDot state={status.ai.state} /> {status.ai.label}
              <span className="mx-1">·</span>
              <StatusDot state={status.web.state} /> Web {status.web.state === "connected" ? "on" : "off"}
            </p>
          )}
        </div>
        <SessionMenu />
        <Button size="icon-sm" variant="ghost" onClick={newSession} aria-label="New research session" title="New session">
          <Plus />
        </Button>
        {onClose && (
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close AI agent">
            <X />
          </Button>
        )}
      </div>
      <AgentConversation />
      <AgentComposer />
    </div>
  );
}
