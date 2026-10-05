import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkPipeline } from "@/components/works/work-pipeline";

export const metadata: Metadata = { title: "Work Pipeline" };

export default function Page() {
  // The pipeline reads its search, filters and sort from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Work Pipeline</h1>}>
      <WorkPipeline />
    </Suspense>
  );
}
