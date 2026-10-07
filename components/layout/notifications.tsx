"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatDateTime, type Page } from "@/components/leads/api";
import { Busy, ErrorState, ghostButton, iconButton } from "@/components/leads/ui";
import { apiRequest, toApiError, useApi } from "@/lib/api";
import { BellIcon, ConvertIcon, SpinnerIcon } from "./icons";
import { canOpen } from "./navigation";
import type { ShellUser } from "./use-shell-session";

// GET /api/notifications/ (the signed-in user's own, newest first) and /api/notifications/unread-count/. The API sends
// each user only their own; staff get the activities assigned to them, admins the CRM's events.
export type Notification = {
  id: number;
  kind: "ACTIVITY_ASSIGNED" | "ACTIVITY_STATUS" | "LEAD_CREATED" | "LEAD_CONVERTED" | "WORK_COMPLETED" | "CRM_RESET";
  title: string;
  message: string;
  // The record it is about, as ids (null when it isn't about one).
  lead: number | null;
  work: number | null;
  activity: number | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

const PANEL_ID = "notifications-panel";
const POLL_MS = 60_000; // no live connection: the unread count is asked for every minute, and the list whenever the panel opens
const PAGE_SIZE = 20;

// Where a notification leads, on a page this user can open (the same module rules as the sidebar). A Work activity's
// goes to its Work, whose page lists its activities, or without the Work module to the Work Activities page showing
// that Work's. A lead follow-up's goes to the Lead Activities page showing that lead's follow-ups (which the person it
// is assigned to can open even when the lead isn't theirs), or to the lead without the Activities module. Both
// Activities pages need only the Activities module. None, when no page would show it.
export function notificationHref({ activity, lead, work }: Notification, user: ShellUser) {
  const opens = (module: string) => canOpen(user, { module });
  const toActivities = activity !== null && opens("activities");
  if (work !== null) {
    if (opens("work")) return `/works/${work}${activity !== null ? "#activities" : ""}`;
    return toActivities ? `/works/activities?search=%23${work}` : undefined;
  }
  if (lead === null) return undefined;
  if (toActivities) return `/leads/activities?search=%23${lead}`;
  return opens("leads") ? `/leads/${lead}${activity !== null ? "#activities" : ""}` : undefined;
}

type NotificationsBellProps = { user: ShellUser; buttonClass: string; panelClass: string };

// The navbar's bell: the unread count on it, and the panel with the newest notifications, Mark as read on each and
// Mark all as read.
export function NotificationsBell({ user, buttonClass, panelClass }: NotificationsBellProps) {
  const unread = useApi<{ count: number }>("/notifications/unread-count/");
  const [open, setOpen] = useState(false);
  const list = useApi<Page<Notification>>(open ? `/notifications/?page_size=${PAGE_SIZE}` : null);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const reloadUnread = unread.reload;

  // The count refreshes every minute, when the tab comes back into view, and whenever the panel opens.
  useEffect(() => {
    const timer = setInterval(reloadUnread, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadUnread]);

  const count = unread.data?.count ?? 0;
  const hide = () => document.getElementById(PANEL_ID)?.hidePopover();

  function refresh() {
    list.reload();
    unread.reload();
  }

  async function markRead(notification: Notification) {
    if (notification.is_read) return;
    try {
      await apiRequest(`/notifications/${notification.id}/read/`, { method: "POST" });
      refresh();
    } catch (error) {
      setActionError(toApiError(error).message);
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    setActionError(undefined);
    try {
      await apiRequest("/notifications/read-all/", { method: "POST" });
      refresh();
    } catch (error) {
      setActionError(toApiError(error).message);
    } finally {
      setMarkingAll(false);
    }
  }

  let body;
  if (list.error) {
    body = <ErrorState title="Couldn't load notifications" message={list.error.message} onRetry={list.reload} />;
  } else if (!list.data) {
    body = (
      <p role="status" className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
        <SpinnerIcon className="size-4" />
        Loading notifications…
      </p>
    );
  } else if (list.data.count === 0) {
    body = <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>;
  } else {
    body = (
      <ul aria-busy={list.loading} className={`max-h-[min(26rem,calc(100dvh-8rem))] overflow-y-auto py-1 transition-opacity ${list.loading ? "opacity-60" : ""}`}>
        {list.data.results.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            href={notificationHref(notification, user)}
            onRead={markRead}
            onNavigate={hide}
          />
        ))}
        {list.data.count > list.data.results.length && (
          <li className="px-4 py-2 text-center text-xs text-muted-foreground">
            Showing the newest {list.data.results.length} of {list.data.count.toLocaleString("en-IN")}.
          </li>
        )}
      </ul>
    );
  }

  return (
    <>
      <button
        type="button"
        popoverTarget={PANEL_ID}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className={`${buttonClass} relative`}
      >
        <BellIcon />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-none font-semibold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <div
        id={PANEL_ID}
        popover="auto"
        aria-label="Notifications"
        onToggle={(event) => {
          const opened = event.newState === "open";
          setOpen(opened);
          if (opened) reloadUnread(); // the badge and Mark all as read match what the list shows
        }}
        className={`${panelClass} w-85`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-4">
          <p className="text-sm font-medium">Notifications</p>
          {count > 0 && (
            <button type="button" onClick={markAllRead} aria-disabled={markingAll || undefined} className={`${ghostButton} aria-disabled:opacity-50`}>
              {markingAll ? <Busy>Marking…</Busy> : "Mark all as read"}
            </button>
          )}
        </div>
        {actionError && (
          <p role="alert" className="border-b border-border px-4 py-2 text-xs text-error">
            {actionError}
          </p>
        )}
        {body}
      </div>
    </>
  );
}

type NotificationItemProps = {
  notification: Notification;
  href?: string;
  onRead: (notification: Notification) => void;
  onNavigate: () => void;
};

// One notification: its title, message and time. Opening its record marks it read; an unread one also has Mark as read
// of its own. A read one without a record to open is plain text.
function NotificationItem({ notification, href, onRead, onNavigate }: NotificationItemProps) {
  const unread = !notification.is_read;
  const itemClass = `flex min-w-0 flex-1 items-start gap-3 px-4 py-2.5 text-left text-sm ${unread ? "" : "text-muted-foreground"}`;
  const content = (
    <>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`} />
      <span className="min-w-0 flex-1">
        <span className={`block ${unread ? "font-medium text-foreground" : ""}`}>
          {notification.title}
          {unread && <span className="sr-only"> (unread)</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs break-words text-muted-foreground">{notification.message}</span>
        <time dateTime={notification.created_at} className="mt-1 block text-xs text-faint">
          {formatDateTime(notification.created_at)}
        </time>
      </span>
    </>
  );

  return (
    <li className="flex items-start hover:bg-muted">
      {href ? (
        <Link
          href={href}
          onClick={() => {
            onRead(notification);
            onNavigate();
          }}
          className={itemClass}
        >
          {content}
        </Link>
      ) : unread ? (
        <button type="button" onClick={() => onRead(notification)} title="Mark as read" className={itemClass}>
          {content}
        </button>
      ) : (
        <div className={itemClass}>{content}</div>
      )}
      {href && unread && (
        <button
          type="button"
          onClick={() => onRead(notification)}
          aria-label={`Mark as read: ${notification.title}`}
          title="Mark as read"
          className={`${iconButton} mt-1.5 mr-2 size-8`}
        >
          <ConvertIcon className="size-4" />
        </button>
      )}
    </li>
  );
}
