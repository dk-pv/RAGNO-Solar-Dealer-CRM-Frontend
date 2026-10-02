import type { Metadata } from "next";
import { Suspense } from "react";

import { WorkActivitiesPage } from "@/components/works/work-activities-page";

export const metadata: Metadata = { title: "Work Activities" };

export default function Page() {
  // WorkActivitiesPage reads its search, filters and page from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Work Activities</h1>}>
      <WorkActivitiesPage />
    </Suspense>
  );
}
