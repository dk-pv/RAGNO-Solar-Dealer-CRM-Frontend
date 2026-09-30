import type { Metadata } from "next";
import { Suspense } from "react";

import { LeadsPage } from "@/components/leads/leads-page";

export const metadata: Metadata = { title: "Leads" };

export default function Page() {
  // LeadsPage reads its search, filters and page from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Leads</h1>}>
      <LeadsPage />
    </Suspense>
  );
}
