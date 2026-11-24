import { logEvents } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: number;
    events?: { type?: unknown; payload?: unknown }[];
  };
  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId)) {
    return Response.json({ error: "projectId_required" }, { status: 400 });
  }
  const batch = Array.isArray(body.events)
    ? body.events
        .filter((e) => e && typeof e.type === "string")
        .map((e) => ({
          type: e.type as string,
          payload:
            typeof e.payload === "object" && e.payload !== null
              ? (e.payload as Record<string, unknown>)
              : {},
        }))
    : [];
  await logEvents(Number(id), projectId, batch);
  return Response.json({ ok: true, accepted: batch.length });
}
