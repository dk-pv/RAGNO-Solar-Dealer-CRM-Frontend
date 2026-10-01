import type { Metadata } from "next";
import { Suspense } from "react";

import { WorksPage } from "@/components/works/works-page";

export const metadata: Metadata = { title: "Works" };

export default function Page() {
  // WorksPage reads its search, filters and page from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Works</h1>}>
      <WorksPage />
    </Suspense>
  );
}
