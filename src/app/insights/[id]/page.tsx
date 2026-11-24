import Link from "next/link";
import { notFound } from "next/navigation";
import { EnvBadge, Meter, MiniPlan, Stat, TopBar } from "@/components/ui";
import { ensureSeed, getAnalytics, getProject } from "@/lib/repo";
import { formatDuration } from "@/lib/types";

export const dynamic = "force-dynamic";

function relative(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Stars({ value }: { value: number }) {
  return (
    <span className="font-mono text-[11px] tracking-[0.14em] text-[#c9f45b]">
      {"★".repeat(Math.max(0, Math.round(value)))}
      <span className="text-white/15">{"★".repeat(Math.max(0, 5 - Math.round(value)))}</span>
    </span>
  );
}

export default async function InsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) notFound();
  await ensureSeed();
  const project = await getProject(numeric).catch(() => null);
  if (!project) notFound();
  const analytics = await getAnalytics(project.id);

  const completionPass = analytics.completionRate >= project.goal.targetCompletionRate;
  const durationPass = analytics.avgDurationSec > 0 && analytics.avgDurationSec <= project.goal.targetAvgDurationSec;
  const ratingPass = analytics.avgRating >= 4;
  const completedCount = analytics.completedSessions;
  const passCount = [completionPass, durationPass, ratingPass].filter(Boolean).length;
  const verdict = passCount === 3 ? "Signal confirmed" : passCount === 2 ? "Promising, one gap" : "Needs another iteration";

  const maxDuration = Math.max(1, ...analytics.recentSessions.map((s) => s.durationSec));
  const maxEvent = Math.max(1, ...analytics.events.map((e) => e.count));
  const collisionsPerRun = analytics.sessions ? analytics.recentSessions.reduce((sum, s) => sum + s.collisions, 0) / analytics.sessions : 0;
  const emotesPerRun = analytics.sessions ? analytics.totalEmotes / analytics.sessions : 0;

  const recommendations: { title: string; body: string; tint: string }[] = [];
  if (collisionsPerRun > 1.6) {
    recommendations.push({
      title: "Collision heat is high",
      body: `${collisionsPerRun.toFixed(1)} wall bumps per run. Widen clearance around props in the floorplan editor or lower the avatar speed before the next round.`,
      tint: "#ffb26b",
    });
  }
  if (emotesPerRun < 1) {
    recommendations.push({
      title: "Poses are undiscovered",
      body: `Only ${emotesPerRun.toFixed(1)} emote uses per run. Pin the pose bar on screen and add the key hints to the tester briefing.`,
      tint: "#9b8cff",
    });
  }
  const navFriction = analytics.feedback.some((f) => f.tags.some((tag) => tag.includes("navigation") || tag.includes("landmark")));
  if (navFriction) {
    recommendations.push({
      title: "Wayfinding feedback",
      body: "Testers mention navigation or missing landmarks. Try adding one scan marker per zone and re-check the minimap scale against the plan.",
      tint: "#6fe3d2",
    });
  }
  if (!durationPass && analytics.avgDurationSec > 0) {
    recommendations.push({
      title: "Runs exceed target duration",
      body: `Average run is ${formatDuration(analytics.avgDurationSec)} against a ${formatDuration(project.goal.targetAvgDurationSec)} target. Reduce markers or raise avatar speed slightly.`,
      tint: "#ff8fb8",
    });
  }
  if (recommendations.length === 0) {
    recommendations.push({
      title: "Hold the loop steady",
      body: "Metrics sit inside the success criteria. Re-run with five fresh testers to confirm the signal before adding scope.",
      tint: "#c9f45b",
    });
  }

  return (
    <div className="min-h-screen">
      <TopBar back={{ href: "/", label: "All prototypes" }}>
        <Link href={`/studio/${project.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-[11px]">
          Studio
        </Link>
        <Link href={`/play/${project.id}`} className="btn btn-accent !px-3 !py-1.5 !text-[11px]">
          Run simulation →
        </Link>
      </TopBar>

      <main className="mx-auto w-full max-w-[1400px] px-5 py-6">
        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip !border-[#c9f45b]/40 !text-[#c9f45b]">validation report</span>
              <EnvBadge kind={project.environment.kind} source={project.environment.source} />
              <span className="chip">{project.avatar.name} · {project.avatar.style}</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{project.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/50">{project.description}</p>

            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Runs" value={String(analytics.sessions)} sub={`${analytics.completedSessions} completed`} />
              <Stat label="Completion" value={`${analytics.completionRate}%`} sub={`target ${project.goal.targetCompletionRate}%`} tint={completionPass ? "#6fe3d2" : "#ffb26b"} />
              <Stat label="Avg duration" value={formatDuration(analytics.avgDurationSec)} sub={`target ${formatDuration(project.goal.targetAvgDurationSec)}`} tint={durationPass ? "#6fe3d2" : "#ff8fb8"} />
              <Stat label="Rating" value={analytics.avgRating ? analytics.avgRating.toFixed(1) : "—"} sub={`${analytics.feedbackCount} notes`} tint="#9b8cff" />
            </div>

            <div className="panel mt-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="label">hypothesis under test</div>
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{
                    background: passCount === 3 ? "rgba(201,244,91,0.14)" : passCount === 2 ? "rgba(255,178,107,0.14)" : "rgba(255,143,184,0.14)",
                    color: passCount === 3 ? "#d9ff8a" : passCount === 2 ? "#ffc58c" : "#ffb3cd",
                  }}
                >
                  {verdict}
                </span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-white/60">{project.goal.hypothesis}</p>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {[
                  { label: "completion rate", actual: `${analytics.completionRate}%`, target: `≥ ${project.goal.targetCompletionRate}%`, pass: completionPass },
                  { label: "avg duration", actual: formatDuration(analytics.avgDurationSec), target: `≤ ${formatDuration(project.goal.targetAvgDurationSec)}`, pass: durationPass },
                  { label: "avg rating", actual: analytics.avgRating ? analytics.avgRating.toFixed(1) : "—", target: "≥ 4.0", pass: ratingPass },
                ].map((row) => (
                  <div key={row.label} className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="label">{row.label}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${row.pass ? "bg-[#6fe3d2]" : "bg-[#ff8fb8]"}`} />
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-lg font-semibold text-white">{row.actual}</span>
                      <span className="font-mono text-[10px] text-white/35">{row.target}</span>
                    </div>
                    <div className="mt-1.5">
                      <Meter value={row.pass ? 100 : 45} tint={row.pass ? "#6fe3d2" : "#ff8fb8"} height={4} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel mt-4 p-5">
              <div className="flex items-center justify-between">
                <div className="label">session log</div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
                  {completedCount}/{analytics.sessions} complete
                </span>
              </div>
              {analytics.recentSessions.length === 0 ? (
                <p className="mt-3 text-sm text-white/40">No sessions yet. Run the simulation to generate telemetry.</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left">
                    <thead>
                      <tr className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
                        <th className="pb-2 font-normal">started</th>
                        <th className="pb-2 font-normal">duration</th>
                        <th className="pb-2 font-normal">walked</th>
                        <th className="pb-2 font-normal">markers</th>
                        <th className="pb-2 font-normal">bumps</th>
                        <th className="pb-2 font-normal">emotes</th>
                        <th className="pb-2 font-normal">status</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono text-[11px] text-white/60">
                      {analytics.recentSessions.map((session) => (
                        <tr key={session.id} className="border-t border-white/6">
                          <td className="py-2 text-white/40">{relative(session.startedAt)}</td>
                          <td className="py-2">{formatDuration(session.durationSec)}</td>
                          <td className="py-2">{Math.round(session.distanceM)} m</td>
                          <td className="py-2">
                            {session.orbsCollected}/{session.totalOrbs}
                          </td>
                          <td className="py-2">{session.collisions}</td>
                          <td className="py-2">{session.emotesUsed}</td>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 rounded-full ${session.completed ? "bg-[#c9f45b]" : "bg-white/25"}`} />
                              <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                                {session.completed ? "complete" : session.endReason ?? "partial"}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex h-[72px] items-end gap-1.5">
                {analytics.recentSessions
                  .slice(0, 18)
                  .reverse()
                  .map((session) => (
                    <div key={`bar-${session.id}`} className="group flex flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-sm"
                        style={{
                          height: `${Math.max(6, (session.durationSec / maxDuration) * 58)}px`,
                          background: session.completed ? "#c9f45b" : "rgba(155,140,255,0.6)",
                        }}
                        title={`${formatDuration(session.durationSec)} · ${session.completed ? "complete" : "partial"}`}
                      />
                      <span className="font-mono text-[8px] text-white/20">{session.orbsCollected}</span>
                    </div>
                  ))}
                {analytics.recentSessions.length === 0 && <span className="text-[11px] text-white/30">—</span>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="panel overflow-hidden">
              <div className="relative h-[168px] border-b border-white/8 bg-[#080d12]">
                <div className="dots absolute inset-0 opacity-40" />
                <MiniPlan plan={project.floorplan} tint={project.environment.tint} className="absolute inset-0 h-full w-full p-3" />
              </div>
              <div className="grid grid-cols-2 gap-2 p-4 font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
                <div>
                  <div className="text-[13px] text-white/80">{project.floorplan.orbs.length}</div>
                  markers
                </div>
                <div>
                  <div className="text-[13px] text-white/80">{project.avatar.poses.length + 2}</div>
                  poses
                </div>
                <div>
                  <div className="text-[13px] text-white/80">{analytics.avgOrbsCollected.toFixed(1)}</div>
                  avg collected
                </div>
                <div>
                  <div className="text-[13px] text-white/80">{analytics.avgDistanceM.toFixed(0)} m</div>
                  avg distance
                </div>
              </div>
            </div>

            <div className="panel p-5">
              <div className="label">event mix</div>
              {analytics.events.length === 0 ? (
                <p className="mt-2 text-[12px] text-white/40">No events captured yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {analytics.events.map((event) => (
                    <li key={event.type}>
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-white/40">
                        <span>{event.type.replace(/_/g, " ")}</span>
                        <span className="text-white/60">{event.count}</span>
                      </div>
                      <div className="mt-1">
                        <Meter value={(event.count / maxEvent) * 100} tint="#9b8cff" height={4} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel p-5">
              <div className="label">next iteration</div>
              <ul className="mt-3 space-y-3">
                {recommendations.map((rec) => (
                  <li key={rec.title} className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: rec.tint }} />
                      <span className="text-[12px] font-semibold text-white">{rec.title}</span>
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">{rec.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="label">tester feedback</div>
              <h2 className="mt-1 text-lg font-semibold text-white">What they told us</h2>
            </div>
            <div className="flex items-center gap-2">
              <Stars value={analytics.avgRating} />
              <span className="font-mono text-[11px] text-white/40">{analytics.feedbackCount} notes</span>
            </div>
          </div>
          {analytics.feedback.length === 0 ? (
            <div className="panel p-6 text-sm text-white/40">
              No feedback yet. Finish a run in the simulation to leave the first note.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analytics.feedback.map((entry) => (
                <article key={entry.id} className="panel p-4">
                  <div className="flex items-center justify-between">
                    <Stars value={entry.rating} />
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/30">
                      {entry.role} · {relative(entry.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/60">{entry.comment || "—"}</p>
                  {entry.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/30">
            prototype telemetry · playcanvas gsplat · sqlite
          </span>
          <div className="flex gap-2">
            <Link href={`/studio/${project.id}`} className="text-[11px] text-white/50 hover:text-white">
              Tune environment & avatar →
            </Link>
            <Link href={`/play/${project.id}`} className="text-[11px] text-[#c9f45b] hover:underline">
              Collect another session →
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
