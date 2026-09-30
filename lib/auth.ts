// Signing in with the Django API's JWT endpoints: /api/auth/login/ and /api/auth/refresh/.
//
// The access token (15 minutes) lives only in memory. The refresh token (1 day) is kept in localStorage, so a reload
// or a second tab stays signed in. Like anything JavaScript can read, it is exposed if the page is ever hit by XSS;
// an httpOnly cookie would avoid that but needs the backend to issue cookies.
//
// Authentication is HRITHIK's module: this is the minimum the CRM needs to talk to the API. His module can replace
// this file; the rest of the app only uses signIn, signOut, getAccessToken and the session store below.
import { API_URL, ApiError } from "./api";

const REFRESH_KEY = "ragno:refresh";
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function storedRefreshToken() {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function setSession(access: string | null, refresh: string | null) {
  accessToken = access;
  try {
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    else localStorage.removeItem(REFRESH_KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}

// A session store for useSyncExternalStore: signed in means a refresh token is stored. Signing in or out in another
// tab reaches this tab through the storage event.
export function subscribeToSession(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== REFRESH_KEY && event.key !== null) return;
    accessToken = null;
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const isSignedIn = () => storedRefreshToken() !== null;

async function post(path: string, body: unknown) {
  if (!API_URL) throw new ApiError("The API address isn't configured. Set NEXT_PUBLIC_API_URL.", 0);
  try {
    return await fetch(API_URL + path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
}

export async function signIn(email: string, password: string) {
  const response = await post("/auth/login/", { email, password });
  // Same message for an unknown email and a wrong password, so the form doesn't reveal which accounts exist.
  if (response.status === 400 || response.status === 401) {
    throw new ApiError("The email or password is incorrect.", response.status);
  }
  if (!response.ok) throw new ApiError("Something went wrong on the server. Try again in a moment.", response.status);
  const { access, refresh } = await response.json();
  setSession(access, refresh);
}

export function signOut() {
  setSession(null, null);
}

// A usable access token, or null when signed out. Pass `rejected` when the API has just refused a token: it is then
// renewed with the refresh token unless another request already did so. Concurrent callers share one renewal.
export async function getAccessToken(rejected?: string): Promise<string | null> {
  if (accessToken && accessToken !== rejected) return accessToken;
  accessToken = null;
  const refresh = storedRefreshToken();
  if (!refresh) return null;
  refreshing ??= renew(refresh).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function renew(refresh: string) {
  const response = await post("/auth/refresh/", { refresh });
  if (response.status === 400 || response.status === 401) {
    // The refresh token expired or was revoked (a password change revokes it): the session is over.
    signOut();
    return null;
  }
  if (!response.ok) throw new ApiError("Something went wrong on the server. Try again in a moment.", response.status);
  accessToken = (await response.json()).access as string;
  return accessToken;
}
