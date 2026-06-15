"use client";

import { usePathname } from "next/navigation";
import { Menu, Lock } from "lucide-react";
import { activeNav } from "./nav-items";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const pathname = usePathname();
  const current = activeNav(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-[62px] items-center gap-3.5 border-b border-line bg-panel/85 px-5 backdrop-blur-md">
      <button
        type="button"
        onClick={onMenu}
        title="Menu"
        aria-label="Open menu"
        className="flex size-9 items-center justify-center rounded-sm border border-line bg-panel text-muted hover:bg-hover hover:text-text md:hidden"
      >
        <Menu className="size-[17px]" strokeWidth={1.9} />
      </button>

      <div className="leading-tight">
        <div className="text-[14.5px] font-extrabold tracking-[-0.01em]">
          {current.label}
        </div>
        <div className="text-[11.5px] font-medium text-muted">{current.sub}</div>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden items-center gap-1.5 rounded-full bg-ai-weak px-2.5 py-1 text-[10.5px] font-bold text-ai sm:inline-flex">
          <Lock className="size-3" strokeWidth={2.2} />
          Read-only · Phase 1
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
