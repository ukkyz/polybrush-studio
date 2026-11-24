import { addFeedback } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = Number(body.projectId);
  const rating = Number(body.rating);
  if (!Number.isFinite(projectId) || !Number.isFinite(rating)) {
    return Response.json({ error: "projectId_and_rating_required" }, { status: 400 });
  }
  const entry = await addFeedback({
    projectId,
    sessionId: Number.isFinite(Number(body.sessionId)) ? Number(body.sessionId) : null,
    rating,
    tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [],
    comment: typeof body.comment === "string" ? body.comment : "",
    role: typeof body.role === "string" ? body.role : "tester",
  });
  return Response.json({ feedback: entry }, { status: 201 });
}
