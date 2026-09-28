import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, Bot, CalendarRange, Clock, Info, LogOut, Menu, Search, Settings, ShieldOff, User, Users } from "lucide-react";
import { useAuth } from "@/components/auth/Auth";
import { StatusDot } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { Popover } from "@/components/ui/popover";
import { useSystemStatus } from "@/hooks/queries";
import { api } from "@/lib/api";
import { fmtDay, RANGE_PRESETS, todayKey } from "@/lib/dates";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";

// ─── Global search with debounced suggestions (no API quota used) ─────────────
export function GlobalSearch({ className, autoFocusKey = true }: { className?: string; autoFocusKey?: boolean }) {
  const navigate = useNavigate();
  const query = useAppStore((s) => s.searchQuery);
  const setQuery = useAppStore((s) => s.setSearchQuery);
  const [focused, setFocused] = useState(false);
  const [debounced, setDebounced] = useState(query);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!autoFocusKey) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocusKey]);

  const recent = useQuery({ queryKey: ["recentSearches"], queryFn: api.recentSearches, enabled: focused, staleTime: 30_000 });
  const channels = useQuery({ queryKey: ["library", "channels", ""], queryFn: () => api.libraryChannels(), enabled: focused, staleTime: 60_000 });

  const suggestions = useMemo(() => {
    const out: { kind: "recent" | "channel"; label: string; sub?: string; value: string; channelId?: string }[] = [];
    for (const c of channels.data?.items ?? []) {
      if (!debounced || c.title.toLowerCase().includes(debounced) || c.handle?.toLowerCase().includes(debounced)) out.push({ kind: "channel", label: c.title, sub: c.handle ?? undefined, value: c.title, channelId: c.id });
      if (out.length >= 4) break;
    }
    for (const r of recent.data?.items ?? []) {
      if (!debounced || r.query.toLowerCase().includes(debounced)) out.push({ kind: "recent", label: r.query, sub: timeAgo(r.createdAt), value: r.query });
      if (out.length >= 9) break;
    }
    return out;
  }, [channels.data, recent.data, debounced]);

  const go = (q: string) => {
    const v = q.trim();
    if (!v) return;
    setQuery(v);
    setFocused(false);
    inputRef.current?.blur();
    navigate(`/search?q=${encodeURIComponent(v)}&src=global`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = suggestions[active];
    if (s?.channelId) {
      setFocused(false);
      navigate(`/channels/${s.channelId}`);
    } else go(s ? s.value : query);
  };

  return (
    <form role="search" onSubmit={submit} className={cn("relative flex min-w-0 flex-1 items-center gap-2", className)}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, suggestions.length - 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, -1)));
            if (e.key === "Escape") inputRef.current?.blur();
          }}
          placeholder="Search person, channel, @handle, video, playlist or topic…"
          aria-label="Search YouTube"
          aria-autocomplete="list"
          aria-expanded={focused && suggestions.length > 0}
          maxLength={200}
          className="h-10 rounded-xl pl-9 pr-10"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">/</kbd>
        {focused && suggestions.length > 0 && (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-card-solid p-1.5 shadow-2xl scrollbar-thin">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.label}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (s.channelId ? (setFocused(false), navigate(`/channels/${s.channelId}`)) : go(s.value))}
                  className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent", i === active && "bg-accent")}
                >
                  {s.kind === "channel" ? <Users className="size-4 text-primary" /> : <Clock className="size-4 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {s.sub && <span className="shrink-0 text-xs text-muted-foreground">{s.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="submit" variant="gradient" className="h-10 rounded-xl px-3 sm:px-4" aria-label="Search">
        <Search /> <span className="hidden sm:inline">Search</span>
      </Button>
    </form>
  );
}

// ─── Date selector (drives every analytics view) ──────────────────────────────
export function DateRangePicker({ compactLabel }: { compactLabel?: boolean }) {
  const range = useAppStore((s) => s.dateRange);
  const setRange = useAppStore((s) => s.setDateRange);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  useEffect(() => {
    setFrom(range.from);
    setTo(range.to);
  }, [range.from, range.to]);
  const label = range.preset === "custom" ? `${fmtDay(range.from, { month: "short", day: "numeric" })} – ${fmtDay(range.to, { month: "short", day: "numeric" })}` : RANGE_PRESETS.find((p) => p.id === range.preset)?.label;
  return (
    <Popover
      className="w-72"
      trigger={({ toggle, open }) => (
        <Button variant="outline" className="h-10 rounded-xl" onClick={toggle} aria-expanded={open} aria-label={`Date range: ${label}`}>
          <CalendarRange /> <span className={cn(compactLabel && "hidden 2xl:inline")}>{label}</span>
        </Button>
      )}
    >
      {(close) => (
        <div className="space-y-2">
          <p className="px-1 text-xs font-semibold text-muted-foreground">Analytics date range</p>
          <div className="grid grid-cols-2 gap-1">
            {RANGE_PRESETS.filter((p) => p.id !== "custom").map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => (setRange(p.id), close())}
                className={cn("cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent", range.preset === p.id && "bg-primary/15 font-medium text-primary")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t pt-2">
            <p className="px-1 text-xs font-semibold text-muted-foreground">Custom</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
              <Input type="date" value={to} min={from} max={todayKey()} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
            <Button size="sm" className="w-full" disabled={!from || !to || from > to} onClick={() => (setRange("custom", { from, to }), close())}>
              Apply range
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────
function Notifications() {
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: api.notifications, refetchInterval: 120_000 });
  const items = data?.items ?? [];
  const important = items.filter((i) => i.level !== "info").length;
  return (
    <Popover
      className="w-80"
      trigger={({ toggle }) => (
        <Button variant="ghost" size="icon" className="relative rounded-xl" onClick={toggle} aria-label={`Notifications${important ? ` (${important})` : ""}`}>
          <Bell />
          {important > 0 && <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white">{important}</span>}
        </Button>
      )}
    >
      <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Notifications</p>
      {items.length === 0 ? (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">You're all caught up.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin">
          {items.map((n) => (
            <li key={n.id} className="flex gap-2 rounded-lg p-2 hover:bg-accent">
              {n.level === "info" ? <Info className="mt-0.5 size-4 shrink-0 text-secondary" /> : <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", n.level === "error" ? "text-danger" : "text-warning")} />}
              <div className="min-w-0 text-sm">
                <p className="font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.detail}</p>
                <p className="text-[11px] text-muted-foreground">{timeAgo(n.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function StatusPill() {
  const { data, isError } = useSystemStatus();
  const state = isError ? "error" : (data?.youtube.state ?? "connected");
  return (
    <div className="hidden items-center gap-2 rounded-xl border px-3 py-2 text-xs xl:flex" title={data?.youtube.detail ?? "Checking API…"}>
      <StatusDot state={state} />
      <span className="text-muted-foreground">YouTube API</span>
      <span className={cn("font-medium", state === "error" && "text-danger")}>{isError ? "Offline" : (data?.youtube.label ?? "…")}</span>
    </div>
  );
}

function UserMenu() {
  const { user, signOut, signOutEverywhere } = useAuth();
  const navigate = useNavigate();
  return (
    <Popover
      className="w-64"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="grid size-10 cursor-pointer place-items-center rounded-xl bg-primary/20 font-bold text-primary hover:bg-primary/30" aria-label="Account menu">
          {user.name.slice(0, 1).toUpperCase()}
        </button>
      )}
    >
      {(close) => (
        <div className="text-sm">
          <div className="flex items-center gap-2 border-b px-2 pb-2">
            <User className="size-4 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <button type="button" onClick={() => (close(), navigate("/settings"))} className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent">
            <Settings className="size-4" /> Settings
          </button>
          <button type="button" onClick={() => void signOut()} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent">
            <LogOut className="size-4" /> Sign out
          </button>
          <button type="button" onClick={() => void signOutEverywhere()} className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-danger hover:bg-accent">
            <ShieldOff className="size-4" /> Sign out everywhere
          </button>
        </div>
      )}
    </Popover>
  );
}

export function TopHeader({ onMenu, onAgent }: { onMenu: () => void; onAgent: () => void }) {
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0">
      <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon" className="rounded-xl md:hidden" onClick={onMenu} aria-label="Open menu">
          <Menu />
        </Button>
        <GlobalSearch />
        <div className="hidden sm:block">
          <DateRangePicker compactLabel />
        </div>
        <StatusPill />
        <Notifications />
        <Button variant="outline" size="icon" className="rounded-xl" onClick={onAgent} aria-label="Toggle AI Intelligence Agent" title="AI Intelligence Agent">
          <Bot className="text-primary" />
        </Button>
        <div className="hidden sm:block">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
