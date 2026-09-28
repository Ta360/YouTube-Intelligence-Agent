import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/components/auth/Auth";
import { StatusDot } from "@/components/common/states";
import { useSystemStatus } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { useTheme } from "@/theme/themeProvider";
import { NAV } from "./nav";

export function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <img src="/favicon.svg" alt="" className="size-9 shrink-0 rounded-xl" />
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-bold">YouTube Intelligence</p>
          <p className="truncate text-[11px] text-muted-foreground">Research Agent</p>
        </div>
      )}
    </div>
  );
}

/** API / connection status block (sidebar bottom). */
export function ApiStatus({ collapsed }: { collapsed?: boolean }) {
  const { data, isError } = useSystemStatus();
  const rows = data
    ? [
        { k: "YouTube API", s: data.youtube },
        { k: "Web Search", s: data.web },
        { k: "AI Agent", s: data.ai },
        { k: "Database", s: data.database },
      ]
    : [];
  if (collapsed) {
    const worst = isError ? "error" : rows.some((r) => r.s.state === "error") ? "error" : rows.some((r) => r.s.state === "demo") ? "demo" : "connected";
    return (
      <div className="flex justify-center py-1" title={rows.map((r) => `${r.k}: ${r.s.label}`).join("\n") || "Status unavailable"}>
        <StatusDot state={worst} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs" aria-label="API status">
      <p className="font-semibold text-muted-foreground">API Status</p>
      {isError && (
        <p className="flex items-center gap-2 text-danger">
          <StatusDot state="error" /> Server unreachable
        </p>
      )}
      {rows.map((r) => (
        <div key={r.k} className="flex items-center gap-2" title={r.s.detail}>
          <StatusDot state={r.s.state} />
          <span className="flex-1 text-muted-foreground">{r.k}</span>
          <span className={cn("font-medium", r.s.state === "error" && "text-danger")}>{r.s.label}</span>
        </div>
      ))}
      {data && data.dataSource === "youtube" && (
        <div className="pt-1" title="YouTube Data API units used today (UTC). Search = 100 units, details = 1.">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Quota today</span>
            <span className="tabular-nums">
              {data.quota.usedToday.toLocaleString()} / {data.quota.dailyLimit.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={data.quota.usedToday} aria-valuemax={data.quota.dailyLimit} aria-label="YouTube quota used">
            <div
              className={cn("h-full rounded-full", data.quota.usedToday / data.quota.dailyLimit > 0.8 ? "bg-warning" : "bg-primary")}
              style={{ width: `${Math.min(100, (data.quota.usedToday / data.quota.dailyLimit) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Brand collapsed={collapsed} />
      <nav aria-label="Main" className="-mx-1 flex-1 space-y-0.5 overflow-y-auto px-1 scrollbar-thin">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={onNavigate}
            title={collapsed ? n.label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-[18px] [&_svg]:shrink-0",
                isActive && "bg-primary/15 text-foreground [&_svg]:text-primary",
                collapsed && "justify-center px-0",
              )
            }
          >
            {n.icon}
            {!collapsed && <span className="truncate">{n.label}</span>}
          </NavLink>
        ))}
      </nav>
      <ApiStatus collapsed={collapsed} />
      <div className={cn("flex items-center gap-2 rounded-xl border p-2", collapsed && "flex-col")}>
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary" title={user.email}>
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          </div>
        )}
        <button type="button" onClick={toggle} className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} mode`} title="Light / dark mode">
          {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <button type="button" onClick={() => void signOut()} className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Sign out" title="Sign out">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Desktop / tablet sidebar: full on laptop+, icon rail on tablet or when collapsed. */
export function Sidebar() {
  const collapsed = useAppStore((s) => s.ui.sidebarCollapsed);
  const setUi = useAppStore((s) => s.setUi);
  return (
    <aside className={cn("glass sticky top-0 hidden h-screen shrink-0 flex-col border-y-0 border-l-0 md:flex", collapsed ? "w-[72px]" : "w-[72px] lg:w-64")}>
      <div className={cn("h-full", !collapsed && "lg:hidden")}>
        <SidebarContent collapsed />
      </div>
      {!collapsed && (
        <div className="hidden h-full lg:block">
          <SidebarContent />
        </div>
      )}
      <button
        type="button"
        onClick={() => setUi({ sidebarCollapsed: !collapsed })}
        className="absolute -right-3 top-16 hidden size-6 cursor-pointer place-items-center rounded-full border bg-card-solid text-muted-foreground shadow hover:text-foreground lg:grid"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
      </button>
    </aside>
  );
}
