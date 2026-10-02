import type { Metadata } from "next";
import { Suspense } from "react";

import { LeadActivitiesPage } from "@/components/leads/lead-activities";

export const metadata: Metadata = { title: "Lead Activities" };

export default function Page() {
  // The page reads its search, filters, sort and page from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Lead Activities</h1>}>
      <LeadActivitiesPage />
    </Suspense>
  );
}
