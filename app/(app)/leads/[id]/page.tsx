import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadDetail } from "@/components/leads/lead-detail";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Lead #${id}` };
}

export default async function Page({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  // Lead IDs are numbers; anything else can't be a lead, and never reaches the API as a path.
  if (!/^\d+$/.test(id)) notFound();
  // The key gives each lead fresh state, so the previous lead is never shown while the next one loads.
  return <LeadDetail key={id} id={Number(id)} />;
}
