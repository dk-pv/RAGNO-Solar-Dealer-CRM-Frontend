import type { ReactNode } from "react";
import { Suspense } from "react";

import { ReportsShell } from "@/components/reports/reports-shell";

export default function ReportsLayout({ children }: { children: ReactNode }) {
  // The reports read their period and filters from the URL, which needs a Suspense boundary when prerendered.
  return (
    <Suspense fallback={<h1 className="text-xl font-semibold">Reports</h1>}>
      <ReportsShell>{children}</ReportsShell>
    </Suspense>
  );
}
