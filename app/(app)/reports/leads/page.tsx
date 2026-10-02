import type { Metadata } from "next";

import { LeadReport } from "@/components/reports/lead-report";

export const metadata: Metadata = { title: "Lead Report" };

export default function Page() {
  return <LeadReport />;
}
