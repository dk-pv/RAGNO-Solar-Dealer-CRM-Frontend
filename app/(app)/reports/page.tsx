import type { Metadata } from "next";

import { ReportsIndex } from "@/components/reports/reports-shell";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsIndex />;
}
