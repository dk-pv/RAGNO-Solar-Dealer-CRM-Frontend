import { createContext, useSyncExternalStore } from "react";

import { useApi, type ApiError } from "@/lib/api";
import { isSignedIn, signOut, subscribeToSession } from "@/lib/auth";

// The shell's view of the signed-in user (a subset of GET /api/auth/me/).
export type ShellUser = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  // The modules this user can open (an admin has all of them). The API enforces the same access on every request.
  modules: string[];
};

// The signed-in user for pages inside the shell, which renders them only once the user has loaded.
export const CurrentUserContext = createContext<ShellUser | null>(null);

export type ShellSession = {
  // null until the browser's stored session has been read: the server can't see it.
  signedIn: boolean | null;
  user: ShellUser | null;
  // Why the user couldn't be loaded, with a retry.
  userError: ApiError | undefined;
  reloadUser: () => void;
  logout: (() => void) | null;
};

export function useShellSession(): ShellSession {
  const signedIn = useSyncExternalStore(subscribeToSession, isSignedIn, () => null);
  const { data: user, error, reload } = useApi<ShellUser>(signedIn ? "/auth/me/" : null);
  return {
    signedIn,
    user: signedIn ? (user ?? null) : null,
    userError: signedIn ? error : undefined,
    reloadUser: reload,
    logout: signedIn ? signOut : null,
  };
}
