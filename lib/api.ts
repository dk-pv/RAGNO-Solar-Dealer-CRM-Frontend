import { useCallback, useEffect, useState } from "react";

import { getAccessToken, signOut } from "./auth";

// Base URL of the Django API, for example http://127.0.0.1:8000/api (see .env.example).
// Next.js inlines NEXT_PUBLIC_ values at build time.
export const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  // DRF validation messages keyed by field name (the first message of each field).
  fields: Record<string, string>;

  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function toApiError(error: unknown) {
  return error instanceof ApiError ? error : new ApiError("Something went wrong. Try again.", 0);
}

type RequestOptions = { method?: string; json?: unknown; signal?: AbortSignal; accept?: string };

const UNREACHABLE = "Can't reach the server. Check your connection and try again.";

// Every CRM request goes through here (uploads through apiUpload), signed with the user's access token.
async function send(path: string, { method = "GET", json, signal, accept = "application/json" }: RequestOptions = {}) {
  return signed(async (bearer) => {
    try {
      return await fetch(`${API_URL}${path}`, {
        method,
        signal,
        headers: {
          Accept: accept,
          ...(json === undefined ? {} : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${bearer}`,
        },
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(UNREACHABLE, 0);
    }
  });
}

type UploadOptions = { signal?: AbortSignal; onProgress?: (fraction: number) => void; onSent?: () => void };

// Uploads `form` (multipart), signed and answered like every other request. It goes through XMLHttpRequest because fetch
// can't tell how much of a body has been sent: `onProgress` gets the fraction sent, and `onSent` runs once the server has
// the whole body (stopping the request after that no longer stops the upload).
export async function apiUpload<T>(path: string, form: FormData, { signal, onProgress, onSent }: UploadOptions = {}) {
  const response = await signed(
    (bearer) =>
      new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_URL}${path}`);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${bearer}`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress?.(event.loaded / event.total);
        };
        xhr.upload.onload = () => onSent?.();
        xhr.onload = () => {
          const headers = { "Content-Type": xhr.getResponseHeader("Content-Type") ?? "" };
          resolve(new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status, headers }));
        };
        // As fetch does when its signal is aborted.
        const stopped = () => reject(new DOMException("The upload was stopped.", "AbortError"));
        xhr.onerror = () => reject(new ApiError(UNREACHABLE, 0));
        xhr.onabort = stopped;
        // An XMLHttpRequest that hasn't been sent yet fires nothing when aborted.
        if (signal?.aborted) return stopped();
        signal?.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.send(form);
      }),
  );
  return (await response.json()) as T;
}

// Sends `request` with the user's access token (see lib/auth.ts). If the API refuses the token, it is renewed once and
// the request sent again. An error answer becomes an ApiError.
async function signed(request: (bearer: string) => Promise<Response>) {
  if (!API_URL) throw new ApiError("The API address isn't configured. Set NEXT_PUBLIC_API_URL.", 0);
  const token = await getAccessToken();
  // Signed out: the API would only answer 401, and the app is already on its way to the sign-in page.
  if (!token) throw new ApiError(STATUS_MESSAGES[401], 401);

  let response = await request(token);
  if (response.status === 401) {
    // The access token expired (or was revoked): renew it once and retry.
    const renewed = await getAccessToken(token);
    if (!renewed) throw new ApiError(STATUS_MESSAGES[401], 401);
    response = await request(renewed);
    // Even a fresh token is refused, for example because the account was deactivated: end the session.
    if (response.status === 401) signOut();
  }
  if (!response.ok) throw await errorFrom(response);
  return response;
}

const STATUS_MESSAGES: Record<number, string> = {
  401: "You're not signed in, or your session has expired. Sign in and try again.",
  403: "You don't have permission to do this.",
  404: "Not found.",
  429: "Too many requests. Wait a moment and try again.",
};

const firstText = (value: unknown) =>
  typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;

// Only 400, 403 and 409 responses carry messages written for people (validation and business rules), and only
// their JSON bodies are read. Anything else gets a fixed message, so a server error page or stack trace never shows.
async function errorFrom(response: Response) {
  const { status } = response;
  let message: string | undefined;
  const fields: Record<string, string> = {};
  if ([400, 403, 409].includes(status) && response.headers.get("Content-Type")?.includes("json")) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && !Array.isArray(body)) {
      for (const [key, value] of Object.entries(body)) {
        const text = firstText(value);
        if (text) {
          if (key === "detail" || key === "non_field_errors") message = text;
          else fields[key] = text;
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
          // A nested object's messages, such as a new lead's initial follow-up: "initial_follow_up.title".
          for (const [inner, innerValue] of Object.entries(value)) {
            const innerText = firstText(innerValue);
            if (innerText) fields[`${key}.${inner}`] = innerText;
          }
        }
      }
    }
    if (!message && Object.keys(fields).length > 0) message = "Some fields need attention.";
  }
  const fallback = status >= 500 ? "Something went wrong on the server. Try again in a moment." : "The request couldn't be completed.";
  return new ApiError(message ?? STATUS_MESSAGES[status] ?? fallback, status, fields);
}

export async function apiRequest<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await send(path, options);
  return (response.status === 204 ? undefined : await response.json()) as T;
}

// A file response (a CSV export, a Work's document) as a Blob, through the same authenticated request: a plain link or
// <img src> to the API would be refused, as it carries no token.
export async function apiBlob(path: string, signal?: AbortSignal) {
  return (await send(path, { accept: "*/*", signal })).blob();
}

// Downloads a file response (such as a CSV export) through the same authenticated request.
export async function apiDownload(path: string, filename: string) {
  const url = URL.createObjectURL(await apiBlob(path));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Loads `path` (nothing while it is null) and reloads it whenever the path changes. A newer request cancels the older
// one, and the last loaded data stays available while the next request is in flight, so a list doesn't flash empty.
export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const key = `${version} ${path}`;
  const [result, setResult] = useState<{ key?: string; data?: T; error?: ApiError }>({});

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    apiRequest<T>(path, { signal: controller.signal }).then(
      (data) => setResult({ key, data }),
      (error: unknown) => {
        if (!controller.signal.aborted) setResult((previous) => ({ key, data: previous.data, error: toApiError(error) }));
      },
    );
    return () => controller.abort();
  }, [key, path]);

  return {
    data: result.data,
    error: result.key === key ? result.error : undefined,
    loading: path !== null && result.key !== key,
    // The same function on every render, so an effect (a poll, say) can depend on it without re-running each render.
    reload: useCallback(() => setVersion((current) => current + 1), []),
    // Shows `data` as the path's answer without loading it again, such as the updated record a change sent back.
    replace: useCallback((data: T) => setResult({ key, data }), [key]),
  };
}
