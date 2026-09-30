"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { Navbar } from "./navbar";
import { Sidebar, SidebarPanel } from "./sidebar";
import { useShellSession } from "./use-shell-session";

export function AppShell({ children }: { children: ReactNode }) {
  // One session read for the whole shell, so the sidebar and the account menu share the same logout.
  const { signedIn, user, logout } = useShellSession();
  const router = useRouter();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const closeDrawer = () => drawerRef.current?.close();

  // Signed out (never signed in, logged out, or the session expired): go to the sign-in page and come back after.
  // This only guides people; the API checks the token on every request.
  useEffect(() => {
    if (signedIn === false) router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [signedIn, pathname, router]);

  return (
    <div className="flex flex-1">
      <Sidebar onLogout={logout} />

      {/* Mobile and tablet navigation. A native modal dialog closes on Escape and keeps focus inside the drawer. */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onClick={(event) => {
          // The panel fills the dialog, so a click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) closeDrawer();
        }}
        className="m-0 h-dvh max-h-none w-70 max-w-[85vw] border-r border-white/8 bg-zinc-950 p-0 backdrop:bg-black/50"
      >
        <SidebarPanel onLogout={logout} onClose={closeDrawer} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onLogout={logout} onOpenNavigation={() => drawerRef.current?.showModal()} />
        <main className="flex-1 p-4 lg:p-6">{signedIn === false ? null : children}</main>
      </div>
    </div>
  );
}
