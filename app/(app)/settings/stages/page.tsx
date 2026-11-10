import type { Metadata } from "next";

import { StagesPage } from "@/components/settings/stages-page";

export const metadata: Metadata = { title: "Pipeline Stages" };

export default function Page() {
  return <StagesPage />;
}
