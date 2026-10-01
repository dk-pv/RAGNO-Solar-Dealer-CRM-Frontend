import type { Metadata } from "next";

import { StaffReport } from "@/components/reports/staff-report";

export const metadata: Metadata = { title: "Staff Activity Report" };

export default function Page() {
  return <StaffReport />;
}
