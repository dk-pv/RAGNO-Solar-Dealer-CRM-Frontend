import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkDetail } from "@/components/works/work-detail";

export async function generateMetadata({ params }: PageProps<"/works/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Work #${id}` };
}

export default async function Page({ params }: PageProps<"/works/[id]">) {
  const { id } = await params;
  // Work IDs are numbers; anything else can't be a Work, and never reaches the API as a path.
  if (!/^\d+$/.test(id)) notFound();
  // The key gives each Work fresh state, so the previous Work is never shown while the next one loads.
  return <WorkDetail key={id} id={Number(id)} />;
}
