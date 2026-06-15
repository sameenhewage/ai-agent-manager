"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const close = React.useCallback(() => setMobileOpen(false), []);

  return (
    // Fixed-height app frame: the document itself never scrolls. The sidebar and topbar
    // are stable chrome; only <main> scrolls (for flowing pages). A "workspace" page can
    // instead fill h-full and scroll its own inner panes (see Chat Monitor).
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden h-full w-64 shrink-0 md:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={close}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-64 shadow-pop">
            <Sidebar onNavigate={close} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="min-h-0 flex-1 animate-fade overflow-y-auto p-[22px]">{children}</main>
      </div>
    </div>
  );
}
