import { useSyncExternalStore } from "react";

import { useApi } from "@/lib/api";
import { isSignedIn, signOut, subscribeToSession } from "@/lib/auth";

// The shell's view of the signed-in user (a subset of GET /api/auth/me/).
export type ShellUser = {
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
};

export type ShellSession = {
  // null until the browser's stored session has been read: the server can't see it.
  signedIn: boolean | null;
  user: ShellUser | null;
  logout: (() => void) | null;
};

export function useShellSession(): ShellSession {
  const signedIn = useSyncExternalStore(subscribeToSession, isSignedIn, () => null);
  const { data: user } = useApi<ShellUser>(signedIn ? "/auth/me/" : null);
  return {
    signedIn,
    user: signedIn ? (user ?? null) : null,
    logout: signedIn ? signOut : null,
  };
}
