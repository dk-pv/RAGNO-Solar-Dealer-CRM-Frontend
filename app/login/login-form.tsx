"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";

import { inputClass, primaryButton } from "@/components/leads/ui";
import { toApiError } from "@/lib/api";
import { isSignedIn, signIn, subscribeToSession } from "@/lib/auth";

// Only paths on this site, so a crafted link can't send someone elsewhere after they sign in.
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const signedIn = useSyncExternalStore(subscribeToSession, isSignedIn, () => false);
  const formId = useId();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  // Signing in updates the session; already signed-in visitors go straight on too.
  useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, next, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      await signIn(String(form.get("email")).trim(), String(form.get("password")));
    } catch (err) {
      setError(toApiError(err).message);
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 place-items-center rounded-lg bg-brand text-base font-bold text-zinc-950"
        >
          R
        </span>
        <div className="leading-tight">
          <p className="font-semibold">Ragno Power System</p>
          <p className="text-sm text-muted-foreground">Solar Dealer CRM</p>
        </div>
      </div>

      <h1 className="mt-10 text-xl font-semibold">Sign in</h1>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor={`${formId}-email`} className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-password`} className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id={`${formId}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
