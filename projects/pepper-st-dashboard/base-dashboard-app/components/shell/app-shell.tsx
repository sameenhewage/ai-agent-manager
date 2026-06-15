"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const close = React.useCallback(() => setMobileOpen(false), []);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[256px_1fr]">
      {/* Desktop sidebar */}
      <div className="sticky top-0 hidden h-screen md:block">
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
          <div className="fixed inset-y-0 left-0 z-50 h-screen w-64 shadow-pop">
            <Sidebar onNavigate={close} />
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 animate-fade p-[22px]">{children}</main>
      </div>
    </div>
  );
}
