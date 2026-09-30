import { useEffect, useState } from "react";

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

// Every CRM request goes through here, signed with the user's access token (see lib/auth.ts).
async function send(path: string, { method = "GET", json, signal, accept = "application/json" }: RequestOptions = {}) {
  if (!API_URL) throw new ApiError("The API address isn't configured. Set NEXT_PUBLIC_API_URL.", 0);
  const token = await getAccessToken();
  // Signed out: the API would only answer 401, and the app is already on its way to the sign-in page.
  if (!token) throw new ApiError(STATUS_MESSAGES[401], 401);

  const request = async (bearer: string) => {
    try {
      return await fetch(API_URL + path, {
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
      throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
    }
  };

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
        if (!text) continue;
        if (key === "detail" || key === "non_field_errors") message = text;
        else fields[key] = text;
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

// Downloads a file response (such as a CSV export) through the same authenticated request.
export async function apiDownload(path: string, filename: string) {
  const response = await send(path, { accept: "*/*" });
  const url = URL.createObjectURL(await response.blob());
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
    reload: () => setVersion((current) => current + 1),
  };
}
