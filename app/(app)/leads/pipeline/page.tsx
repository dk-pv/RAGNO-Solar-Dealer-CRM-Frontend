import type { Metadata } from "next";
import { Suspense } from "react";

import { LeadsPipeline } from "@/components/leads/leads-pipeline";

export const metadata: Metadata = { title: "Lead Pipeline" };

export default function Page() {
  // The pipeline reads its search, filters and sort from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Lead Pipeline</h1>}>
      <LeadsPipeline />
    </Suspense>
  );
}
