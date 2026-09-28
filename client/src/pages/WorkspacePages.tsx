import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bookmark, Bot, FlaskConical, ListVideo, Loader2, Plus, Save, Search, Trash2, Users, Video } from "lucide-react";
import { AgentComposer, AgentConversation, useAgent } from "@/components/agent/AIAgentPanel";
import { ResearchResultView } from "@/components/agent/ResearchResult";
import { ChartCard, SimpleBarChart, Segmented } from "@/components/charts/Charts";
import { EmptyState, ErrorState, LoadingGrid, PageHeader, SectionTitle } from "@/components/common/states";
import { toast } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { Avatar, ChannelCard, PlaylistGrid } from "@/components/video/Cards";
import { VideoGrid } from "@/components/video/VideoCard";
import { useResearchSessions } from "@/hooks/queries";
import { api } from "@/lib/api";
import { compact, pct, timeAgo } from "@/lib/format";
import type { ResearchSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useChartTheme } from "@/theme/chartTheme";

// ─── Saved Research ───────────────────────────────────────────────────────────
export function SavedPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["saved"], queryFn: api.saved });
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const del = useMutation({
    mutationFn: (id: string) => api.deleteSavedResearch(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["saved"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const saveNote = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.saveResearch({ kind: "NOTE", title: title.trim(), payload: { note: note.trim() } });
      setTitle("");
      setNote("");
      toast.success("Research saved");
      void qc.invalidateQueries({ queryKey: ["saved"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  if (q.isLoading) return <LoadingGrid />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <div className="space-y-5">
      <PageHeader icon={<Bookmark />} title="Saved Research" description="Creators, videos, playlists, searches and AI research sessions you saved." />
      <Tabs defaultValue="research">
        <TabsList>
          <TabsTrigger value="research">
            <FlaskConical /> Research ({d.research.length})
          </TabsTrigger>
          <TabsTrigger value="creators">
            <Users /> Creators ({d.channels.length})
          </TabsTrigger>
          <TabsTrigger value="videos">
            <Video /> Videos ({d.videos.length})
          </TabsTrigger>
          <TabsTrigger value="playlists">
            <ListVideo /> Playlists ({d.playlists.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="research" className="space-y-4">
          <Card className="p-4">
            <form onSubmit={saveNote} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Research title" aria-label="Research title" maxLength={160} required />
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notes / findings (optional)" aria-label="Notes" maxLength={2000} />
              <Button type="submit" disabled={!title.trim()}>
                <Save /> SAVE RESEARCH
              </Button>
            </form>
          </Card>
          {d.research.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {d.research.map((r) => {
                const payload = r.payload as { kind?: string; note?: string } | null;
                return (
                  <li key={r.id}>
                    <Card className="space-y-2 p-4">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{r.title}</p>
                          <p className="text-xs text-muted-foreground">
                            <Badge variant="outline" className="mr-1.5 capitalize">
                              {r.kind.replace("_", " ").toLowerCase()}
                            </Badge>
                            {timeAgo(r.createdAt)}
                          </p>
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(r.id)} aria-label={`Delete ${r.title}`} className="hover:text-danger">
                          <Trash2 />
                        </Button>
                      </div>
                      {payload?.note && <p className="text-sm text-muted-foreground">{payload.note}</p>}
                      {r.query && <p className="text-sm">Query: “{r.query}”</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {r.query && (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/search?q=${encodeURIComponent(r.query!)}&src=history`)}>
                            <Search /> Run again
                          </Button>
                        )}
                        {r.kind === "CREATOR" || (r.kind === "SEARCH" && r.refId) ? (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/channels/${r.refId}`)}>
                            <Users /> Creator
                          </Button>
                        ) : null}
                        {r.kind === "RESEARCH_SESSION" && r.refId && (
                          <Button size="sm" variant="outline" onClick={() => (useAppStore.getState().setResearchSession(r.refId), navigate("/research"))}>
                            <FlaskConical /> Open workspace
                          </Button>
                        )}
                      </div>
                      {r.kind === "AI_SESSION" && payload?.kind && payload.kind !== "help" ? (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-primary">Show research result</summary>
                          <div className="mt-2">
                            <ResearchResultView payload={r.payload as never} />
                          </div>
                        </details>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={<FlaskConical />} title="No saved research yet" description="Use “Save research” on search results, the AI agent or the research workspace." />
          )}
        </TabsContent>
        <TabsContent value="creators">
          {d.channels.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {d.channels.map((c) => (
                <ChannelCard key={c.channel.id} channel={c.channel} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Users />} title="No saved creators" />
          )}
        </TabsContent>
        <TabsContent value="videos">{d.videos.length ? <VideoGrid videos={d.videos.map((v) => v.video)} /> : <EmptyState icon={<Video />} title="No saved videos" />}</TabsContent>
        <TabsContent value="playlists">{d.playlists.length ? <PlaylistGrid playlists={d.playlists.map((p) => p.playlist)} /> : <EmptyState icon={<ListVideo />} title="No saved playlists" />}</TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Research Workspace ──────────────────────────────────────────────────────
function Comparison({ session }: { session: ResearchSession }) {
  const t = useChartTheme();
  const [days, setDays] = useState(30);
  const creators = session.items.filter((i) => i.kind === "CHANNEL").length;
  const q = useQuery({ queryKey: ["research", "compare", session.id, days, creators], queryFn: () => api.compareSession(session.id, days), enabled: creators > 0 });
  if (!creators) return <EmptyState icon={<Users />} title="Add creators to compare them" description="Comparative analytics appear once the session has at least one creator." />;
  if (q.isLoading) return <LoadingGrid count={2} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const rows = q.data.creators.map((c) => ({ name: c.title, subscribers: c.subscriberCount ?? 0, uploads: c.window.count, avgViews: c.window.avgViews ?? 0, engagement: c.window.avgEngagement ?? 0 }));
  return (
    <div className="space-y-4">
      <SectionTitle title="Comparative analytics" description={`Uploads and performance over the last ${days} days (from loaded public videos)`} actions={<Segmented label="Window" value={String(days)} onChange={(v) => setDays(Number(v))} options={[{ id: "7", label: "7d" }, { id: "30", label: "30d" }, { id: "90", label: "90d" }, { id: "365", label: "1y" }]} />} />
      <Card className="overflow-x-auto p-0 scrollbar-thin">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Creator</th>
              <th className="px-3 py-2 text-right font-medium">Subscribers</th>
              <th className="px-3 py-2 text-right font-medium">Total views</th>
              <th className="px-3 py-2 text-right font-medium">Uploads ({days}d)</th>
              <th className="px-3 py-2 text-right font-medium">Shorts</th>
              <th className="px-3 py-2 text-right font-medium">Avg views</th>
              <th className="px-3 py-2 text-right font-medium">Engagement</th>
            </tr>
          </thead>
          <tbody>
            {q.data.creators.map((c) => (
              <tr key={c.channelId} className="border-t">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar src={c.thumbnailUrl} name={c.title} className="size-7" />
                    <span className="font-medium">{c.title}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{compact(c.subscriberCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{compact(c.channelViewCount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.window.count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.window.shorts}</td>
                <td className="px-3 py-2 text-right tabular-nums">{compact(c.window.avgViews)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(c.window.avgEngagement, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <ChartCard title="Subscribers">
          <SimpleBarChart data={rows} xKey="name" yKey="subscribers" name="Subscribers" color={t.colors.primary} />
        </ChartCard>
        <ChartCard title={`Uploads (${days}d)`}>
          <SimpleBarChart data={rows} xKey="name" yKey="uploads" name="Uploads" color={t.colors.secondary} />
        </ChartCard>
        <ChartCard title="Average views">
          <SimpleBarChart data={rows} xKey="name" yKey="avgViews" name="Avg views" color={t.colors.warning} />
        </ChartCard>
        <ChartCard title="Engagement %">
          <SimpleBarChart data={rows} xKey="name" yKey="engagement" name="Engagement %" color={t.colors.pink} />
        </ChartCard>
      </div>
    </div>
  );
}

function AddCreator({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const found = useQuery({ queryKey: ["channelSearch", submitted], queryFn: () => api.channelSearch(submitted), enabled: Boolean(submitted), retry: false });
  const add = useMutation({
    mutationFn: (youtubeId: string) => api.addResearchItem(sessionId, { kind: "CHANNEL", youtubeId }),
    onSuccess: (r) => {
      toast.success(`Added ${r.title}`);
      void qc.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-2">
      <form onSubmit={(e) => (e.preventDefault(), setSubmitted(q.trim()))} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a creator by name or @handle" aria-label="Add a creator" maxLength={100} />
        <Button type="submit" variant="outline" disabled={!q.trim() || found.isFetching}>
          {found.isFetching ? <Loader2 className="animate-spin" /> : <Plus />} Find
        </Button>
      </form>
      {found.error && <ErrorState error={found.error} compact />}
      {found.data && (
        <div className="flex flex-wrap gap-2">
          {found.data.items.slice(0, 6).map((c) => (
            <button key={c.id} type="button" onClick={() => add.mutate(c.id)} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm hover:bg-accent">
              <Avatar src={c.thumbnailUrl} name={c.title} className="size-6" />
              <span className="max-w-40 truncate">{c.title}</span>
              <span className="text-xs text-muted-foreground">{compact(c.subscriberCount)}</span>
              <Plus className="size-3.5 text-primary" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ResearchPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useResearchSessions();
  const activeId = useAppStore((s) => s.researchSessionId);
  const setActive = useAppStore((s) => s.setResearchSession);
  const [name, setName] = useState("");
  const sessions = data?.items ?? [];
  const session = sessions.find((s) => s.id === activeId) ?? sessions[0];

  const create = useMutation({
    mutationFn: () => api.createResearchSession({ name: name.trim() }),
    onSuccess: (s) => {
      setActive(s.id);
      setName("");
      void qc.invalidateQueries({ queryKey: ["research"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteResearchSession(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["research"] }),
  });
  const removeItem = useMutation({
    mutationFn: (p: { sid: string; itemId: string }) => api.removeResearchItem(p.sid, p.itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["research"] }),
  });
  const saveSession = async () => {
    if (!session) return;
    try {
      await api.saveResearch({ kind: "RESEARCH_SESSION", title: session.name, refId: session.id, payload: { items: session.items.map((i) => ({ kind: i.kind, id: i.youtubeId, title: i.title })) } });
      toast.success("Research session saved");
      void qc.invalidateQueries({ queryKey: ["saved"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={<FlaskConical />} title="Research Workspace" description="Group creators, videos and playlists into research sessions and compare them side by side." />
      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <Card className="h-fit space-y-3 p-3">
          <form onSubmit={(e) => (e.preventDefault(), name.trim() && create.mutate())} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New session, e.g. “AI Creator Research”" aria-label="New research session name" maxLength={120} />
            <Button type="submit" size="icon" disabled={!name.trim()} aria-label="Create session">
              <Plus />
            </Button>
          </form>
          {isLoading ? <LoadingGrid count={1} /> : error ? <ErrorState error={error} onRetry={() => void refetch()} compact /> : sessions.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">No sessions yet. Create one, or use “Add to research” on any creator, video or playlist.</p>
          ) : (
            <ul className="space-y-1">
              {sessions.map((s) => (
                <li key={s.id} className={cn("group flex items-center rounded-lg hover:bg-accent", s.id === session?.id && "bg-primary/15")}>
                  <button type="button" onClick={() => setActive(s.id)} className="min-w-0 flex-1 cursor-pointer px-2.5 py-2 text-left">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.items.length} items · {timeAgo(s.updatedAt)}
                    </p>
                  </button>
                  <button type="button" onClick={() => remove.mutate(s.id)} className="mr-1 cursor-pointer rounded p-1.5 text-muted-foreground opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${s.name}`}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {session ? (
          <div className="min-w-0 space-y-5">
            <Card className="space-y-4 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Research session</p>
                  <h2 className="truncate text-xl font-bold">{session.name}</h2>
                </div>
                <Button size="sm" variant="outline" onClick={saveSession}>
                  <Save /> SAVE RESEARCH
                </Button>
              </div>
              <AddCreator sessionId={session.id} />
              {session.items.length ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {session.items.map((i) => (
                    <div key={i.id} className="flex items-center gap-2 rounded-xl border p-2">
                      {i.thumbnailUrl ? <img src={i.thumbnailUrl} alt="" className={cn("shrink-0 object-cover", i.kind === "CHANNEL" ? "size-9 rounded-full" : "h-9 w-16 rounded-md")} loading="lazy" /> : <div className="size-9 rounded-md bg-muted" />}
                      <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => navigate(i.kind === "CHANNEL" ? `/channels/${i.youtubeId}` : i.kind === "PLAYLIST" ? `/playlists/${i.youtubeId}` : `/videos`)}>
                        <p className="truncate text-sm font-medium">{i.title}</p>
                        <p className="text-[11px] capitalize text-muted-foreground">{i.kind.toLowerCase()}</p>
                      </button>
                      <Button size="icon-sm" variant="ghost" onClick={() => removeItem.mutate({ sid: session.id, itemId: i.id })} aria-label={`Remove ${i.title}`} className="hover:text-danger">
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This session is empty — add creators above, or use the flask button on any video, playlist or creator.</p>
              )}
            </Card>
            <Comparison session={session} />
          </div>
        ) : (
          <EmptyState icon={<FlaskConical />} title="Create your first research session" description="For example “AI Creator Research” with Creator A, B and C — then compare them." />
        )}
      </div>
    </div>
  );
}

// ─── AI Agent (full page) ─────────────────────────────────────────────────────
export function AgentPage() {
  const messages = useAppStore((s) => s.aiMessages);
  const { newSession } = useAgent();
  const lastResearch = [...messages].reverse().find((m) => m.payload && m.payload.kind !== "help" && !m.pending);
  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Bot />}
        title="AI Intelligence Agent"
        description="Ask in natural language — the agent identifies creators, searches YouTube (and the web when asked), and shows results you can play here."
        actions={
          <Button variant="outline" size="sm" onClick={newSession}>
            <Plus /> New session
          </Button>
        }
      />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card className="flex h-[70vh] min-h-[28rem] flex-col overflow-hidden">
          <AgentConversation full />
          <AgentComposer />
        </Card>
        <div className="min-w-0 space-y-3">
          <SectionTitle title="Latest research result" description="Every video card plays in the dashboard player." />
          {lastResearch?.payload ? <ResearchResultView payload={lastResearch.payload} full /> : <EmptyState icon={<Search />} title="No research yet" description="Ask the agent something like “Find the most viewed videos from Veritasium”." />}
        </div>
      </div>
    </div>
  );
}
