import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Bot, MoreHorizontal } from "lucide-react";
import { AIAgentPanel } from "@/components/agent/AIAgentPanel";
import { Toaster } from "@/components/common/toast";
import { Sheet } from "@/components/ui/primitives";
import { VideoDetailsPanel } from "@/components/video/VideoDetailsPanel";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/appStore";
import { MOBILE_NAV } from "./nav";
import { Sidebar, SidebarContent } from "./Sidebar";
import { TopHeader } from "./TopHeader";

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatches(m.matches);
    on();
    m.addEventListener("change", on);
    window.addEventListener("resize", on);
    return () => {
      m.removeEventListener("change", on);
      window.removeEventListener("resize", on);
    };
  }, [query]);
  return matches;
}

/**
 * Desktop:  left sidebar · main dashboard · right AI agent (docked)
 * Tablet:   icon-rail sidebar · main · AI agent as slide-over
 * Mobile:   hamburger + bottom navigation · full-width main · AI agent slide-over
 */
export function DashboardLayout({ children }: { children: ReactNode }) {
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const agentDocked = useAppStore((s) => s.ui.agentOpen);
  const setUi = useAppStore((s) => s.setUi);
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentSheet, setAgentSheet] = useState(false);
  const { pathname } = useLocation();
  const onAgentPage = pathname === "/agent";

  useEffect(() => setMenuOpen(false), [pathname]);

  // Read the live media query at click time (a stale flag would toggle the hidden dock instead of the sheet).
  const toggleAgent = () => (window.matchMedia("(min-width: 1280px)").matches ? setUi({ agentOpen: !agentDocked }) : setAgentSheet((o) => !o));
  const showDock = isDesktop && agentDocked && !onAgentPage;

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader onMenu={() => setMenuOpen(true)} onAgent={toggleAgent} />
        <main id="main" className="min-w-0 flex-1 space-y-5 px-3 pb-24 pt-4 sm:px-5 md:pb-8">
          <VideoPlayer />
          {children}
        </main>
      </div>

      {showDock && (
        <aside className="glass sticky top-0 hidden h-screen w-[380px] shrink-0 xl:block border-y-0 border-r-0 2xl:w-[420px]" aria-label="AI Intelligence Agent">
          <AIAgentPanel onClose={() => setUi({ agentOpen: false })} />
        </aside>
      )}

      {/* Tablet / mobile: AI agent slide-over */}
      <Sheet open={!isDesktop && agentSheet} onClose={() => setAgentSheet(false)} title="AI Intelligence Agent" className="max-w-md [&>button]:hidden">
        <AIAgentPanel onClose={() => setAgentSheet(false)} />
      </Sheet>

      {/* Mobile menu */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} side="left" title="Navigation" className="max-w-72">
        <SidebarContent onNavigate={() => setMenuOpen(false)} />
      </Sheet>

      {/* Mobile bottom navigation */}
      <nav aria-label="Mobile" className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground [&_svg]:size-5", isActive && "text-primary")}>
            {n.icon}
            {n.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setAgentSheet(true)} className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground [&_svg]:size-5">
          <Bot className="text-primary" />
          Agent
        </button>
        <button type="button" onClick={() => setMenuOpen(true)} className="flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground [&_svg]:size-5">
          <MoreHorizontal />
          More
        </button>
      </nav>

      <VideoDetailsPanel />
      <Toaster />
    </div>
  );
}
