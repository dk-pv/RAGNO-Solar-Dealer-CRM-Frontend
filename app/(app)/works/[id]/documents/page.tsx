import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WorkDocuments } from "@/components/works/work-documents";

export async function generateMetadata({ params }: PageProps<"/works/[id]/documents">): Promise<Metadata> {
  const { id } = await params;
  return { title: `Documents · Work #${id}` };
}

export default async function Page({ params }: PageProps<"/works/[id]/documents">) {
  const { id } = await params;
  // Work IDs are numbers; anything else can't be a Work, and never reaches the API as a path.
  if (!/^\d+$/.test(id)) notFound();
  // The key gives each Work fresh state, so the previous Work's documents are never shown while the next ones load.
  return <WorkDocuments key={id} id={Number(id)} />;
}
