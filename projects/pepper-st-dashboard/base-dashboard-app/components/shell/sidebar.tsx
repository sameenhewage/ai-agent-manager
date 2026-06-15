"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav-items";

const TRACKED = ["Conversations", "Transcripts", "Timestamps", "Tokens & cost"];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-panel">
      {/* Brand */}
      <div className="flex items-center gap-3 px-[18px] pb-3 pt-[18px]">
        <div className="flex size-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-accent to-[#9d174d] text-[15px] font-extrabold text-white shadow-card">
          PS
        </div>
        <div className="leading-[1.05]">
          <div className="text-[16px] font-extrabold tracking-[-0.02em]">
            PEPPER ST.
          </div>
          <div className="mt-[3px] text-[10.5px] font-medium text-muted">
            AI Chat Operations
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-auto px-3 py-1">
        <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[0.09em] text-faint">
          Operate
        </div>
        {NAV.map((item) => {
          const active = isActive(item.href, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "my-px flex items-center gap-[11px] rounded-sm px-[11px] py-2 text-[13.5px] font-semibold transition-colors",
                active
                  ? "bg-accent-weak text-accent"
                  : "text-muted hover:bg-hover hover:text-text"
              )}
            >
              <Icon className="size-[17px] shrink-0" strokeWidth={1.9} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* What this console tracks (Phase 1, real data only) */}
      <div className="m-3 rounded-lg border border-dashed border-line bg-panel2 px-3 py-[11px]">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.06em] text-faint">
          Tracked by this console
        </div>
        <div className="flex flex-wrap gap-[5px]">
          {TRACKED.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line bg-panel px-[7px] py-0.5 text-[10px] font-semibold text-muted"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Tenant workspace (no fabricated user — auth is parked) */}
      <div className="mx-3 mb-3.5 mt-2 flex items-center gap-2.5 rounded-lg border border-line bg-panel2 p-2.5">
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-[#9d174d] text-[12px] font-bold text-white">
          PS
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-bold">PEPPER ST.</div>
          <div className="text-[11px] text-muted">Tenant workspace</div>
        </div>
      </div>
    </aside>
  );
}
