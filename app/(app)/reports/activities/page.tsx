import type { Metadata } from "next";

import { ActivityReport } from "@/components/reports/activity-report";

export const metadata: Metadata = { title: "Activity Report" };

export default function Page() {
  return <ActivityReport />;
}
