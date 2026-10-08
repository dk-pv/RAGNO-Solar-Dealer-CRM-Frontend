"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { ErrorState, PageLoading } from "@/components/leads/ui";
import { Navbar } from "./navbar";
import { blockedEntryFor, startPageFor } from "./navigation";
import { Sidebar, SidebarPanel } from "./sidebar";
import { CurrentUserContext, useShellSession } from "./use-shell-session";

export function AppShell({ children }: { children: ReactNode }) {
  // One session read for the whole shell, so the sidebar and the account menu share the same logout.
  const { signedIn, user, userError, reloadUser, logout: endSession } = useShellSession();
  const router = useRouter();
  const pathname = usePathname();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const drawerId = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loggedOut = useRef(false);
  const closeDrawer = () => drawerRef.current?.close();
  const openDrawer = () => {
    drawerRef.current?.showModal();
    setDrawerOpen(true);
  };
  const logout =
    endSession &&
    (() => {
      loggedOut.current = true;
      endSession();
    });

  // Signed out (never signed in, or the session expired): go to the sign-in page and come back after. Logging out
  // starts afresh, so the next sign-in lands on the default page. This only guides people; the API checks the token
  // on every request.
  useEffect(() => {
    if (signedIn === false) {
      router.replace(loggedOut.current ? "/login" : `/login?next=${encodeURIComponent(pathname + window.location.search)}`);
    }
  }, [signedIn, pathname, router]);

  // The drawer is the navigation of narrow windows only: widened to the point where the sidebar can open (lg), it
  // closes and the sidebar takes over.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 64rem)");
    const onChange = () => {
      if (wide.matches) drawerRef.current?.close();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  // A page renders once the user is known, and only if they can open its module, so a staff member without access
  // never loads it. This is only for people: the API refuses the same requests on its own.
  let content: ReactNode;
  if (user) {
    const blocked = blockedEntryFor(user, pathname);
    // The way on is the page "/" opens for them: Lead Activities for Activities-only staff. Without one, "/" says so.
    const start = startPageFor(user);
    content = blocked ? (
      <ErrorState
        title="You don't have access to this page"
        message={`Your role doesn't include ${blocked.label}.`}
        onRetry={() => router.replace(start ?? "/")}
        retryLabel={start === "/leads/activities" ? "Go to Activities" : "Go to start page"}
      />
    ) : (
      children
    );
  } else if (userError) {
    content = <ErrorState title="Couldn't load your account" message={userError.message} onRetry={reloadUser} />;
  } else {
    // The stored session is being read, or the account is loading: a loader rather than an empty page.
    content = <PageLoading label="Loading your account…" />;
  }

  return (
    <div className="flex flex-1">
      <Sidebar user={user} onLogout={logout} />

      {/* The full navigation on phones and tablets, below the lg breakpoint (a tablet also has the icon rail). A native
          modal dialog closes on Escape and keeps focus inside the drawer; closing it returns focus to the menu
          button. It slides in from the left over a dimmed page (no motion when the system asks for less);
          allow-discrete keeps it on screen while it slides out. */}
      <dialog
        ref={drawerRef}
        id={drawerId}
        aria-label="Navigation"
        onClick={(event) => {
          // The panel fills the dialog, so a click on the dialog element itself is a click on the backdrop.
          if (event.target === event.currentTarget) closeDrawer();
        }}
        onClose={(event) => {
          setDrawerOpen(false);
          // The browser returns focus to the menu button only if the button had it (a tap in Safari doesn't give it);
          // otherwise focus would stay in the closing drawer, then drop to the page.
          const focused = document.activeElement;
          if (!focused || focused === document.body || event.currentTarget.contains(focused)) {
            document.querySelector<HTMLElement>(`[aria-controls="${drawerId}"]`)?.focus();
          }
        }}
        className="m-0 h-dvh max-h-none w-70 max-w-[85vw] -translate-x-full border-r border-border bg-background p-0 transition-[translate,overlay,display] transition-discrete duration-200 ease-out open:translate-x-0 starting:open:-translate-x-full motion-reduce:transition-none backdrop:bg-foreground/30 backdrop:opacity-0 backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-200 open:backdrop:opacity-100 starting:open:backdrop:opacity-0 motion-reduce:backdrop:transition-none"
      >
        <SidebarPanel user={user} onLogout={logout} onClose={closeDrawer} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          user={user}
          onLogout={logout}
          navigationId={drawerId}
          navigationOpen={drawerOpen}
          onOpenNavigation={openDrawer}
        />
        {/* Pages never widen the window: wide content (boards, tables) scrolls inside its own box. `relative` makes main
            the frame for absolutely positioned content such as screen-reader labels, and overflow-x-clip trims
            anything still wider, without creating a scroll box. Pop-ups and dialogs sit above the page and aren't affected.
            main is a flex column so that pages listing records can fill it and keep their pagination at the bottom, and
            the pipeline boards can fill the window's height (see fillClass in components/leads/ui.tsx); other pages are
            as tall as their content. */}
        <main className="relative flex flex-1 flex-col overflow-x-clip p-4 lg:p-6">
          <CurrentUserContext value={user}>{content}</CurrentUserContext>
        </main>
      </div>
    </div>
  );
}
