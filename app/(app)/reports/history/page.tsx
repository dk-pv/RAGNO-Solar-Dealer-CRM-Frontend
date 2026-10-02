import type { Metadata } from "next";

import { HistoryReport } from "@/components/reports/history-report";

export const metadata: Metadata = { title: "CRM History" };

export default function Page() {
  return <HistoryReport />;
}
