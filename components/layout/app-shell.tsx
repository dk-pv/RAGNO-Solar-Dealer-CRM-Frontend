"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { ErrorState } from "@/components/leads/ui";
import { Navbar } from "./navbar";
import { blockedEntryFor } from "./navigation";
import { Sidebar, SidebarPanel } from "./sidebar";
import { CurrentUserContext, useShellSession } from "./use-shell-session";

export function AppShell({ children }: { children: ReactNode }) {
  // One session read for the whole shell, so the sidebar and the account menu share the same logout.
  const { signedIn, user, userError, reloadUser, logout } = useShellSession();
  const router = useRouter();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const closeDrawer = () => drawerRef.current?.close();

  // Signed out (never signed in, logged out, or the session expired): go to the sign-in page and come back after.
  // This only guides people; the API checks the token on every request.
  useEffect(() => {
    if (signedIn === false) router.replace(`/login?next=${encodeURIComponent(pathname + window.location.search)}`);
  }, [signedIn, pathname, router]);

  // A page renders once the user is known, and only if they can open its module, so a staff member without access
  // never loads it. This is only for people: the API refuses the same requests on its own.
  let content: ReactNode = null;
  if (user) {
    const blocked = blockedEntryFor(user, pathname);
    content = blocked ? (
      <ErrorState title="You don't have access to this page" message={`Ask an admin to give you access to ${blocked.label}.`} />
    ) : (
      children
    );
  } else if (userError) {
    content = <ErrorState title="Couldn't load your account" message={userError.message} onRetry={reloadUser} />;
  }

  return (
    <div className="flex flex-1">
      <Sidebar user={user} onLogout={logout} />

      {/* Mobile and tablet navigation. A native modal dialog closes on Escape and keeps focus inside the drawer. */}
      <dialog
        ref={drawerRef}
        aria-label="Navigation"
        onClick={(event) => {
          // The panel fills the dialog, so a click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) closeDrawer();
        }}
        className="m-0 h-dvh max-h-none w-70 max-w-[85vw] border-r border-border bg-background p-0 backdrop:bg-foreground/30"
      >
        <SidebarPanel user={user} onLogout={logout} onClose={closeDrawer} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar user={user} onLogout={logout} onOpenNavigation={() => drawerRef.current?.showModal()} />
        <main className="flex-1 p-4 lg:p-6">
          <CurrentUserContext value={user}>{content}</CurrentUserContext>
        </main>
      </div>
    </div>
  );
}
