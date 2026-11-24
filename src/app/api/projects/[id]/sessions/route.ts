import { getProject, startSession } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(Number(id));
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  const session = await startSession(project.id, project.floorplan.orbs.length);
  return Response.json({ session }, { status: 201 });
}
