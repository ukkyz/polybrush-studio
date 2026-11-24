import { notFound } from "next/navigation";
import StudioClient from "@/components/StudioClient";
import { getProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) notFound();
  const project = await getProject(numeric).catch(() => null);
  if (!project) notFound();
  return <StudioClient project={project} />;
}
