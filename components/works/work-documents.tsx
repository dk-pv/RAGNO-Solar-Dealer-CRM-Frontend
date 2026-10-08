"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";

import {
  AlertIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  SpinnerIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/layout/icons";
import { formatDateTime, formatPhone } from "@/components/leads/api";
import { Field, FormDialog, dialogClass } from "@/components/leads/lead-dialogs";
import { Busy, ErrorState, PageLoading, iconButton, inputClass, secondaryButton, secondaryDangerButton, useNotice } from "@/components/leads/ui";
import { Stats } from "@/components/reports/report-ui";
import { ActionDialog } from "@/components/selection";
import { apiBlob, apiDownload, toApiError, useApi } from "@/lib/api";
import {
  deleteWorkDocument,
  documentFilePath,
  stageFor,
  updateWork,
  uploadWorkDocument,
  type DocumentChecklist,
  type DocumentItem,
  type UploadedDocument,
  type Work,
} from "./api";

type Notify = (notice: { text: string; error?: boolean }) => void;

const cardClass = "flex flex-col rounded-lg border border-border bg-background p-4 shadow-xs";

// A Work's document completeness, linked to its Documents page: "4 documents missing" or "Documents complete", with an
// icon, so the words say it and not only the colour. Hovering shows which documents are missing.
export function DocumentStatus({
  work,
  className = "",
}: {
  work: Pick<Work, "id" | "customer_name" | "document_summary">;
  className?: string;
}) {
  const { is_complete, missing_count, missing_documents } = work.document_summary;
  return (
    <Link
      href={`/works/${work.id}/documents`}
      draggable={false}
      title={is_complete ? undefined : `Missing: ${missing_documents.join(", ")}`}
      className={`flex w-fit max-w-full items-center gap-1.5 rounded text-xs font-medium underline-offset-2 hover:underline ${
        is_complete ? "text-success" : "text-warning"
      } ${className}`}
    >
      {is_complete ? <CheckIcon className="size-3.5 shrink-0" /> : <AlertIcon className="size-3.5 shrink-0" />}
      <span className="truncate">
        {is_complete ? "Documents complete" : `${missing_count} ${missing_count === 1 ? "document" : "documents"} missing`}
        <span className="sr-only"> for {work.customer_name}</span>
      </span>
    </Link>
  );
}

// A Work's documents: every one its loan and subsidy need, as the backend lists them. A file is uploaded, previewed,
// downloaded and replaced for each; the customer's email and phone are the Work's own and are shown as they are.
export function WorkDocuments({ id }: { id: number }) {
  const { data: checklist, error, reload, replace } = useApi<DocumentChecklist>(`/works/${id}/documents/`);
  const [noticeElement, notify] = useNotice();
  const [previewing, setPreviewing] = useState<DocumentItem>();
  const [deleting, setDeleting] = useState<DocumentItem>();
  const [editingEmail, setEditingEmail] = useState(false);

  if (!checklist) {
    return (
      <div>
        <BackLink id={id} />
        {error ? (
          <div className="mt-4 rounded-lg border border-border bg-background">
            {error.status === 404 ? (
              <ErrorState title="Work not found" message="This Work doesn't exist, or you don't have access to it." />
            ) : error.status === 403 ? (
              <ErrorState title="You can't open these documents" message={error.message} />
            ) : (
              <ErrorState title="Couldn't load the documents" message={error.message} onRetry={reload} />
            )}
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading documents" className="mt-4 space-y-3">
            {["w-56", "w-40", "w-full", "w-full", "w-2/3"].map((width, index) => (
              <span key={index} className={`block h-4 animate-pulse rounded bg-subtle motion-reduce:animate-none ${width}`} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const { work, groups } = checklist;
  const summary = work.document_summary;
  const stage = stageFor(work.stage);

  return (
    <div>
      <BackLink id={id} />
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words">
            <span className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase">Documents</span>
            {work.customer_name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            Work #{work.id} · {work.plan_name} plan
            <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${stage.header}`}>
              <span aria-hidden="true" className={`size-1.5 rounded-full ${stage.dot}`} />
              {stage.label}
            </span>
          </p>
        </div>
        <StateBadge tone={summary.is_complete ? "done" : "missing"}>
          {summary.is_complete
            ? "Documents complete"
            : `${summary.missing_count} ${summary.missing_count === 1 ? "document" : "documents"} missing`}
        </StateBadge>
      </header>

      <div className="mt-6">
        <Stats
          stats={[
            { label: "Required", value: summary.required_count },
            { label: "Completed", value: summary.completed_count },
            { label: "Missing", value: summary.missing_count, alert: summary.missing_count > 0 },
            { label: "Progress", value: `${Math.round((summary.completed_count / summary.required_count) * 100)}%` },
          ]}
        />
      </div>

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`documents-${group.key}`} className="mt-8">
          <h2 id={`documents-${group.key}`} className="text-sm font-semibold">
            {group.label}
            <span className="ml-2 font-normal text-muted-foreground tabular-nums">
              {group.items.filter((item) => item.provided).length} of {group.items.length} provided
            </span>
          </h2>
          {/* As many cards to a row as fit at 19rem or wider: one on a phone, two on a tablet, three on a laptop and
              more on a wide screen, with the sidebar open or not. auto-fill keeps a short group's cards as wide as a
              full group's. */}
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-3">
            {group.items.map((item) =>
              item.kind === "field" ? (
                <InfoCard
                  key={item.key}
                  item={item}
                  work={work}
                  // The email can be added or corrected here; the phone was required when the lead was added.
                  onEdit={item.field === "email" ? () => setEditingEmail(true) : undefined}
                />
              ) : (
                <DocumentCard
                  key={item.key}
                  workId={work.id}
                  item={item}
                  maxFileSize={checklist.max_file_size}
                  canDelete={checklist.can_delete}
                  notify={notify}
                  onUploaded={(next, verb) => {
                    replace(next);
                    notify({ text: `${verb} the ${item.name} for ${work.customer_name}.` });
                  }}
                  onCancelled={() => {
                    // Cancel is offered only until the server has the whole file; reloaded all the same, in case the
                    // last bytes went just as it was pressed.
                    reload();
                    notify({ text: "Upload cancelled." });
                  }}
                  onPreview={() => setPreviewing(item)}
                  onDelete={() => setDeleting(item)}
                />
              ),
            )}
          </ul>
        </section>
      ))}

      {previewing?.document && (
        <PreviewDialog workId={work.id} item={previewing} document={previewing.document} onClose={() => setPreviewing(undefined)} />
      )}
      {deleting?.document && (
        <ActionDialog
          destructive
          title={`Delete the ${deleting.name}?`}
          description={`"${deleting.document.original_filename}" is deleted for good, from the CRM and from its storage. The ${deleting.name} shows as missing until a new file is uploaded.`}
          confirmLabel="Delete document"
          pendingLabel="Deleting…"
          onConfirm={async () => {
            replace(await deleteWorkDocument(work.id, deleting.key));
            notify({ text: `Deleted the ${deleting.name} for ${work.customer_name}.` });
          }}
          onClose={() => {
            setDeleting(undefined);
            // The Delete button that opened this may be gone: the place stays on the card.
            document.getElementById(cardTitleId(deleting.key))?.focus();
          }}
          onError={(text) => notify({ text, error: true })}
        />
      )}
      {editingEmail && (
        <EmailDialog
          work={work}
          onClose={() => setEditingEmail(false)}
          onSaved={() => {
            reload();
            notify({ text: `Saved the email for ${work.customer_name}.` });
          }}
        />
      )}
      {noticeElement}
    </div>
  );
}

function BackLink({ id }: { id: number }) {
  return (
    <Link href={`/works/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2">
      <ChevronLeftIcon className="size-4" />
      Work #{id}
    </Link>
  );
}

const BADGE_TONES = {
  done: "bg-success-soft text-success ring-success-border",
  missing: "bg-warning-soft text-warning ring-warning-border",
  optional: "bg-neutral-soft text-neutral ring-neutral-border",
};

// A document's state, or the whole page's: in words, with an icon, never by colour alone.
function StateBadge({ tone, children }: { tone: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      {tone === "done" && <CheckIcon className="size-3.5" />}
      {tone === "missing" && <AlertIcon className="size-3.5" />}
      {children}
    </span>
  );
}

// A document is provided ("Uploaded", "Provided"), missing, or optional when the backend doesn't require it.
function ItemBadge({ item, done }: { item: DocumentItem; done: string }) {
  if (item.provided) return <StateBadge tone="done">{done}</StateBadge>;
  return item.required ? <StateBadge tone="missing">Missing</StateBadge> : <StateBadge tone="optional">Optional</StateBadge>;
}

// The words and icon of a Download button. `compact`: only the icon shows on a phone (the preview's header).
function DownloadLabel({ item, compact }: { item: DocumentItem; compact: boolean }) {
  return (
    <>
      <DownloadIcon className="size-4" />
      <span className={compact ? "max-sm:sr-only" : undefined}>Download</span>
      <span className="sr-only"> the {item.name}</span>
    </>
  );
}

type DownloadButtonProps = {
  workId: number;
  item: DocumentItem;
  document: UploadedDocument;
  onError: (message: string) => void;
  compact?: boolean;
};

// Fetches the document's file and saves it under its original name.
function DownloadButton({ workId, item, document, onError, compact = false }: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      await apiDownload(documentFilePath(workId, item.key), document.original_filename);
    } catch (error) {
      onError(`Couldn't download the ${item.name}. ${toApiError(error).message}`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <button type="button" onClick={download} aria-disabled={downloading || undefined} className={`${secondaryButton} aria-disabled:opacity-50`}>
      {downloading ? <Busy>Downloading…</Busy> : <DownloadLabel item={item} compact={compact} />}
    </button>
  );
}

// A card's title, which keeps the keyboard's place on the card when the button in use goes away (a deleted file's
// Delete, a retry's Try again), as lead-detail's headings do.
const cardTitleId = (key: string) => `document-${key}`;

function CardTitle({ ref, id, icon, name, badge }: { ref?: Ref<HTMLHeadingElement>; id: string; icon: ReactNode; name: string; badge: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 ref={ref} id={id} tabIndex={-1} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        {icon}
        <span className="break-words">{name}</span>
      </h3>
      {badge}
    </div>
  );
}

// The customer's email or phone, which the Work holds itself rather than as an uploaded file.
function InfoCard({ item, work, onEdit }: { item: DocumentItem; work: Work; onEdit?: () => void }) {
  const phone = item.field === "phone";
  const value = phone ? formatPhone(work) : work.email;
  return (
    <li className={cardClass}>
      <CardTitle
        id={cardTitleId(item.key)}
        icon={phone ? <PhoneIcon className="size-4 shrink-0 text-faint" /> : <MailIcon className="size-4 shrink-0 text-faint" />}
        name={item.name}
        badge={<ItemBadge item={item} done="Provided" />}
      />
      <div className="mt-3 flex-1 text-sm">
        {value ? <p className="font-medium break-all">{value}</p> : <p className="text-muted-foreground">Not provided yet.</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {phone ? "The customer's phone number on this Work." : "The customer's email address on this Work."}
        </p>
      </div>
      {onEdit && (
        <div className="mt-4">
          <button type="button" onClick={onEdit} className={secondaryButton}>
            <PencilIcon className="size-4" />
            {value ? "Change email" : "Add email"}
          </button>
        </div>
      )}
    </li>
  );
}

type DocumentCardProps = {
  workId: number;
  item: DocumentItem;
  maxFileSize: number;
  canDelete: boolean;
  notify: Notify;
  onUploaded: (checklist: DocumentChecklist, verb: "Uploaded" | "Replaced") => void;
  onCancelled: () => void;
  onPreview: () => void;
  onDelete: () => void;
};

// One document to upload: missing, or its file with Preview, Download and Replace (and Delete for admins).
function DocumentCard({ workId, item, maxFileSize, canDelete, notify, onUploaded, onCancelled, onPreview, onDelete }: DocumentCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // `sent`: the server has the whole file, so stopping the request would no longer stop the upload; `progress` is the
  // fraction sent until then.
  const [uploading, setUploading] = useState<{ name: string; controller: AbortController; progress: number; sent: boolean }>();
  // `retry`: the file to send again, when the failure wasn't the file's fault.
  const [failure, setFailure] = useState<{ message: string; retry?: File }>();
  const { document } = item;
  const retry = failure?.retry;
  const percent = Math.round((uploading?.progress ?? 0) * 100);

  async function upload(file: File) {
    const problem = fileProblem(file, item.accept, maxFileSize);
    if (problem) {
      setFailure({ message: problem });
      return;
    }
    const controller = new AbortController();
    setFailure(undefined);
    setUploading({ name: file.name, controller, progress: 0, sent: false });
    try {
      const checklist = await uploadWorkDocument(workId, item.key, file, {
        signal: controller.signal,
        onProgress: (progress) => setUploading((current) => current && { ...current, progress }),
        onSent: () => setUploading((current) => current && { ...current, progress: 1, sent: true }),
      });
      onUploaded(checklist, document ? "Replaced" : "Uploaded");
    } catch (error) {
      if (controller.signal.aborted) onCancelled();
      else {
        const apiError = toApiError(error);
        // A file the server refused (400) would be refused again; anything else may go through on a second try.
        setFailure({ message: apiError.fields.file ?? apiError.message, retry: apiError.status === 400 ? undefined : file });
      }
    } finally {
      setUploading(undefined);
    }
  }

  return (
    <li className={cardClass}>
      <CardTitle
        ref={titleRef}
        id={cardTitleId(item.key)}
        icon={<FileIcon className="size-4 shrink-0 text-faint" />}
        name={item.name}
        badge={<ItemBadge item={item} done="Uploaded" />}
      />
      <div className="mt-3 flex-1 text-sm">
        {document ? (
          <>
            <p className="truncate font-medium" title={document.original_filename}>
              {document.original_filename}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {typeLabel(document.content_type)} · {formatFileSize(document.file_size)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Uploaded {formatDateTime(document.uploaded_at)}
              {document.uploaded_by_name && ` by ${document.uploaded_by_name}`}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">No file uploaded yet.</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {describeTypes(item.accept)} · up to {formatFileSize(maxFileSize)}
            </p>
          </>
        )}
      </div>

      {failure && (
        <div role="alert" className="mt-3 rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
          Couldn&apos;t upload the {item.name}. {failure.message}
          {retry && (
            <button
              type="button"
              onClick={() => {
                // This button goes with the message as the retry starts: the place stays on the card.
                titleRef.current?.focus();
                upload(retry);
              }}
              className="ml-1 font-medium underline underline-offset-2 hover:no-underline pointer-coarse:py-2"
            >
              Try again
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {uploading ? (
          <>
            <div className="min-w-0 flex-1">
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <SpinnerIcon className="size-4 shrink-0" />
                <span className="truncate">{uploading.sent ? `Saving ${uploading.name}…` : `Uploading ${uploading.name}…`}</span>
              </p>
              <span
                role="progressbar"
                aria-label={`Uploading ${uploading.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="mt-2 block h-1.5 overflow-hidden rounded-full bg-subtle"
              >
                <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </span>
            </div>
            {/* Only while the file is being sent: once the server has it, stopping the request wouldn't stop it. */}
            {!uploading.sent && (
              <button type="button" onClick={() => uploading.controller.abort()} className={secondaryButton}>
                Cancel
                <span className="sr-only"> the upload</span>
              </button>
            )}
          </>
        ) : (
          <>
            {document && (
              <>
                <button type="button" onClick={onPreview} className={secondaryButton}>
                  <EyeIcon className="size-4" />
                  Preview<span className="sr-only"> the {item.name}</span>
                </button>
                <DownloadButton
                  workId={workId}
                  item={item}
                  document={document}
                  onError={(text) => notify({ text, error: true })}
                />
              </>
            )}
            <button type="button" onClick={() => inputRef.current?.click()} className={secondaryButton}>
              <UploadIcon className="size-4" />
              {document ? "Replace" : "Upload document"}
              <span className="sr-only"> for the {item.name}</span>
            </button>
            {document && canDelete && (
              <button type="button" onClick={onDelete} className={secondaryDangerButton}>
                <TrashIcon className="size-4" />
                Delete<span className="sr-only"> the {item.name}</span>
              </button>
            )}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={item.accept.join(",")}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared, so choosing the same file again (after fixing a problem) still sends it.
            event.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
    </li>
  );
}

type PreviewProps = { workId: number; item: DocumentItem; document: UploadedDocument; onClose: () => void };
// The file, fetched for one try (`attempt`): its address in the page, or why it couldn't be loaded.
type Loaded = { attempt: number } & ({ url: string } | { error: string });

// An uploaded document in the page: an image as it is, a PDF in the browser's own viewer where it has one. The file comes
// through the API with the user's token, like every request, so it is never at a public address. Other files can only be
// downloaded.
function PreviewDialog({ workId, item, document, onClose }: PreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>();
  // Shown in the dialog: a page notice would sit behind it.
  const [downloadError, setDownloadError] = useState<string>();
  const path = documentFilePath(workId, item.key);
  const kind = document.content_type === "application/pdf" ? "pdf" : document.content_type.startsWith("image/") ? "image" : "other";
  const label = `${item.name}: ${document.original_filename}`;
  // A retry shows the loader again until its own answer arrives.
  const current = loaded?.attempt === attempt ? loaded : undefined;

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    if (kind === "other") return;
    const controller = new AbortController();
    let url: string | undefined;
    apiBlob(path, controller.signal).then(
      (blob) => {
        url = URL.createObjectURL(blob);
        setLoaded({ attempt, url });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ attempt, error: toApiError(error).message });
      },
    );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, kind, attempt]);

  let content: ReactNode;
  if (kind === "other") content = <NoPreview>There is no preview for this type of file. Download it to open it.</NoPreview>;
  else if (!current) content = <PageLoading label="Loading the preview…" />;
  else if ("error" in current) {
    content = <ErrorState title="Couldn't load the preview" message={current.error} onRetry={() => setAttempt((n) => n + 1)} />;
  } else if (kind === "image") {
    content = (
      <div className="relative h-[70dvh] w-full">
        <Image src={current.url} alt={label} fill unoptimized className="object-contain" />
      </div>
    );
  } else {
    content = (
      <object data={current.url} type="application/pdf" aria-label={label} className="block h-[70dvh] w-full rounded-md bg-background">
        <NoPreview>This browser can&apos;t show PDF files here. Download the file to open it.</NoPreview>
      </object>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      // A click on the backdrop (outside the panel) closes it, as Escape does.
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
      aria-labelledby={titleId}
      className={`${dialogClass} max-h-[calc(100dvh-2rem)] max-w-5xl overflow-hidden p-0`}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {item.name}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={document.original_filename}>
              {document.original_filename} · {typeLabel(document.content_type)} · {formatFileSize(document.file_size)}
            </p>
          </div>
          <div className="-mr-2 flex shrink-0 items-center gap-1">
            {current && "url" in current ? (
              // The file shown is already here: saved as it is, with no second download.
              <a href={current.url} download={document.original_filename} className={secondaryButton}>
                <DownloadLabel item={item} compact />
              </a>
            ) : (
              <DownloadButton workId={workId} item={item} document={document} onError={setDownloadError} compact />
            )}
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close preview" className={`${iconButton} size-9`}>
              <CloseIcon className="size-4.5" />
            </button>
          </div>
        </div>
        {downloadError && (
          <p role="alert" className="mx-5 mt-3 rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
            {downloadError}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto bg-page p-3">{content}</div>
      </div>
    </dialog>
  );
}

function NoPreview({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

// Adds or corrects the customer's email on the Work: the Email ID document.
function EmailDialog({ work, onClose, onSaved }: { work: Work; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [email, setEmail] = useState(work.email);
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);

  // After FormDialog has opened (a child's effect runs first): the one field, rather than Close, takes the focus.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    const value = email.trim();
    if (!value) {
      setFieldError("Enter the customer's email address.");
      return;
    }
    setSaving(true);
    setFieldError(undefined);
    setFormError(undefined);
    try {
      await updateWork(work.id, { email: value });
      onSaved();
      dialogRef.current?.close();
    } catch (error) {
      const apiError = toApiError(error);
      setFieldError(apiError.fields.email);
      setFormError(apiError.fields.email ? undefined : apiError.message);
      setSaving(false);
    }
  }

  return (
    <FormDialog
      ref={dialogRef}
      title={work.email ? "Change email" : "Add email"}
      subtitle={`Work #${work.id} · ${work.customer_name}`}
      width="max-w-md"
      busy={saving}
      error={formError}
      submitLabel="Save email"
      busyLabel="Saving…"
      onSubmit={submit}
      onClose={onClose}
    >
      <Field label="Email ID" id={inputId} error={fieldError} required hint="Saved on this Work. The lead keeps its own details.">
        <input
          ref={inputRef}
          id={inputId}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? `${inputId}-error` : undefined}
          className={inputClass}
        />
      </Field>
    </FormDialog>
  );
}

// The same checks the backend makes on a file's name and size, so a wrong file is refused before it is sent. The backend
// also checks what the file contains.
function fileProblem(file: File, accept: string[], maxSize: number) {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  if (!accept.includes(extension)) return `Upload a ${describeTypes(accept)} file.`;
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxSize) return `The file is larger than ${formatFileSize(maxSize)}.`;
  return undefined;
}

// "PDF, JPG, JPEG, PNG or WEBP": what an upload may be, from the backend's list of extensions.
function describeTypes(accept: string[]) {
  const names = accept.map((extension) => extension.slice(1).toUpperCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] ?? "");
}

// "PDF", "JPEG", "PNG": a file's type as people know it.
const typeLabel = (contentType: string) => contentType.split("/").pop()?.toUpperCase() ?? contentType;

const formatFileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toLocaleString("en-IN", { maximumFractionDigits: 1 })} MB`;
