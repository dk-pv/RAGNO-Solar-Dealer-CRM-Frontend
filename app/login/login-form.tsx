"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";

import { Busy, PageLoading, inputClass, primaryButton } from "@/components/leads/ui";
import { PasswordInput } from "@/components/password-input";
import { toApiError } from "@/lib/api";
import { isSignedIn, signIn, subscribeToSession } from "@/lib/auth";

// Where signing in lands when no page asked to be returned to: "/" opens the user's start page (All Leads, or Lead
// Activities for Activities-only staff), which this form can't tell as it never loads the user.
const HOME = "/";

// Only paths on this site, so a crafted link can't send someone elsewhere after they sign in.
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : HOME;
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const signedIn = useSyncExternalStore(subscribeToSession, isSignedIn, () => false);
  const formId = useId();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // On a computer the cursor starts in the email field. A phone would raise its keyboard over the form before it has been
  // read, so there the field waits for a tap.
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) emailRef.current?.focus();
  }, []);

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

  // Signed in (just now, or already): no form to fill in while the redirect above happens.
  if (signedIn) return <PageLoading label="Opening the CRM…" />;

  return (
    <div className="w-full max-w-sm">
      {/* The brand panel carries the logo on large screens; smaller screens show it here instead. */}
      <div className="mb-8 flex items-center gap-3 sm:mb-10 lg:hidden">
        <Image
          src="/ragno-favicon-512.png"
          alt="Ragno Power System logo"
          width={512}
          height={512}
          sizes="(min-width: 640px) 80px, 64px"
          className="size-16 shrink-0 sm:size-20"
        />
        <div className="leading-tight">
          <p className="font-semibold">Ragno Power System</p>
          <p className="text-sm text-muted-foreground">Solar Dealer CRM</p>
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Welcome back. Enter your details to open the CRM.</p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <div>
          <label htmlFor={`${formId}-email`} className="mb-1.5 block text-sm font-medium text-label">
            Email
          </label>
          <input
            id={`${formId}-email`}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            required
            ref={emailRef}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={`${formId}-password`} className="mb-1.5 block text-sm font-medium text-label">
            Password
          </label>
          <PasswordInput
            id={`${formId}-password`}
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            className={inputClass}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-error-border bg-error-soft px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
          {pending ? <Busy>Signing in…</Busy> : "Sign in"}
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Forgot your password? Ask an admin to reset it.
      </p>
    </div>
  );
}
