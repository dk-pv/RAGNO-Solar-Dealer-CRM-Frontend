import type { Metadata } from "next";

import { PlansPage } from "@/components/settings/plans-page";

export const metadata: Metadata = { title: "Solar Plans" };

export default function Page() {
  return <PlansPage />;
}
