"use client";

import Link from "next/link";
import { useId, useState } from "react";

import {
  CalendarIcon,
  ConvertIcon,
  EyeIcon,
  FlagIcon,
  MoreIcon,
  PencilIcon,
  PhoneIcon,
  TrashIcon,
  WhatsAppIcon,
} from "@/components/layout/icons";
import { ActionDialog } from "@/components/selection";
import { convertBlocker, deleteLead, statusBlocker, statusLabel, telHref, whatsappHref, type Lead } from "./api";
import { ConvertDialog, LeadFormDialog, StatusDialog } from "./lead-dialogs";
import { iconButton } from "./ui";

type Notify = (notice: { text: string; error?: boolean }) => void;
export type LeadActions = ReturnType<typeof useLeadActions>;

// Add, edit, update status, convert and delete, with their dialogs: what the list's and the pipeline's lead menus do.
// Render `dialogs` once on the page; `onChanged` reloads the page's leads after any change, with the lead changed (or
// deleted).
export function useLeadActions(notify: Notify, onChanged: (lead?: Lead) => void) {
  const [formLead, setFormLead] = useState<Lead | null>(); // null: a new lead; undefined: the form is closed
  const [statusTarget, setStatusTarget] = useState<Lead>();
  const [convertTarget, setConvertTarget] = useState<Lead>();
  const [deleteTarget, setDeleteTarget] = useState<Lead>();

  const dialogs = (
    <>
      {deleteTarget && (
        <ActionDialog
          destructive
          title={`Delete ${deleteTarget.name}?`}
          description="The lead and its activities are removed for good."
          confirmLabel="Delete lead"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            await deleteLead(deleteTarget.id);
            notify({ text: `Deleted ${deleteTarget.name}.` });
            onChanged(deleteTarget);
          }}
          onClose={() => setDeleteTarget(undefined)}
          onError={(text) => notify({ text, error: true })}
        />
      )}
      {formLead !== undefined && (
        <LeadFormDialog
          lead={formLead}
          onClose={() => setFormLead(undefined)}
          onError={(text) => notify({ text, error: true })}
          onSaved={(saved) => {
            notify({ text: formLead ? `Saved changes to ${saved.name}.` : `Added ${saved.name} as a new lead.` });
            onChanged(saved);
          }}
        />
      )}
      {statusTarget && (
        <StatusDialog
          lead={statusTarget}
          onClose={() => setStatusTarget(undefined)}
          onChanged={(updated) => {
            notify({ text: `${updated.name} is now ${statusLabel(updated.status)}.` });
            onChanged(updated);
          }}
        />
      )}
      {convertTarget && (
        <ConvertDialog
          lead={convertTarget}
          onClose={() => setConvertTarget(undefined)}
          onConverted={(converted) => {
            notify({ text: `Converted ${converted.name}${converted.work ? ` to Work #${converted.work}` : ""}.` });
            onChanged(converted);
          }}
        />
      )}
    </>
  );

  return {
    dialogs,
    add: () => setFormLead(null),
    edit: (lead: Lead) => setFormLead(lead),
    updateStatus: (lead: Lead) => setStatusTarget(lead),
    convert: (lead: Lead) => setConvertTarget(lead),
    remove: (lead: Lead) => setDeleteTarget(lead),
  };
}

// The menu opens in the browser's top layer, outside any scrolling table or board, next to its button: below it, or
// above it when it doesn't fit below and there is more room above, always inside the window (it scrolls if the window
// is shorter than the menu). Called from the button's click, before the menu opens, so it is placed from its real size
// in the next frame, before it is painted: touch rows are taller, and every size grows on very wide screens.
export function placeMenu(button: HTMLElement, menuId: string) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  requestAnimationFrame(() => {
    if (!menu.matches(":popover-open")) return;
    const rect = button.getBoundingClientRect();
    const room = window.innerHeight - 16;
    menu.style.maxHeight = `${room}px`;
    menu.style.overflowY = "auto";
    const { offsetWidth: width, offsetHeight: height } = menu;
    const below = window.innerHeight - rect.bottom;
    const top = height + 12 > below && rect.top > below ? rect.top - 4 - height : rect.bottom + 4;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, room + 8 - height))}px`;
  });
}

export const menuItemClass =
  "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent pointer-coarse:py-3";

const READ_ONLY = "You can view this lead but not change it";

type LeadMenuProps = { lead: Lead; actions: LeadActions; withView?: boolean };

// The lead's three-dot menu. Each action follows what the API says this user may do with the lead (can_edit,
// allowed_transitions, can_convert, can_delete); the API checks again.
export function LeadMenu({ lead, actions, withView = false }: LeadMenuProps) {
  const menuId = useId();
  const hide = () => document.getElementById(menuId)?.hidePopover();
  const whatsapp = whatsappHref(lead);
  const tel = telHref(lead);

  return (
    <>
      <button
        type="button"
        popoverTarget={menuId}
        onClick={(event) => placeMenu(event.currentTarget, menuId)}
        aria-label={`Actions for ${lead.name}`}
        className={`${iconButton} size-8`}
      >
        <MoreIcon className="size-4" />
      </button>
      <div
        id={menuId}
        popover="auto"
        className="fixed inset-auto m-0 w-56 rounded-md border border-border bg-background p-1 text-foreground shadow-lg"
      >
        {withView && (
          <Link href={`/leads/${lead.id}`} className={menuItemClass}>
            <EyeIcon className="size-4 text-muted-foreground" />
            View
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            hide();
            actions.edit(lead);
          }}
          disabled={!lead.can_edit}
          title={lead.can_edit ? undefined : READ_ONLY}
          className={menuItemClass}
        >
          <PencilIcon className="size-4 text-muted-foreground" />
          Edit
        </button>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={hide} className={menuItemClass}>
          <WhatsAppIcon className="size-4 text-muted-foreground" />
          WhatsApp
        </a>
        <a href={tel} onClick={hide} className={menuItemClass}>
          <PhoneIcon className="size-4 text-muted-foreground" />
          Call
        </a>
        <Link href={`/leads/${lead.id}#activities`} className={menuItemClass}>
          <CalendarIcon className="size-4 text-muted-foreground" />
          Follow-up / Activity
        </Link>
        <div className="my-1 border-t border-border" />
        <button
          type="button"
          onClick={() => {
            hide();
            actions.updateStatus(lead);
          }}
          disabled={!!statusBlocker(lead)}
          title={statusBlocker(lead)}
          className={menuItemClass}
        >
          <FlagIcon className="size-4 text-muted-foreground" />
          Update Status
        </button>
        {lead.work ? (
          <p className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted-foreground">
            <ConvertIcon className="size-4" />
            Converted to Work #{lead.work}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              hide();
              actions.convert(lead);
            }}
            disabled={!lead.can_convert}
            title={convertBlocker(lead)}
            className={menuItemClass}
          >
            <ConvertIcon className="size-4 text-muted-foreground" />
            Convert to Work
          </button>
        )}
        {lead.can_delete && (
          <button
            type="button"
            onClick={() => {
              hide();
              actions.remove(lead);
            }}
            className={`${menuItemClass} text-error`}
          >
            <TrashIcon className="size-4" />
            Delete lead
          </button>
        )}
      </div>
    </>
  );
}
