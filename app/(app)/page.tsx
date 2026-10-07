"use client";

import { useRouter } from "next/navigation";
import { useContext, useEffect } from "react";

import { startPageFor } from "@/components/layout/navigation";
import { CurrentUserContext, type ShellUser } from "@/components/layout/use-shell-session";
import { PageLoading } from "@/components/leads/ui";

// The CRM entry point at "/", where signing in lands: it opens this user's start page (All Leads, or Lead Activities
// for Activities-only staff). It renders inside the shared shell, which renders pages only once the user has loaded.
export default function HomePage() {
  const me = useContext(CurrentUserContext) as ShellUser;
  const router = useRouter();
  const start = startPageFor(me);
  useEffect(() => {
    if (start) router.replace(start);
  }, [start, router]);

  // A role that opens no page has nowhere to go: this says so rather than redirecting.
  return start ? (
    <PageLoading label="Opening the CRM…" />
  ) : (
    <section>
      <h1 className="text-xl font-semibold">Ragno Power System</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your role doesn&apos;t include any section yet. Ask an admin for access.
      </p>
    </section>
  );
}
