"use client";

import { useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { CloseIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import { Section, dialogClass } from "@/components/leads/lead-dialogs";
import { ErrorState, iconButton, primaryButton, secondaryButton, useNotice } from "@/components/leads/ui";
import { apiRequest, toApiError, useApi } from "@/lib/api";
import { moduleLabels, type Module, type Role } from "./users-page";

export function RolesPage() {
  const isAdmin = useContext(CurrentUserContext)?.role === "ADMIN";
  const roles = useApi<Role[]>(isAdmin ? "/roles/" : null);
  const modules = useApi<Module[]>(isAdmin ? "/users/modules/" : null);
  const [editing, setEditing] = useState<Role>();
  const [noticeElement, notify] = useNotice();

  // The API refuses roles to anyone else; this only avoids a request that can't succeed.
  if (!isAdmin) {
    return <ErrorState title="Only admins can manage roles" message="Ask an admin if a role's access needs to change." />;
  }

  return (
    <div>
      <h2 className="text-base font-semibold">Roles &amp; Access</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Everyone gets the access of their role. Changing a role&apos;s access changes it for all its users.
      </p>

      {roles.error ? (
        <div className="mt-4 rounded-lg border border-border">
          <ErrorState title="Couldn't load roles" message={roles.error.message} onRetry={roles.reload} />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table aria-busy={roles.loading} className="w-full min-w-160 text-sm">
            <caption className="sr-only">Roles</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="px-3 py-2.5">Role</th>
                <th scope="col" className="px-3 py-2.5">Description</th>
                <th scope="col" className="px-3 py-2.5">Access</th>
                <th scope="col" className="px-3 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.data
                ? roles.data.map((role) => (
                    <tr key={role.name} className="border-b border-border last:border-0">
                      <th scope="row" className="px-3 py-2.5 text-left font-medium whitespace-nowrap">
                        {role.label}
                      </th>
                      <td className="px-3 py-2.5 text-muted-foreground">{role.description}</td>
                      <td className="px-3 py-2.5">
                        {role.modules.length > 0 ? (
                          moduleLabels(role.modules, modules.data)
                        ) : (
                          <span className="text-muted-foreground">No access</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right whitespace-nowrap text-label">
                        {/* Admins always keep every module, so no one can be locked out of Settings. */}
                        {role.name === "ADMIN" ? (
                          <span className="px-2 text-xs text-muted-foreground">Always full access</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing(role)}
                            disabled={!modules.data}
                            aria-label={`Edit ${role.label} access`}
                            className="rounded-md px-2 py-1 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Edit access
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                : Array.from({ length: 2 }, (_, row) => (
                    <tr key={row} className="border-b border-border last:border-0">
                      {Array.from({ length: 4 }, (_, cell) => (
                        <td key={cell} className="px-3 py-3.5">
                          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && modules.data && (
        <RoleAccessDialog
          role={editing}
          modules={modules.data}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            notify({ text: `Saved ${editing.label} access. It applies to every ${editing.label.toLowerCase()} user.` });
            roles.reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type RoleAccessDialogProps = { role: Role; modules: Module[]; onClose: () => void; onSaved: () => void };

function RoleAccessDialog({ role, modules, onClose, onSaved }: RoleAccessDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selected, setSelected] = useState(role.modules);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    dialogRef.current?.querySelector<HTMLInputElement>("form input")?.focus();
  }, []);

  const close = () => dialogRef.current?.close();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    try {
      await apiRequest(`/roles/${role.name}/`, { method: "PATCH", json: { modules: selected } });
      onSaved();
      close();
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError.fields.modules ?? apiError.message);
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} onClose={onClose} aria-labelledby={titleId} className={`${dialogClass} max-w-lg p-0`}>
      <form noValidate onSubmit={submit}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold">
              Edit {role.label} access
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Everyone with the {role.label} role gets exactly this access.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {error && (
            <p
              role="alert"
              className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error"
            >
              {error}
            </p>
          )}
          <Section title="Module access">
            {modules.map((module) => (
              <label key={module.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="modules"
                  value={module.key}
                  checked={selected.includes(module.key)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, module.key] : current.filter((key) => key !== module.key),
                    )
                  }
                  className="size-4 accent-primary"
                />
                {module.label}
              </label>
            ))}
          </Section>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
