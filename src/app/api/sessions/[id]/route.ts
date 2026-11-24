import { endSession } from "@/lib/repo";

export const dynamic = "force-dynamic";

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const session = await endSession(
    Number(id),
    {
      durationSec: num(body.durationSec),
      distanceM: num(body.distanceM),
      orbsCollected: num(body.orbsCollected),
      collisions: num(body.collisions),
      emotesUsed: num(body.emotesUsed),
      cameraChanges: num(body.cameraChanges),
      completed: typeof body.completed === "boolean" ? body.completed : undefined,
      endReason: typeof body.endReason === "string" ? body.endReason : undefined,
    },
    body.finalize !== false,
  );
  if (!session) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ session });
}
