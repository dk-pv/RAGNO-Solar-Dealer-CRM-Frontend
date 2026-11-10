import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: { default: "H&D Technologies — Solar Dealer CRM", template: "%s | H&D Technologies" },
};

// Every signed-in CRM page lives under app/(app)/ and gets the shared sidebar and navbar.
// Routes outside this group (for example the login page) render without the shell.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
