"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useSyncExternalStore } from "react";

import { iconButton } from "@/components/leads/ui";
import { ChevronLeftIcon, CloseIcon, LogoutIcon } from "./icons";
import { activeHrefFor, navigationFor } from "./navigation";
import type { ShellUser } from "./use-shell-session";

// ---- Collapsed preference, remembered in localStorage ----

const STORAGE_KEY = "ragno:sidebar";
const listeners = new Set<() => void>();
let collapsedPreference: boolean | null = null;

function readCollapsed() {
  if (collapsedPreference === null) {
    try {
      collapsedPreference = localStorage.getItem(STORAGE_KEY) === "collapsed";
    } catch {
      collapsedPreference = false;
    }
  }
  return collapsedPreference;
}

function writeCollapsed(collapsed: boolean) {
  collapsedPreference = collapsed;
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage blocked by browser settings: the choice still holds until the page reloads.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Runs while the HTML is parsed, before first paint, so a collapsed sidebar never flashes open on reload.
// Every collapsed style keys off this data-sidebar attribute (the `sidebar-collapsed:` variant in globals.css).
const RESTORE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})==="collapsed")document.currentScript.parentElement.setAttribute("data-sidebar","collapsed")}catch(e){}`;

// ---- Shared panel: desktop sidebar and mobile drawer ----

// Labels fade out as the rail narrows; icons keep the same x-position in both states, so nothing jumps.
const fadeClass = "transition-opacity duration-200 motion-reduce:transition-none sidebar-collapsed:opacity-0";

const itemClass =
  "flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md pl-3.75 pr-3 text-sm pointer-coarse:h-11 text-secondary-foreground transition-colors hover:bg-muted hover:text-label aria-[current=page]:bg-primary-soft aria-[current=page]:font-medium aria-[current=page]:text-primary-strong";

// Flyouts and tooltips sit just past the sidebar's right edge, beside the element they belong to.
function besideRail(anchor: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const railRight = anchor.closest("aside")?.getBoundingClientRect().right ?? rect.right;
  return { rect, left: Math.max(rect.right, railRight) + 8 };
}

function positionFlyout(button: HTMLElement, flyoutId: string) {
  const flyout = document.getElementById(flyoutId);
  if (!flyout) return;
  const { rect, left } = besideRail(button);
  flyout.style.top = `${rect.top}px`;
  flyout.style.left = `${left}px`;
}

type SidebarPanelProps = {
  /** Only the entries this user can open are listed; none until the user has loaded. */
  user: ShellUser | null;
  onLogout: (() => void) | null;
  /** Desktop rail: adds the icon buttons and flyouts that keep grouped links reachable when collapsed. */
  collapsible?: boolean;
  /** Mobile drawer: shows a close button, and is also called after a link is followed. */
  onClose?: () => void;
};

export function SidebarPanel({ user, onLogout, collapsible = false, onClose }: SidebarPanelProps) {
  const activeHref = activeHrefFor(usePathname());
  const idPrefix = useId();

  return (
    <div className="flex h-full flex-col bg-background text-secondary-foreground">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-white"
        >
          R
        </span>
        <div className={`min-w-0 leading-tight ${fadeClass}`}>
          <p className="whitespace-nowrap text-sm font-semibold text-foreground">Ragno Power System</p>
          <p className="whitespace-nowrap text-xs text-muted-foreground">Solar Dealer CRM</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className={`${iconButton} ml-auto size-9`}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {(user ? navigationFor(user) : []).map((item, index) => {
            if ("href" in item) {
              const active = item.href === activeHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    data-tooltip={item.label}
                    className={itemClass}
                  >
                    <item.icon className={`size-4.5 shrink-0 ${active ? "text-brand" : "text-faint"}`} />
                    <span className={fadeClass}>{item.label}</span>
                  </Link>
                </li>
              );
            }

            const groupActive = item.children.some((child) => child.href === activeHref);
            const flyoutId = `${idPrefix}-flyout-${index}`;
            return (
              <li
                key={item.label}
                className="relative pt-3 pb-2 transition-[padding] duration-200 motion-reduce:transition-none sidebar-collapsed:py-0"
              >
                <div
                  className={`flex h-9 items-center gap-3 overflow-hidden whitespace-nowrap rounded-md pl-3.75 pr-3 text-sm font-medium ${
                    groupActive ? "text-foreground sidebar-collapsed:bg-primary-soft" : "text-label"
                  }`}
                >
                  <item.icon className={`size-4.5 shrink-0 text-faint ${groupActive ? "sidebar-collapsed:text-brand" : ""}`} />
                  <span aria-hidden="true" className={fadeClass}>
                    {item.label}
                  </span>
                </div>

                {collapsible && (
                  <>
                    {/* Collapsed rail only: the group icon opens a flyout with the group's links. */}
                    <button
                      type="button"
                      popoverTarget={flyoutId}
                      onClick={(event) => positionFlyout(event.currentTarget, flyoutId)}
                      aria-label={item.label}
                      data-tooltip={item.label}
                      className="absolute inset-x-0 top-0 hidden h-9 rounded-md hover:bg-muted sidebar-collapsed:block"
                    />
                    <div
                      id={flyoutId}
                      popover="auto"
                      className="fixed right-auto bottom-auto m-0 w-52 rounded-lg border border-border bg-background p-1.5 text-sm text-secondary-foreground shadow-lg"
                    >
                      <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{item.label}</p>
                      <ul>
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={() => document.getElementById(flyoutId)?.hidePopover()}
                              aria-current={child.href === activeHref ? "page" : undefined}
                              className="flex h-8 items-center rounded-md px-2.5 transition-colors hover:bg-muted hover:text-label aria-[current=page]:bg-primary-soft aria-[current=page]:font-medium aria-[current=page]:text-primary-strong"
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {/* Collapses smoothly with the rail; `invisible` also takes the links out of the tab order. */}
                <div className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none sidebar-collapsed:invisible sidebar-collapsed:grid-rows-[0fr] sidebar-collapsed:opacity-0">
                  <ul aria-label={item.label} className="ml-6 min-h-0 overflow-hidden">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          onClick={onClose}
                          aria-current={child.href === activeHref ? "page" : undefined}
                          className="flex h-8 items-center whitespace-nowrap rounded-r-md border-l-2 pointer-coarse:h-11 border-border pl-4.75 text-sm text-secondary-foreground transition-colors hover:bg-muted hover:text-label aria-[current=page]:border-brand aria-[current=page]:bg-primary-soft aria-[current=page]:font-medium aria-[current=page]:text-primary-strong"
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={onLogout ?? undefined}
          disabled={!onLogout}
          data-tooltip="Log out"
          className="flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md border border-input pl-3.5 pointer-coarse:h-11 text-sm text-label transition-colors enabled:hover:border-border-strong enabled:hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogoutIcon className="size-4.5 shrink-0" />
          <span className={fadeClass}>Log out</span>
        </button>
      </div>
    </div>
  );
}

// ---- Desktop sidebar: collapsible, hidden below the lg breakpoint (the drawer takes over there) ----

export function Sidebar({ user, onLogout }: { user: ShellUser | null; onLogout: (() => void) | null }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // One shared tooltip. It is position: fixed, so the rail's overflow clipping can't cut it off.
  function updateTooltip(target: EventTarget | null) {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;
    const anchor = target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
    const flyoutId = anchor?.getAttribute("popovertarget");
    if (
      !anchor ||
      (!anchor.hasAttribute("data-tooltip-always") && !anchor.closest('[data-sidebar="collapsed"]')) ||
      (flyoutId && document.getElementById(flyoutId)?.matches(":popover-open"))
    ) {
      tooltip.hidden = true;
      return;
    }
    const { rect, left } = besideRail(anchor);
    tooltip.textContent = anchor.dataset.tooltip ?? "";
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.left = `${left}px`;
    tooltip.hidden = false;
  }

  const hideTooltip = () => updateTooltip(null);
  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      suppressHydrationWarning
      onPointerOver={(event) => updateTooltip(event.target)}
      onPointerLeave={hideTooltip}
      onFocus={(event) => updateTooltip(event.target)}
      onBlur={hideTooltip}
      onClick={hideTooltip}
      className="hidden w-64 shrink-0 transition-[width] duration-200 ease-out motion-reduce:transition-none sidebar-collapsed:w-18 lg:block"
    >
      {/* Executes only in the server-rendered HTML; on client renders it is inert text/plain. */}
      <script
        type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: RESTORE_SCRIPT }}
      />
      <div className="sticky top-0 z-20 h-dvh">
        {/* Sits on the sidebar's right edge; first in the DOM so keyboard users reach it before the links. */}
        <button
          type="button"
          onClick={() => writeCollapsed(!collapsed)}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          data-tooltip={toggleLabel}
          data-tooltip-always=""
          className="absolute top-4 -right-3 grid size-6 place-items-center rounded-full border border-input bg-background text-faint shadow-sm transition-colors hover:bg-muted hover:text-label"
        >
          <ChevronLeftIcon className="size-3.5 transition-transform duration-200 motion-reduce:transition-none sidebar-collapsed:rotate-180" />
        </button>
        <div className="h-full overflow-hidden border-r border-border">
          <SidebarPanel user={user} onLogout={onLogout} collapsible />
        </div>
        <div
          ref={tooltipRef}
          hidden
          aria-hidden="true"
          className="pointer-events-none fixed z-30 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-white shadow-lg"
        />
      </div>
    </aside>
  );
}
