import type { Metadata } from "next";

import { WorkPipeline } from "@/components/works/work-pipeline";

export const metadata: Metadata = { title: "Work Pipeline" };

export default function Page() {
  return <WorkPipeline />;
}
