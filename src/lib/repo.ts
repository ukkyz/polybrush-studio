import { db } from "@/db";
import { events, feedback, projects, sessions } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import {
  defaultAvatar,
  defaultEnvironment,
  defaultGoal,
  presetPlan,
  slugify,
  type FeedbackEntry,
  type Project,
  type ProjectAnalytics,
  type ProjectConfig,
  type SessionSummary,
} from "@/lib/types";

type ProjectRow = typeof projects.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type FeedbackRow = typeof feedback.$inferSelect;

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    environment: row.environment,
    floorplan: row.floorplan,
    avatar: row.avatar,
    goal: row.goal,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeSession(row: SessionRow): SessionSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    durationSec: row.durationSec,
    distanceM: row.distanceM,
    orbsCollected: row.orbsCollected,
    totalOrbs: row.totalOrbs,
    collisions: row.collisions,
    emotesUsed: row.emotesUsed,
    cameraChanges: row.cameraChanges,
    completed: row.completed,
    endReason: row.endReason,
  };
}

function serializeFeedback(row: FeedbackRow): FeedbackEntry {
  return {
    id: row.id,
    projectId: row.projectId,
    sessionId: row.sessionId,
    rating: row.rating,
    tags: row.tags,
    comment: row.comment,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}

export function starterConfig(name: "loft" | "gallery" | "atrium", index = 0): ProjectConfig {
  const plan = presetPlan(name);
  const environment = defaultEnvironment();
  environment.preset = name;
  environment.tint = ["#c9f45b", "#9b8cff", "#6fe3d2"][index % 3];
  const avatar = defaultAvatar();
  avatar.bodyColor = ["#d7ff5f", "#bfb1ff", "#8ff0df"][index % 3];
  avatar.name = ["Kite", "Nova", "Orbit"][index % 3];
  return {
    name: name === "loft" ? "Corner Loft — Scan 04" : name === "gallery" ? "Gallery Wing B" : "Atrium Deck",
    description:
      name === "loft"
        ? "A captured studio corner used to test whether testers can navigate an uploaded splat space with a floorplan-only walkable area."
        : name === "gallery"
          ? "Long exhibit hall prototype for testing pose/emote discoverability and path clarity."
          : "Open deck prototype for measuring orientation speed and completion rate in wide spaces.",
    environment,
    floorplan: plan,
    avatar,
    goal: defaultGoal(plan.orbs.length),
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  return rows.map(serializeProject);
}

export async function getProject(id: number): Promise<Project | null> {
  const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return rows.length ? serializeProject(rows[0]) : null;
}

export async function createProject(input?: Partial<ProjectConfig>): Promise<Project> {
  const base = starterConfig("loft", Math.floor(Math.random() * 3));
  const config: ProjectConfig = {
    name: input?.name?.trim() || "Untitled simulation",
    description: input?.description ?? base.description,
    environment: input?.environment ?? base.environment,
    floorplan: input?.floorplan ?? base.floorplan,
    avatar: input?.avatar ?? base.avatar,
    goal: input?.goal ?? base.goal,
  };
  const slug = `${slugify(config.name)}`;
  const rows = await db
    .insert(projects)
    .values({
      slug: `${slug}-${Date.now().toString(36)}`,
      name: config.name,
      description: config.description,
      environment: config.environment,
      floorplan: config.floorplan,
      avatar: config.avatar,
      goal: config.goal,
    })
    .returning();
  return serializeProject(rows[0]);
}

export async function updateProject(id: number, input: Partial<ProjectConfig>): Promise<Project | null> {
  const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
  if (typeof input.description === "string") patch.description = input.description;
  if (input.environment) patch.environment = input.environment;
  if (input.floorplan) patch.floorplan = input.floorplan;
  if (input.avatar) patch.avatar = input.avatar;
  if (input.goal) patch.goal = input.goal;
  const rows = await db.update(projects).set(patch).where(eq(projects.id, id)).returning();
  return rows.length ? serializeProject(rows[0]) : null;
}

export async function deleteProject(id: number): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}

export async function startSession(projectId: number, totalOrbs: number) {
  const rows = await db.insert(sessions).values({ projectId, totalOrbs }).returning();
  return serializeSession(rows[0]);
}

export async function endSession(
  id: number,
  patch: Partial<{
    durationSec: number;
    distanceM: number;
    orbsCollected: number;
    collisions: number;
    emotesUsed: number;
    cameraChanges: number;
    completed: boolean;
    endReason: string;
  }>,
  finalize = true,
): Promise<SessionSummary | null> {
  const rows = await db
    .update(sessions)
    .set({
      durationSec: patch.durationSec ?? 0,
      distanceM: patch.distanceM ?? 0,
      orbsCollected: patch.orbsCollected ?? 0,
      collisions: patch.collisions ?? 0,
      emotesUsed: patch.emotesUsed ?? 0,
      cameraChanges: patch.cameraChanges ?? 0,
      completed: patch.completed ?? false,
      endReason: patch.endReason ?? null,
      ...(finalize ? { endedAt: new Date() } : {}),
    })
    .where(eq(sessions.id, id))
    .returning();
  return rows.length ? serializeSession(rows[0]) : null;
}

export async function logEvents(
  sessionId: number,
  projectId: number,
  batch: { type: string; payload?: Record<string, unknown> }[],
) {
  if (!batch.length) return;
  await db.insert(events).values(
    batch.slice(0, 60).map((e) => ({
      sessionId,
      projectId,
      type: String(e.type).slice(0, 64),
      payload: e.payload ?? {},
    })),
  );
}

export async function addFeedback(input: {
  projectId: number;
  sessionId: number | null;
  rating: number;
  tags: string[];
  comment: string;
  role: string;
}): Promise<FeedbackEntry> {
  const rows = await db
    .insert(feedback)
    .values({
      projectId: input.projectId,
      sessionId: input.sessionId,
      rating: Math.min(5, Math.max(1, Math.round(input.rating))),
      tags: input.tags.slice(0, 8),
      comment: input.comment.slice(0, 1200),
      role: input.role.slice(0, 40) || "tester",
    })
    .returning();
  return serializeFeedback(rows[0]);
}

export async function getAnalytics(projectId: number): Promise<ProjectAnalytics> {
  const [sessionRows, feedbackRows, eventRows] = await Promise.all([
    db.select().from(sessions).where(eq(sessions.projectId, projectId)).orderBy(desc(sessions.startedAt)),
    db.select().from(feedback).where(eq(feedback.projectId, projectId)).orderBy(desc(feedback.createdAt)),
    db.select().from(events).where(eq(events.projectId, projectId)).limit(4000),
  ]);

  const recent = sessionRows.map(serializeSession);
  const completed = recent.filter((s) => s.completed);
  const finished = recent.filter((s) => s.endedAt);
  const withDuration = finished.length ? finished : recent;
  const avgDuration = withDuration.length
    ? withDuration.reduce((sum, s) => sum + s.durationSec, 0) / withDuration.length
    : 0;
  const avgDistance = recent.length ? recent.reduce((sum, s) => sum + s.distanceM, 0) / recent.length : 0;
  const avgOrbs = recent.length ? recent.reduce((sum, s) => sum + s.orbsCollected, 0) / recent.length : 0;
  const avgRating = feedbackRows.length
    ? feedbackRows.reduce((sum, f) => sum + f.rating, 0) / feedbackRows.length
    : 0;

  const eventCounts = new Map<string, number>();
  for (const row of eventRows) {
    eventCounts.set(row.type, (eventCounts.get(row.type) ?? 0) + 1);
  }

  return {
    sessions: recent.length,
    completedSessions: completed.length,
    completionRate: recent.length ? Math.round((completed.length / recent.length) * 100) : 0,
    avgDurationSec: Math.round(avgDuration),
    avgDistanceM: Math.round(avgDistance * 10) / 10,
    totalEmotes: recent.reduce((sum, s) => sum + s.emotesUsed, 0),
    feedbackCount: feedbackRows.length,
    avgRating: Math.round(avgRating * 10) / 10,
    avgOrbsCollected: Math.round(avgOrbs * 10) / 10,
    events: [...eventCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    recentSessions: recent.slice(0, 12),
    feedback: feedbackRows.map(serializeFeedback),
  };
}

/**
 * Seeds two runnable demo prototypes plus a little synthetic validation history so
 * the analytics surfaces have something meaningful to show on first load.
 */
export async function ensureSeed(): Promise<void> {
  try {
    const existing = await db.select({ id: projects.id }).from(projects).limit(1);
    if (existing.length > 0) return;

    const demos: { cfg: ProjectConfig; sessions: { duration: number; distance: number; orbs: number; completed: boolean; emotes: number; }[]; feedback: { rating: number; tags: string[]; comment: string; role: string }[] }[] = [
      {
        cfg: starterConfig("loft", 0),
        sessions: [
          { duration: 96, distance: 63.4, orbs: 5, completed: true, emotes: 3 },
          { duration: 124, distance: 81.2, orbs: 4, completed: false, emotes: 1 },
          { duration: 78, distance: 55.6, orbs: 5, completed: true, emotes: 4 },
          { duration: 152, distance: 92.8, orbs: 3, completed: false, emotes: 2 },
          { duration: 88, distance: 61.1, orbs: 5, completed: true, emotes: 5 },
        ],
        feedback: [
          {
            rating: 5,
            tags: ["floorplan feels right", "emotes fun"],
            comment: "Spatial scale felt believable. I never clipped through a wall and the orb trail pulled me through the whole loft.",
            role: "playtester",
          },
          {
            rating: 4,
            tags: ["wanted landmarks"],
            comment: "Wanted a bit more visual detail in the corner behind the column. Walk speed is good.",
            role: "playtester",
          },
          {
            rating: 4,
            tags: ["emote discoverability"],
            comment: "Found the emote keys through the bar, not the legend. Maybe surface numbers on the buttons.",
            role: "designer",
          },
        ],
      },
      {
        cfg: starterConfig("gallery", 1),
        sessions: [
          { duration: 142, distance: 118.2, orbs: 5, completed: true, emotes: 2 },
          { duration: 166, distance: 124.5, orbs: 4, completed: false, emotes: 0 },
          { duration: 118, distance: 96.1, orbs: 5, completed: true, emotes: 3 },
        ],
        feedback: [
          {
            rating: 3,
            tags: ["navigation unclear", "too long"],
            comment: "The long hall made it hard to tell which end I had already scanned.",
            role: "playtester",
          },
          {
            rating: 5,
            tags: ["great lighting"],
            comment: "Plinth lighting carried the depth cues. Would love to swap in my own splat.",
            role: "designer",
          },
        ],
      },
    ];

    for (const demo of demos) {
      const slug = slugify(demo.cfg.name);
      const inserted = await db
        .insert(projects)
        .values({
          slug,
          name: demo.cfg.name,
          description: demo.cfg.description,
          environment: demo.cfg.environment,
          floorplan: demo.cfg.floorplan,
          avatar: demo.cfg.avatar,
          goal: demo.cfg.goal,
        })
        .onConflictDoNothing()
        .returning();

      if (!inserted.length) continue;
      const projectId = inserted[0].id;

      for (let index = 0; index < demo.sessions.length; index += 1) {
        const s = demo.sessions[index];
        const startedAt = new Date(Date.now() - (index + 1) * 26 * 60 * 60 * 1000);
        const rows = await db
          .insert(sessions)
          .values({
            projectId,
            startedAt,
            endedAt: new Date(startedAt.getTime() + s.duration * 1000),
            durationSec: s.duration,
            distanceM: s.distance,
            orbsCollected: s.orbs,
            totalOrbs: demo.cfg.floorplan.orbs.length,
            collisions: index + 1,
            emotesUsed: s.emotes,
            cameraChanges: 2,
            completed: s.completed,
            endReason: s.completed ? "goal_complete" : "timeout",
          })
          .returning();

        await db.insert(events).values([
          { sessionId: rows[0].id, projectId, type: "session_start", payload: { source: "seed" } },
          { sessionId: rows[0].id, projectId, type: "splat_ready", payload: { splats: 16800 } },
          { sessionId: rows[0].id, projectId, type: "emote", payload: { pose: "wave" } },
          { sessionId: rows[0].id, projectId, type: s.completed ? "goal_complete" : "session_end", payload: { orbs: s.orbs } },
        ]);
      }

      if (demo.feedback.length) {
        await db.insert(feedback).values(
          demo.feedback.map((f, index) => ({
            projectId,
            rating: f.rating,
            tags: f.tags,
            comment: f.comment,
            role: f.role,
            createdAt: new Date(Date.now() - (index + 1) * 20 * 60 * 60 * 1000),
          })),
        );
      }
    }
  } catch (error) {
    console.error("seed failed", error);
  }
}
