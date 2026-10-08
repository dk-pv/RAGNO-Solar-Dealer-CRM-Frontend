"use client";

import { useState, type ReactNode } from "react";

import { iconButton } from "@/components/leads/ui";
import { LogoutIcon, MenuIcon, UserIcon, WhatsAppIcon } from "./icons";
import { canOpen } from "./navigation";
import { NotificationsBell } from "./notifications";
import type { ShellUser } from "./use-shell-session";
import { WhatsAppDialog } from "./whatsapp";

const ROLE_LABELS: Record<ShellUser["role"], string> = { ADMIN: "Admin", STAFF: "Staff" };

const iconButtonClass = `${iconButton} size-9`;

// Popovers sit in the browser's top layer, pinned under the navbar's right edge. Each adds its width.
const panelClass =
  "fixed top-15 right-3 bottom-auto left-auto max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-background text-foreground shadow-lg";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

type NavbarProps = {
  user: ShellUser | null;
  onLogout: (() => void) | null;
  /** The navigation drawer (phones and tablets) that the menu button opens, and whether it is open. */
  navigationId: string;
  navigationOpen: boolean;
  onOpenNavigation: () => void;
};

export function Navbar({ user, onLogout, navigationId, navigationOpen, onOpenNavigation }: NavbarProps) {
  const userInitials = user ? initials(user.name) : "";
  const [composing, setComposing] = useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 lg:px-6">
      <button
        type="button"
        onClick={onOpenNavigation}
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={navigationOpen}
        aria-controls={navigationId}
        className={`${iconButtonClass} lg:hidden`}
      >
        <MenuIcon />
      </button>
      {/* The brand, while the sidebar that shows it is hidden. A phone narrower than 400px shows the mark and "Ragno"
          (screen readers still hear the whole name), so it fits beside the actions instead of being cut off. */}
      <span className="flex min-w-0 items-center gap-2 md:hidden">
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-brand text-xs font-bold text-white">
          R
        </span>
        <span className="truncate text-sm font-semibold">
          Ragno<span className="max-[25rem]:sr-only"> Power System</span>
        </span>
      </span>

      <div className="ml-auto flex items-center gap-1">
        {/* A WhatsApp message to a lead, on the lead's own number: for whoever has the Leads module (the form lists
            only the leads the API lets them see). */}
        {user && canOpen(user, { module: "leads" }) && (
          <Tooltip label="WhatsApp a lead">
            <button
              type="button"
              onClick={() => setComposing(true)}
              aria-label="Send a WhatsApp message to a lead"
              aria-haspopup="dialog"
              className={iconButtonClass}
            >
              <WhatsAppIcon />
            </button>
          </Tooltip>
        )}

        {/* Once signed in: the API sends each user only their own notifications. */}
        {user && (
          <Tooltip label="Notifications">
            <NotificationsBell user={user} buttonClass={iconButtonClass} panelClass={panelClass} />
          </Tooltip>
        )}

        <Tooltip label="Account">
          <button
            type="button"
            popoverTarget="account-menu"
            aria-label="Account"
            className="grid size-9 place-items-center rounded-full transition-colors hover:bg-muted pointer-coarse:size-11"
          >
            <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {userInitials || <UserIcon className="size-4" />}
            </span>
          </button>
        </Tooltip>
        <div id="account-menu" popover="auto" className={`${panelClass} w-72`}>
          <div className="px-4 py-3">
            {user ? (
              <>
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not signed in.</p>
            )}
          </div>
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={onLogout ?? undefined}
              disabled={!onLogout}
              className="flex h-9 w-full items-center gap-2.5 rounded px-3 text-sm enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:h-11"
            >
              <LogoutIcon className="size-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
      {composing && <WhatsAppDialog onClose={() => setComposing(false)} />}
    </header>
  );
}
