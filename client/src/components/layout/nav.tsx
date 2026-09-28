import { BarChart3, Bookmark, Bot, CalendarDays, FlaskConical, History, LayoutDashboard, ListVideo, Search, Settings, Users, Video } from "lucide-react";
import type { ReactNode } from "react";

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

/** Sidebar navigation (in the order specified for the dashboard). */
export const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard />, end: true },
  { to: "/search", label: "YouTube Search", icon: <Search /> },
  { to: "/channels", label: "People / Channels", icon: <Users /> },
  { to: "/videos", label: "Videos", icon: <Video /> },
  { to: "/playlists", label: "Playlists", icon: <ListVideo /> },
  { to: "/history", label: "Search History", icon: <History /> },
  { to: "/analytics", label: "Analytics", icon: <BarChart3 /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarDays /> },
  { to: "/saved", label: "Saved Research", icon: <Bookmark /> },
  { to: "/research", label: "Research Workspace", icon: <FlaskConical /> },
  { to: "/agent", label: "AI Intelligence Agent", icon: <Bot /> },
  { to: "/settings", label: "Settings", icon: <Settings /> },
];

/** Mobile bottom navigation. */
export const MOBILE_NAV: NavItem[] = [
  { to: "/", label: "Home", icon: <LayoutDashboard />, end: true },
  { to: "/search", label: "Search", icon: <Search /> },
  { to: "/videos", label: "Videos", icon: <Video /> },
  { to: "/analytics", label: "Analytics", icon: <BarChart3 /> },
];
