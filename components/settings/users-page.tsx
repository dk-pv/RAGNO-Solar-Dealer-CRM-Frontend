"use client";

import Link from "next/link";
import { useContext, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { CloseIcon, PlusIcon } from "@/components/layout/icons";
import { CurrentUserContext } from "@/components/layout/use-shell-session";
import type { Page } from "@/components/leads/api";
import { Field, Section, dialogClass } from "@/components/leads/lead-dialogs";
import {
  ErrorState,
  destructiveButton,
  iconButton,
  inputClass,
  primaryButton,
  secondaryButton,
  useNotice,
} from "@/components/leads/ui";
import { PasswordInput } from "@/components/password-input";
import { apiRequest, toApiError, useApi, type ApiError } from "@/lib/api";

// GET /api/users/. Passwords are write-only: the API never sends them.
type User = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  department: number | null;
  department_name: string | null;
  is_active: boolean;
  modules: string[]; // from the user's role
};
// GET /api/users/modules/: every module, in display order.
export type Module = { key: string; label: string };
// GET /api/roles/ (admins only). Access belongs to the role; users inherit it.
export type Role = { name: "ADMIN" | "STAFF"; label: string; description: string; modules: string[] };

// Add and Edit set details, role and password; Status activates or deactivates; Delete removes staff with no records.
type Mode = "add" | "edit" | "status" | "delete";

export const moduleLabels = (keys: string[], modules?: Module[]) =>
  keys.map((key) => modules?.find((module) => module.key === key)?.label ?? key).join(" · ");

const ROLE_LABELS: Record<User["role"], string> = { ADMIN: "Admin", STAFF: "Staff" };

const badgeClass = "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
const activeBadge = "bg-success-soft text-success ring-success-border";
const inactiveBadge = "bg-neutral-soft text-neutral ring-neutral-border";
const rowButton = "rounded-md px-2 py-1 text-sm font-medium hover:bg-muted";

