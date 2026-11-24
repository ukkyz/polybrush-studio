import Link from "next/link";
import NewProjectButton from "@/components/NewProjectButton";
import PreviewHero from "@/components/PreviewHero";
import { EnvBadge, Meter, MiniPlan, Stat, TopBar } from "@/components/ui";
import { ensureSeed, getAnalytics, listProjects } from "@/lib/repo";
import type { Project, ProjectAnalytics } from "@/lib/types";

export const dynamic = "force-dynamic";

function StarRating({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#c9f45b]">
      <span aria-hidden>★</span>
      {value ? value.toFixed(1) : "—"}
    </span>
  );
}

export default async function Home() {
  await ensureSeed();
  let projects: Project[] = [];
  let analytics: ProjectAnalytics[] = [];
  try {
    projects = await listProjects();
    analytics = await Promise.all(projects.map((project) => getAnalytics(project.id)));
  } catch (error) {
    console.error("dashboard load failed", error);
  }

  const featured = projects[0];
  const featuredAnalytics = analytics[0];
  const totalRuns = analytics.reduce((sum, a) => sum + a.sessions, 0);
  const totalFeedback = analytics.reduce((sum, a) => sum + a.feedbackCount, 0);
  const weightedRating = analytics.reduce((sum, a) => sum + a.avgRating * a.feedbackCount, 0);
  const avgRating = totalFeedback ? weightedRating / totalFeedback : 0;
  const completed = analytics.reduce((sum, a) => sum + a.completedSessions, 0);
  const completionRate = totalRuns ? Math.round((completed / totalRuns) * 100) : 0;

  return (
    <div className="min-h-screen">
      <TopBar>
        <Link href="#prototypes" className="hidden text-xs text-white/55 transition hover:text-white sm:block">
          Prototypes
        </Link>
        <Link href="#loop" className="hidden text-xs text-white/55 transition hover:text-white sm:block">
          Validation loop
        </Link>
        <Link href="#engine" className="hidden text-xs text-white/55 transition hover:text-white md:block">
          Engine
        </Link>
        <NewProjectButton>＋ New simulation</NewProjectButton>
      </TopBar>

      <main className="mx-auto w-full max-w-[1400px] px-5 pb-20">
        <section className="grid gap-8 pt-10 lg:grid-cols-[1.02fr_1fr] lg:items-center lg:pt-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#c9f45b]" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/55">
                PlayCanvas · 3DGS · MVP in one afternoon
              </span>
            </div>
            <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.03em] text-white sm:text-[3.4rem]">
              Walk inside your own
              <span className="relative ml-3 inline-block">
                <span className="bg-gradient-to-r from-[#c9f45b] via-[#d9ff8a] to-[#6fe3d2] bg-clip-text text-transparent">splat space.</span>
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/55">
              A rapid-prototyping studio for Gaussian splat simulation games. Drop in a captured environment, draw the
              walkable floorplan, choose a custom animated avatar, then send testers in — with session telemetry and
              feedback wired in from the first run.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {featured ? (
                <>
                  <Link href={`/play/${featured.id}`} className="btn btn-accent">
                    Play {featured.name.split("—")[0].trim()} →
                  </Link>
                  <Link href={`/studio/${featured.id}`} className="btn btn-ghost">
                    Open the studio
                  </Link>
                </>
              ) : (
                <NewProjectButton className="btn btn-accent">Create your first prototype</NewProjectButton>
              )}
            </div>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Prototypes" value={String(projects.length)} sub="splat scenes configured" />
              <Stat label="Test runs" value={String(totalRuns)} sub="sessions logged" tint="#9b8cff" />
              <Stat label="Completion" value={`${completionRate}%`} sub="scan goal reached" tint="#6fe3d2" />
              <Stat label="Rating" value={avgRating ? avgRating.toFixed(1) : "—"} sub={`${totalFeedback} feedback notes`} tint="#ffb26b" />
            </div>
          </div>

          {featured ? (
            <PreviewHero project={featured} />
          ) : (
            <div className="panel grid h-[420px] place-items-center p-8 text-center">
              <div>
                <div className="label">no prototype yet</div>
                <p className="mt-3 max-w-sm text-sm text-white/50">
                  Create a simulation to generate a walkable Gaussian splat scene from your floorplan.
                </p>
                <div className="mt-5 flex justify-center">
                  <NewProjectButton />
                </div>
              </div>
            </div>
          )}
        </section>

        <section id="prototypes" className="mt-16 scroll-mt-24">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="label">prototype shelf</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white">Runnable simulations</h2>
              <p className="mt-1 max-w-2xl text-sm text-white/45">
                Every card is a live, editable experiment: environment source, floorplan, avatar rig and validation
                criteria travel together.
              </p>
            </div>
            <NewProjectButton className="btn btn-ghost">＋ Blank prototype</NewProjectButton>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => {
              const a = analytics[index];
              const tint = project.environment.tint;
              return (
                <article key={project.id} className="panel group flex flex-col overflow-hidden">
                  <div className="relative h-[168px] overflow-hidden border-b border-white/8 bg-[#080d12]">
                    <div className="dots absolute inset-0 opacity-50" />
                    <div
                      className="absolute inset-0 opacity-70"
                      style={{ background: `radial-gradient(circle at 60% 30%, ${tint}22, transparent 62%)` }}
                    />
                    <MiniPlan plan={project.floorplan} tint={tint} className="absolute inset-0 h-full w-full p-3" />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
                      <EnvBadge kind={project.environment.kind} source={project.environment.source} />
                    </div>
                    <div className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/60">
                      {project.floorplan.orbs.length} markers
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[15px] font-semibold leading-snug text-white">{project.name}</h3>
                      <StarRating value={a?.avgRating ?? 0} />
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-white/45">{project.description}</p>

                    <div className="mt-3.5 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
                      <div>
                        <div className="text-white/70">{a?.sessions ?? 0}</div>
                        runs
                      </div>
                      <div>
                        <div className="text-white/70">{a?.completionRate ?? 0}%</div>
                        completed
                      </div>
                      <div>
                        <div className="text-white/70">{project.avatar.name}</div>
                        avatar
                      </div>
                    </div>

                    <div className="mt-3">
                      <Meter value={a?.completionRate ?? 0} tint={tint} />
                    </div>

                    <div className="mt-4 flex items-center gap-1.5">
                      <Link href={`/play/${project.id}`} className="btn btn-accent flex-1 !px-3 !py-1.5 !text-[11px]">
                        Play
                      </Link>
                      <Link href={`/studio/${project.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-[11px]">
                        Studio
                      </Link>
                      <Link href={`/insights/${project.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-[11px]">
                        Insights
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}

            <article className="flex min-h-[320px] flex-col items-start justify-center rounded-[18px] border border-dashed border-white/15 bg-white/[0.015] p-6">
              <div className="label">next experiment</div>
              <h3 className="mt-2 text-lg font-semibold text-white">Prototype another space</h3>
              <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-white/45">
                Starts from the corner-loft floorplan with a generated splat environment. Swap in your own capture, then
                re-draw the walkable area.
              </p>
              <div className="mt-4">
                <NewProjectButton />
              </div>
            </article>
          </div>
        </section>

        <section id="loop" className="mt-16 scroll-mt-24">
          <div className="label">validation loop</div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white">What this prototype is testing</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Spatial legibility",
                body: "Can a tester orient inside a splat capture using only a hand-drawn walkable polygon? Collisions and completion time are logged per run.",
                tint: "#c9f45b",
              },
              {
                step: "02",
                title: "Avatar embodiment",
                body: "Do animated poses and locomotion styles make the avatar feel present? Emote usage and camera toggles are counted automatically.",
                tint: "#9b8cff",
              },
              {
                step: "03",
                title: "Loop comprehension",
                body: "Is the scan-marker objective obvious without a tutorial? Orb pickups, timeouts and the number of collisions expose friction fast.",
                tint: "#6fe3d2",
              },
            ].map((item) => (
              <div key={item.step} className="panel p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-white/30">{item.step}</span>
                  <span className="h-2 w-2 rounded-full" style={{ background: item.tint }} />
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="engine" className="mt-16 scroll-mt-24">
          <div className="panel grid gap-6 p-6 lg:grid-cols-[1.1fr_1fr] lg:p-8">
            <div>
              <div className="label">under the hood</div>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white">
                Real gaussian splats, generated and uploaded
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/50">
                The demo environments are synthetic 3DGS PLY scenes built from your floorplan in the browser, then rendered
                by PlayCanvas&apos; native <span className="font-mono text-[12px] text-[#c9f45b]">gsplat</span> component.
                Upload your own <span className="font-mono text-[12px] text-white/70">.ply</span> or{" "}
                <span className="font-mono text-[12px] text-white/70">.sog</span> capture and it loads through the same
                renderer. Avatar rigs are procedural (walk / run / jump / wave / sit / dance / point) and can be replaced
                with a custom <span className="font-mono text-[12px] text-white/70">.glb</span>.
              </p>
              <ul className="mt-5 space-y-2 text-[12.5px] text-white/50">
                {[
                  "Walkable polygon + prop collision derived from the floorplan editor",
                  "Third-person / first-person camera, emote poses and scan interactions",
                  "Per-session telemetry posted to SQLite via Drizzle",
                  "Feedback capture and validation verdicts on every prototype",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9f45b]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="panel-soft p-4">
                <div className="label">environment</div>
                <div className="mt-2 font-mono text-[12px] text-white/70">gsplat · ply / sog</div>
                <div className="mt-1 text-[11px] text-white/35">+ equirect panorama fallback</div>
              </div>
              <div className="panel-soft p-4">
                <div className="label">renderer</div>
                <div className="mt-2 font-mono text-[12px] text-white/70">playcanvas 2.x</div>
                <div className="mt-1 text-[11px] text-white/35">WebGL2, live in the browser</div>
              </div>
              <div className="panel-soft p-4">
                <div className="label">data</div>
                <div className="mt-2 font-mono text-[12px] text-white/70">sqlite + drizzle</div>
                <div className="mt-1 text-[11px] text-white/35">projects · sessions · events · feedback</div>
              </div>
              <div className="panel-soft p-4">
                <div className="label">validation</div>
                <div className="mt-2 font-mono text-[12px] text-white/70">completion · duration</div>
                <div className="mt-1 text-[11px] text-white/35">{featuredAnalytics?.sessions ?? 0} runs on the featured prototype</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8 py-6">
        <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
          <span>Splatwalk · rapid prototype · not a production build</span>
          <span>PlayCanvas engine · Next.js · SQLite</span>
        </div>
      </footer>
    </div>
  );
}
