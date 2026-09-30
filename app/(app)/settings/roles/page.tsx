import type { Metadata } from "next";

import { RolesPage } from "@/components/settings/roles-page";

export const metadata: Metadata = { title: "Roles & Access" };

export default function Page() {
  return <RolesPage />;
}
