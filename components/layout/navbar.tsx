"use client";

import type { ReactNode } from "react";

import { BellIcon, LogoutIcon, MenuIcon, UserIcon, WhatsAppIcon } from "./icons";
import type { ShellUser } from "./use-shell-session";

// wa.me needs the full international number without "+". A 10-digit local number is an Indian
// mobile, so it gets the 91 country code: 7994890820 -> 917994890820.
function toWhatsAppNumber(value: string | undefined) {
  const digits = (value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

// Next.js inlines NEXT_PUBLIC_ values at build time.
const WHATSAPP_NUMBER = toWhatsAppNumber(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

const ROLE_LABELS: Record<ShellUser["role"], string> = { ADMIN: "Admin", STAFF: "Staff" };

const iconButtonClass =
  "grid size-9 place-items-center rounded-md text-faint hover:bg-muted hover:text-label";

// Popovers sit in the browser's top layer, pinned under the navbar's right edge.
const panelClass =
  "fixed top-15 right-3 bottom-auto left-auto w-72 max-w-[calc(100vw-1.5rem)] rounded-md border border-border bg-background text-foreground shadow-md";

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
  onOpenNavigation: () => void;
};

export function Navbar({ user, onLogout, onOpenNavigation }: NavbarProps) {
  const userInitials = user ? initials(user.name) : "";

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 lg:px-6">
      <button type="button" onClick={onOpenNavigation} aria-label="Open navigation" className={`${iconButtonClass} lg:hidden`}>
        <MenuIcon />
      </button>
      <span className="truncate text-sm font-semibold lg:hidden">Ragno Power System</span>

      <div className="ml-auto flex items-center gap-1">
        {WHATSAPP_NUMBER && (
          <Tooltip label="WhatsApp">
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp (opens in a new tab)"
              className={iconButtonClass}
            >
              <WhatsAppIcon />
            </a>
          </Tooltip>
        )}

        <Tooltip label="Notifications">
          <button type="button" popoverTarget="notifications-panel" aria-label="Notifications" className={iconButtonClass}>
            <BellIcon />
          </button>
        </Tooltip>
        <div id="notifications-panel" popover="auto" className={panelClass}>
          <p className="border-b border-border px-4 py-3 text-sm font-medium">Notifications</p>
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Notifications aren&apos;t available yet.</p>
        </div>

        <Tooltip label="Account">
          <button
            type="button"
            popoverTarget="account-menu"
            aria-label="Account"
            className="grid size-9 place-items-center rounded-full hover:bg-muted"
          >
            <span className="grid size-8 place-items-center rounded-full bg-muted text-xs font-semibold text-foreground">
              {userInitials || <UserIcon className="size-4" />}
            </span>
          </button>
        </Tooltip>
        <div id="account-menu" popover="auto" className={panelClass}>
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
              className="flex h-9 w-full items-center gap-2.5 rounded px-3 text-sm enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogoutIcon className="size-4" />
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
