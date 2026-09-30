"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef, useSyncExternalStore } from "react";

import { ChevronLeftIcon, CloseIcon, LogoutIcon } from "./icons";
import { NAVIGATION, activeHrefFor } from "./navigation";

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
  "flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md pl-3.75 pr-3 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:font-medium aria-[current=page]:text-white";

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
  onLogout: (() => void) | null;
  /** Desktop rail: adds the icon buttons and flyouts that keep grouped links reachable when collapsed. */
  collapsible?: boolean;
  /** Mobile drawer: shows a close button, and is also called after a link is followed. */
  onClose?: () => void;
};

export function SidebarPanel({ onLogout, collapsible = false, onClose }: SidebarPanelProps) {
  const activeHref = activeHrefFor(usePathname());
  const idPrefix = useId();

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-400">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-sm font-bold text-zinc-950"
        >
          R
        </span>
        <div className={`min-w-0 leading-tight ${fadeClass}`}>
          <p className="whitespace-nowrap text-sm font-semibold text-white">Ragno Power System</p>
          <p className="whitespace-nowrap text-xs text-zinc-400">Solar Dealer CRM</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-md hover:bg-white/5 hover:text-white"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {NAVIGATION.map((item, index) => {
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
                    <item.icon className={`size-4.5 shrink-0 ${active ? "text-brand" : ""}`} />
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
                    groupActive ? "text-white sidebar-collapsed:bg-white/10" : "text-zinc-300"
                  }`}
                >
                  <item.icon className={`size-4.5 shrink-0 ${groupActive ? "sidebar-collapsed:text-brand" : ""}`} />
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
                      className="absolute inset-x-0 top-0 hidden h-9 rounded-md hover:bg-white/5 sidebar-collapsed:block"
                    />
                    <div
                      id={flyoutId}
                      popover="auto"
                      className="fixed right-auto bottom-auto m-0 w-52 rounded-lg border border-white/10 bg-zinc-900 p-1.5 text-sm text-zinc-300 shadow-xl"
                    >
                      <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-zinc-400">{item.label}</p>
                      <ul>
                        {item.children.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={() => document.getElementById(flyoutId)?.hidePopover()}
                              aria-current={child.href === activeHref ? "page" : undefined}
                              className="flex h-8 items-center rounded-md px-2.5 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:font-medium aria-[current=page]:text-white"
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
                          className="flex h-8 items-center whitespace-nowrap rounded-r-md border-l-2 border-white/10 pl-4.75 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-white aria-[current=page]:border-brand aria-[current=page]:bg-white/5 aria-[current=page]:font-medium aria-[current=page]:text-white"
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

      <div className="shrink-0 border-t border-white/8 p-3">
        <button
          type="button"
          onClick={onLogout ?? undefined}
          disabled={!onLogout}
          data-tooltip="Log out"
          className="flex h-9 w-full items-center gap-3 overflow-hidden whitespace-nowrap rounded-md border border-white/10 pl-3.5 text-sm text-zinc-400 transition-colors enabled:hover:bg-white/5 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogoutIcon className="size-4.5 shrink-0" />
          <span className={fadeClass}>Log out</span>
        </button>
      </div>
    </div>
  );
}

// ---- Desktop sidebar: collapsible, hidden below the lg breakpoint (the drawer takes over there) ----

export function Sidebar({ onLogout }: { onLogout: (() => void) | null }) {
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
          className="absolute top-4 -right-3 grid size-6 place-items-center rounded-full border border-white/15 bg-zinc-900 text-zinc-400 shadow-sm transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ChevronLeftIcon className="size-3.5 transition-transform duration-200 motion-reduce:transition-none sidebar-collapsed:rotate-180" />
        </button>
        <div className="h-full overflow-hidden border-r border-white/8">
          <SidebarPanel onLogout={onLogout} collapsible />
        </div>
        <div
          ref={tooltipRef}
          hidden
          aria-hidden="true"
          className="pointer-events-none fixed z-30 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-zinc-800 px-2 py-1 text-xs font-medium text-white shadow-lg"
        />
      </div>
    </aside>
  );
}
