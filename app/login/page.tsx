import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in | Ragno Power System" };

// Outside the app/(app) group, so it renders without the sidebar and navbar.
export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      {/* LoginForm reads ?next= from the URL, which needs a Suspense boundary when prerendered. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
