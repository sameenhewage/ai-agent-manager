import { LayoutGrid, MessagesSquare, BarChart3, type LucideIcon } from "lucide-react";

export interface NavItem {
  /** Route path. */
  href: string;
  /** Sidebar + breadcrumb label. */
  label: string;
  /** Breadcrumb subtitle shown in the topbar. */
  sub: string;
  icon: LucideIcon;
}

/**
 * Phase 1 navigation is intentionally limited to the three approved surfaces
 * (CONTEXT.md §4): Dashboard, Chat Monitor, Analytics. Other prototype screens
 * (Orders, Issues, Exchanges, Follow-ups, Custom Items, Staff Tasks, Bot Status,
 * Settings) are parked and must NOT appear.
 */
export const NAV: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    sub: "Operations overview",
    icon: LayoutGrid,
  },
  {
    href: "/chat-monitor",
    label: "Chat Monitor",
    sub: "Live conversations & transcripts",
    icon: MessagesSquare,
  },
  {
    href: "/analytics",
    label: "Analytics",
    sub: "Volume, turns, tokens & cost",
    icon: BarChart3,
  },
];

/** True when `pathname` belongs to the given nav `href`. */
export function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolve the active nav item for a path (falls back to Dashboard). */
export function activeNav(pathname: string): NavItem {
  return NAV.find((n) => isActive(n.href, pathname)) ?? NAV[0];
}