export function UsersPage() {
  const me = useContext(CurrentUserContext);
  const isAdmin = me?.role === "ADMIN";
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Page<User>>(page > 1 ? `/users/?page=${page}` : "/users/");
  const modules = useApi<Module[]>("/users/modules/");
  const roles = useApi<Role[]>(isAdmin ? "/roles/" : null);
  const [dialog, setDialog] = useState<{ mode: Mode; user?: User }>();
  const [noticeElement, notify] = useNotice();
  const columnCount = isAdmin ? 7 : 6;

  let content;
  if (error) {
    content = (
      <div className="mt-4 rounded-lg border border-border">
        {error.status === 404 && page > 1 ? (
          <ErrorState
            title="This page no longer exists"
            message="There are fewer users than before."
            onRetry={() => setPage(1)}
            retryLabel="Go to the first page"
          />
        ) : (
          <ErrorState title="Couldn't load users" message={error.message} onRetry={reload} />
        )}
      </div>
    );
  } else {
    const rows = data?.results;
    content = (
      <>
        <div className="scrollbar-none relative mt-4 overflow-x-auto rounded-lg border border-border">
          <table aria-busy={loading} className={`w-full min-w-200 text-sm transition-opacity ${loading && rows ? "opacity-60" : ""}`}>
            <caption className="sr-only">Users</caption>
            <thead>
              <tr className="border-b border-border bg-page text-left text-xs font-medium whitespace-nowrap text-secondary-foreground">
                <th scope="col" className="px-3 py-2.5">Name</th>
                <th scope="col" className="px-3 py-2.5">Email</th>
                <th scope="col" className="px-3 py-2.5">Role</th>
                <th scope="col" className="px-3 py-2.5">Department</th>
                <th scope="col" className="px-3 py-2.5">Status</th>
                <th scope="col" className="px-3 py-2.5">Access</th>
                {isAdmin && (
                  <th scope="col" className="px-3 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows
                ? rows.map((user) => (
                    <tr key={user.id} className="border-b border-border last:border-0 hover:bg-row-hover">
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        <span className="block max-w-52 truncate">{user.name}</span>
                      </th>
                      <td className="px-3 py-2">
                        <span className="block max-w-64 truncate">{user.email}</span>
                      </td>
                      <td className="px-3 py-2">{ROLE_LABELS[user.role]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {user.department_name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`${badgeClass} ${user.is_active ? activeBadge : inactiveBadge}`}>
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {user.modules.length > 0 ? (
                          moduleLabels(user.modules, modules.data)
                        ) : (
                          <span className="text-muted-foreground">No access</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-1.5 text-right whitespace-nowrap text-label">
                          {/* Your own account isn't changed here, so you can't lock yourself out. */}
                          {user.email !== me?.email && (
                            <>
                              <button
                                type="button"
                                onClick={() => setDialog({ mode: "edit", user })}
                                aria-label={`Edit ${user.name}`}
                                className={rowButton}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setDialog({ mode: "status", user })}
                                aria-label={`${user.is_active ? "Deactivate" : "Activate"} ${user.name}`}
                                className={rowButton}
                              >
                                {user.is_active ? "Deactivate" : "Activate"}
                              </button>
                              {user.role === "STAFF" && (
                                <button
                                  type="button"
                                  onClick={() => setDialog({ mode: "delete", user })}
                                  aria-label={`Delete ${user.name}`}
                                  className={`${rowButton} text-error`}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                : Array.from({ length: 5 }, (_, row) => (
                    <tr key={row} className="border-b border-border last:border-0">
                      {Array.from({ length: columnCount }, (_, cell) => (
                        <td key={cell} className="px-3 py-3.5">
                          <span className="block h-3 animate-pulse rounded bg-subtle motion-reduce:animate-none" />
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {data && data.count <= 1 && (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">No other users yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">Add users and choose the role each of them has.</p>
            {isAdmin && (
              <button type="button" onClick={() => setDialog({ mode: "add" })} className={`${secondaryButton} mt-4`}>
                Add User
              </button>
            )}
          </div>
        )}

        {data && (data.previous || data.next) && (
          <nav aria-label="Pagination" className="mt-3 flex items-center justify-end gap-2 text-sm">
            <button type="button" onClick={() => setPage(page - 1)} disabled={!data.previous} className={secondaryButton}>
              Previous
            </button>
            <span className="px-1 text-muted-foreground tabular-nums">Page {page}</span>
            <button type="button" onClick={() => setPage(page + 1)} disabled={!data.next} className={secondaryButton}>
              Next
            </button>
          </nav>
        )}
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Users</h2>
        {isAdmin && (
          <button type="button" onClick={() => setDialog({ mode: "add" })} className={primaryButton}>
            <PlusIcon className="size-4" />
            Add User
          </button>
        )}
      </div>

      {content}

      {dialog && (
        <UserDialog
          mode={dialog.mode}
          user={dialog.user}
          modules={modules}
          roles={roles}
          onClose={() => setDialog(undefined)}
          onSaved={(saved) => {
            const text = {
              add: `Added ${saved.name} as ${ROLE_LABELS[saved.role]}.`,
              edit: `Saved changes to ${saved.name}.`,
              status: saved.is_active ? `Activated ${saved.name}.` : `Deactivated ${saved.name}. They can't sign in now.`,
              delete: `Deleted ${saved.name}.`,
            }[dialog.mode];
            notify({ text });
            reload();
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

type FormValues = { name: string; email: string; role: string; password: string; confirm_password: string };
type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

// Form order, used to focus the first field with an error.
const FIELD_ORDER: FieldName[] = ["name", "email", "role", "password", "confirm_password"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Quick checks so people get a helpful message before saving. The API validates everything again and has the final say.
function validate(values: FormValues, mode: Mode) {
  const errors: FieldErrors = {};
  if (mode !== "add" && mode !== "edit") return errors;
  if (!values.name.trim()) errors.name = "Enter the name.";
  if (!values.email.trim()) errors.email = "Enter the email address.";
  else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address.";
  if (!values.role) errors.role = "Choose a role.";
  // Add needs a password; Edit changes it only when one is typed.
  if (mode === "add" || values.password || values.confirm_password) {
    if (!values.password) errors.password = "Enter a password.";
    if (!values.confirm_password) errors.confirm_password = "Enter the password again.";
    else if (values.confirm_password !== values.password) errors.confirm_password = "The passwords don't match.";
  }
  return errors;
}

type UserDialogProps = {
  mode: Mode;
  user?: User;
  modules: { data?: Module[]; error?: ApiError };
  roles: { data?: Role[]; error?: ApiError };
  onClose: () => void;
  onSaved: (user: User) => void;
};

function UserDialog({ mode, user, modules, roles, onClose, onSaved }: UserDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const hasDetails = mode === "add" || mode === "edit";
  const [values, setValues] = useState<FormValues>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    role: user?.role ?? "STAFF",
    password: "",
    confirm_password: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    // Start in the first field rather than on the close button.
    dialogRef.current?.querySelector<HTMLInputElement>("form input")?.focus();
  }, []);

  const close = () => dialogRef.current?.close();
  const fieldId = (field: string) => `${formId}-${field}`;
  const selectedRole = roles.data?.find((role) => role.name === values.role);

  function bind(field: FieldName) {
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setValues((current) => ({ ...current, [field]: event.target.value }));
        // A corrected field stops showing its old error.
        setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
      },
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${fieldId(field)}-error` : undefined,
      className: inputClass,
    };
  }

  function requestBody(mode: Exclude<Mode, "delete">) {
    const { name, email, role, password, confirm_password } = values;
    const details = { name: name.trim(), email: email.trim(), role };
    return {
      add: { ...details, password, confirm_password },
      edit: password ? { ...details, password, confirm_password } : details,
      status: { is_active: !user?.is_active },
    }[mode];
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const found = validate(values, mode);
    setErrors(found);
    setFormError(undefined);
    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      (form.elements.namedItem(firstInvalid) as HTMLElement | null)?.focus();
      return;
    }

    setSaving(true);
    try {
      if (mode === "delete") {
        await apiRequest(`/users/${user?.id}/`, { method: "DELETE" });
        if (user) onSaved(user);
      } else {
        const json = requestBody(mode);
        onSaved(
          user
            ? await apiRequest<User>(`/users/${user.id}/`, { method: "PATCH", json })
            : await apiRequest<User>("/users/", { method: "POST", json }),
        );
      }
      close();
    } catch (error) {
      const apiError = toApiError(error);
      setErrors(apiError.fields);
      // Messages for fields this form doesn't show are added to the summary, so none are lost.
      const shown: string[] = hasDetails ? FIELD_ORDER : [];
      const others = Object.entries(apiError.fields)
        .filter(([field]) => !shown.includes(field))
        .map(([, text]) => text);
      setFormError([apiError.message, ...others].join(" "));
      setSaving(false);
      // Take people to the first field the server rejected, which may be scrolled out of view.
      (form.elements.namedItem(shown.find((field) => apiError.fields[field]) ?? "") as HTMLElement | null)?.focus();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby={`${formId}-title`}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] max-w-xl overflow-hidden p-0`}
    >
      <form noValidate onSubmit={submit} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${formId}-title`} className="text-base font-semibold">
              {
                {
                  add: "Add user",
                  edit: "Edit user",
                  status: user?.is_active ? "Deactivate user" : "Activate user",
                  delete: "Delete user",
                }[mode]
              }
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user ? `${user.name} · ${user.email}` : "What they can open comes from the role you choose."}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className={`${iconButton} -mr-2 size-9`}>
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          {formError && (
            <p
              role="alert"
              className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error"
            >
              {formError}
            </p>
          )}

          {mode === "delete" && (
            <p className="text-sm text-muted-foreground">
              They will be removed permanently. This can&apos;t be undone. Users who have records in the CRM, such as
              leads, can&apos;t be deleted: deactivate them instead.
            </p>
          )}

          {mode === "status" && (
            <p className="text-sm text-muted-foreground">
              {user?.is_active
                ? "They will be signed out and won't be able to sign in. Their records stay in the CRM, and you can activate them again at any time."
                : "They will be able to sign in again with their existing password."}
            </p>
          )}

          {hasDetails && (
            <>
              <Section title="Details">
                <Field label="Name" id={fieldId("name")} required error={errors.name}>
                  <input {...bind("name")} required maxLength={150} autoComplete="off" />
                </Field>
                <Field label="Email" id={fieldId("email")} required error={errors.email} hint="Used to sign in.">
                  <input {...bind("email")} type="email" required maxLength={254} autoComplete="off" />
                </Field>
              </Section>

              <Section title="Role">
                <Field
                  label="Role"
                  id={fieldId("role")}
                  required
                  error={errors.role}
                  hint={roles.error && `Roles couldn't be loaded: ${roles.error.message}`}
                >
                  <select {...bind("role")} required disabled={!roles.data}>
                    {roles.data ? (
                      roles.data.map((role) => (
                        <option key={role.name} value={role.name}>
                          {role.label}
                        </option>
                      ))
                    ) : (
                      <option value={values.role}>{roles.error ? "Roles unavailable" : "Loading roles…"}</option>
                    )}
                  </select>
                </Field>
                <div className="sm:col-span-2">
                  <p className="text-sm font-medium">{selectedRole ? `${selectedRole.label} access` : "Access"}</p>
                  {selectedRole && modules.data ? (
                    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
                      {modules.data.map((module) => {
                        const has = selectedRole.modules.includes(module.key);
                        return (
                          <li key={module.key} className={`flex items-center gap-2 ${has ? "" : "text-muted-foreground"}`}>
                            <span aria-hidden="true" className={`w-3 text-center ${has ? "text-primary" : ""}`}>
                              {has ? "✓" : "✕"}
                            </span>
                            {module.label}
                            <span className="sr-only">{has ? "(has access)" : "(no access)"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {roles.error || modules.error ? "Access couldn't be loaded." : "Loading access…"}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Access is inherited from the selected role. To change it, go to{" "}
                    <Link href="/settings/roles" className="font-medium text-link underline underline-offset-2 hover:text-link-hover">
                      Roles &amp; Access
                    </Link>
                    .
                  </p>
                </div>
              </Section>

              <Section title={mode === "add" ? "Password" : "Change password"}>
                <Field
                  label={mode === "add" ? "Password" : "New password"}
                  id={fieldId("password")}
                  required={mode === "add"}
                  error={errors.password}
                  hint={
                    mode === "add"
                      ? "At least 8 characters."
                      : "Leave blank to keep the current password. A new one signs them out everywhere."
                  }
                >
                  <PasswordInput {...bind("password")} required={mode === "add"} autoComplete="new-password" />
                </Field>
                <Field
                  label={mode === "add" ? "Confirm password" : "Confirm new password"}
                  id={fieldId("confirm_password")}
                  required={mode === "add"}
                  error={errors.confirm_password}
                >
                  <PasswordInput
                    {...bind("confirm_password")}
                    label="confirm password"
                    required={mode === "add"}
                    autoComplete="new-password"
                  />
                </Field>
              </Section>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={close} className={secondaryButton}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || (hasDetails && !roles.data)}
            className={mode === "delete" ? destructiveButton : primaryButton}
          >
            {saving
              ? mode === "delete"
                ? "Deleting…"
                : "Saving…"
              : {
                  add: "Create user",
                  edit: "Save changes",
                  status: user?.is_active ? "Deactivate" : "Activate",
                  delete: "Delete",
                }[mode]}
          </button>
        </div>
      </form>
    </dialog>
  );
}
