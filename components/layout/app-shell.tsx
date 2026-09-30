"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Navbar } from "./navbar";
import { Sidebar } from "./sidebar";
import { useShellSession } from "./use-shell-session";

export function AppShell({ children }: { children: ReactNode }) {
  // One session read for the whole shell, so the sidebar and the account menu share the same logout.
  const { user, logout } = useShellSession();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  // Close the mobile drawer once a navigation link has taken effect.
  useEffect(() => {
    drawerRef.current?.close();
  }, [pathname]);

  return (
    <div className="flex flex-1">
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar onLogout={logout} />
        </div>
      </aside>

      {/* Native modal dialog: closes on Escape and makes the page behind it inert, so focus stays in the drawer. */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onClick={(event) => {
          // The sidebar fills the dialog, so a click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-border bg-background p-0 text-foreground backdrop:bg-black/40"
      >
        <Sidebar onLogout={logout} onClose={() => drawerRef.current?.close()} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onLogout={logout} onOpenNavigation={() => drawerRef.current?.showModal()} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
