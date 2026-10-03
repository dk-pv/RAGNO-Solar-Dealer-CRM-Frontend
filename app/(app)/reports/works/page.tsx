import type { Metadata } from "next";

import { WorkReport } from "@/components/reports/work-report";

export const metadata: Metadata = { title: "Work Report" };

export default function Page() {
  return <WorkReport />;
}
