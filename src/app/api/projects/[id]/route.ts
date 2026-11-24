import { deleteProject, getAnalytics, getProject, updateProject } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(Number(id));
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  const analytics = await getAnalytics(project.id);
  return Response.json({ project, analytics });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const project = await updateProject(Number(id), body ?? {});
  if (!project) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ project });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteProject(Number(id));
  return Response.json({ ok: true });
}
