import { createProject, ensureSeed, listProjects } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeed();
  const projects = await listProjects();
  return Response.json({ projects });
}

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const project = await createProject({
    name: typeof input.name === "string" ? input.name : undefined,
  });
  return Response.json({ project }, { status: 201 });
}
