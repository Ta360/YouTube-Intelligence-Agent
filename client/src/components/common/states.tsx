import type { ReactNode } from "react";
import { AlertTriangle, Clock3, KeyRound, SearchX, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api";
import type { DataSource, ResultSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, ReactNode> = {
  QUOTA_EXCEEDED: <Clock3 />,
  RATE_LIMITED: <Clock3 />,
  API_KEY_INVALID: <KeyRound />,
  API_NOT_CONFIGURED: <KeyRound />,
  NETWORK_ERROR: <WifiOff />,
  NO_RESULTS: <SearchX />,
  CHANNEL_NOT_FOUND: <SearchX />,
  VIDEO_UNAVAILABLE: <SearchX />,
  PLAYLIST_NOT_FOUND: <SearchX />,
};
const TITLES: Record<string, string> = {
  QUOTA_EXCEEDED: "YouTube API quota exceeded",
  RATE_LIMITED: "Slow down a little",
  API_KEY_INVALID: "YouTube API key problem",
  API_NOT_CONFIGURED: "YouTube API not configured",
  NETWORK_ERROR: "Connection problem",
  NO_RESULTS: "No results",
  CHANNEL_NOT_FOUND: "Channel not found",
  VIDEO_UNAVAILABLE: "Video unavailable",
  PLAYLIST_NOT_FOUND: "Playlist not found",
  INVALID_QUERY: "Check your search",
  INVALID_INPUT: "Check your input",
  WEB_SEARCH_FAILED: "Web search failed",
};

/** Helpful error state — never a blank page. */
export function ErrorState({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const code = error instanceof ApiError ? error.code : "INTERNAL";
  const message = error instanceof Error ? error.message : "Something went wrong.";
  const notFound = ["NO_RESULTS", "CHANNEL_NOT_FOUND", "VIDEO_UNAVAILABLE", "PLAYLIST_NOT_FOUND"].includes(code);
  return (
    <Card role="alert" className={cn("flex flex-col items-center gap-2 p-6 text-center", compact && "p-4", className)}>
      <div className={cn("grid size-11 place-items-center rounded-xl [&_svg]:size-5", notFound ? "bg-muted text-muted-foreground" : "bg-danger/15 text-danger")}>{ICONS[code] ?? <AlertTriangle />}</div>
      <p className="font-semibold">{TITLES[code] ?? "Something went wrong"}</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {code === "API_KEY_INVALID" || code === "API_NOT_CONFIGURED" ? <p className="text-xs text-muted-foreground">See Settings → API configuration.</p> : null}
      {onRetry && !notFound && (
        <Button size="sm" variant="outline" className="mt-1" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center", className)}>
      {icon && <div className="grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function DemoBadge({ dataSource }: { dataSource?: DataSource }) {
  if (dataSource !== "mock") return null;
  return (
    <Badge variant="demo" title="Fictional demo data — set YOUTUBE_API_KEY for real YouTube results">
      DEMO DATA
    </Badge>
  );
}

const SOURCE_VARIANT: Record<ResultSource, "danger" | "info" | "warning" | "default"> = { YouTube: "danger", "Web Search": "info", Playlist: "warning", Channel: "default" };
export function SourceBadge({ source }: { source?: ResultSource }) {
  if (!source) return null;
  return <Badge variant={SOURCE_VARIANT[source]}>{source}</Badge>;
}

export function StatusDot({ state }: { state: string }) {
  const color = state === "connected" || state === "online" ? "bg-success" : state === "local" || state === "demo" ? "bg-warning" : state === "not_configured" ? "bg-muted-foreground" : "bg-danger";
  return (
    <span className="relative inline-flex size-2.5 shrink-0" aria-hidden>
      {(state === "connected" || state === "online") && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-40", color)} />}
      <span className={cn("relative inline-flex size-2.5 rounded-full", color)} />
    </span>
  );
}

export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, icon, actions }: { title: string; description?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary [&_svg]:size-5">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
