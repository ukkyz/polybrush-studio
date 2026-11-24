"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MiniPlan } from "@/components/ui";
import type { HudState, SimEngine, SimEventMessage, SimStatus } from "@/lib/sim/engine";
import { POSES, formatDuration, polygonBounds, type PoseId, type Project } from "@/lib/types";

const SimCanvas = dynamic(() => import("@/components/SimCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#070c11]">
      <div className="flex flex-col items-center gap-3">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#c9f45b]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">loading splat scene</span>
      </div>
    </div>
  ),
});

const FEEDBACK_TAGS = [
  "floorplan feels right",
  "navigation unclear",
  "emotes fun",
  "wanted landmarks",
  "avatar felt present",
  "too long",
  "great lighting",
];

export default function PlayClient({ project }: { project: Project }) {
  const [hud, setHud] = useState<HudState | null>(null);
  const [status, setStatus] = useState<SimStatus>("booting");
  const [detail, setDetail] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [role, setRole] = useState("playtester");
  const [submitting, setSubmitting] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const engineRef = useRef<SimEngine | null>(null);
  const sessionRef = useRef<number | null>(null);
  const queueRef = useRef<{ type: string; payload?: Record<string, unknown> }[]>([]);
  const finishedRef = useRef(false);
  const hudRef = useRef<HudState | null>(null);

  const pushEvent = useCallback((event: SimEventMessage) => {
    queueRef.current.push({ type: event.type, payload: event.payload });
    if (queueRef.current.length > 60) queueRef.current = queueRef.current.slice(-60);
  }, []);

  const flush = useCallback(async () => {
    const id = sessionRef.current;
    const batch = queueRef.current;
    if (!id || batch.length === 0) return;
    queueRef.current = [];
    try {
      await fetch(`/api/sessions/${id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, events: batch }),
      });
    } catch {
      queueRef.current = batch.concat(queueRef.current).slice(-60);
    }
  }, [project.id]);

  const finish = useCallback(
    async (reason: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const metrics = engineRef.current?.getMetrics();
      const id = sessionRef.current;
      await flush();
      if (id && metrics) {
        try {
          await fetch(`/api/sessions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...metrics, endReason: reason, finalize: true }),
          });
        } catch {
          /* keep the run usable even when telemetry fails */
        }
      }
      setFeedbackOpen(true);
    },
    [flush],
  );

  const onReady = useCallback(
    async (engine: SimEngine | null) => {
      engineRef.current = engine;
      if (!engine) return;
      try {
        const response = await fetch(`/api/projects/${project.id}/sessions`, { method: "POST" });
        const data = (await response.json()) as { session?: { id: number } };
        if (data.session?.id) {
          sessionRef.current = data.session.id;
          setSessionId(data.session.id);
        }
      } catch {
        /* analytics are best-effort in the prototype */
      }
    },
    [project.id],
  );

  const onEvent = useCallback(
    (event: SimEventMessage) => {
      pushEvent(event);
      if (event.type === "goal_complete") {
        setShowIntro(false);
        void finish("goal_complete");
      }
      if (event.type === "timeout") {
        void finish("timeout");
      }
    },
    [finish, pushEvent],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void flush();
    }, 9000);
    return () => clearInterval(interval);
  }, [flush]);

  useEffect(() => {
    engineRef.current?.setPaused(showIntro || feedbackOpen);
  }, [showIntro, feedbackOpen, hud?.status]);

  useEffect(() => {
    return () => {
      const id = sessionRef.current;
      const metrics = engineRef.current?.getMetrics();
      if (id && metrics && !finishedRef.current) {
        finishedRef.current = true;
        const payload = JSON.stringify({ ...metrics, endReason: "left_page", finalize: true });
        void fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
        if (queueRef.current.length) {
          void fetch(`/api/sessions/${id}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, events: queueRef.current }),
            keepalive: true,
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitFeedback = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, sessionId: sessionRef.current, rating, tags, comment, role }),
      });
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const onHud = useCallback((next: HudState) => {
    hudRef.current = next;
    setHud(next);
  }, []);

  const sendKey = useCallback((key: string, down: boolean) => {
    const type = down ? "keydown" : "keyup";
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }, []);

  const planBox = useMemo(() => polygonBounds(project.floorplan.polygon), [project.floorplan]);
  const collected = hud?.collected.length ?? 0;
  const total = project.floorplan.orbs.length;
  const progress = total ? Math.round((collected / total) * 100) : 0;
  const remaining = Math.max(0, (hud?.timeLimitSec ?? project.goal.timeLimitSec) - (hud?.timeSec ?? 0));

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#05080b]">
      <SimCanvas
        config={project}
        mode="play"
        configKey={`play-${project.id}-${project.updatedAt}`}
        className="absolute inset-0 h-full w-full"
        onHud={onHud}
        onEvent={onEvent}
        onStatus={(next, message) => {
          setStatus(next);
          if (message) setDetail(message);
        }}
        onReady={onReady}
      />

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 to-transparent p-3 pb-10">
        <div className="pointer-events-auto flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link href={`/studio/${project.id}`} className="rounded-full border border-white/12 bg-black/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60 backdrop-blur transition hover:text-white">
              ← studio
            </Link>
            <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">
                {project.environment.kind === "splat" ? "gaussian splat" : project.environment.kind} · {project.avatar.name}
              </div>
              <div className="text-[13px] font-semibold text-white">{project.name}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-center backdrop-blur">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">run time</div>
              <div className={`font-mono text-[15px] font-semibold ${remaining <= 0 ? "text-rose-300" : "text-[#c9f45b]"}`}>
                {formatDuration(hud?.timeSec ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/45 px-3 py-1.5 text-center backdrop-blur">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40">markers</div>
              <div className="font-mono text-[15px] font-semibold text-white">
                {collected}/{total}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void finish("manual_end")}
              className="rounded-full border border-white/12 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white"
            >
              end run
            </button>
          </div>
        </div>
      </div>

      {/* objective panel */}
      <div className="pointer-events-none absolute left-3 top-[86px] z-10 w-[248px] max-w-[calc(100vw-1.5rem)]">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/50 p-3 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#c9f45b]">objective</span>
            <span className="font-mono text-[9px] text-white/40">{progress}%</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-white">{project.goal.title}</div>
          <p className="mt-1 text-[11px] leading-relaxed text-white/45">{project.goal.brief}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#c9f45b] transition-all duration-300" style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">
            <div className="rounded border border-white/8 py-1">
              <div className="text-[12px] text-white/75">{Math.round(hud?.distance ?? 0)}m</div>
              walked
            </div>
            <div className="rounded border border-white/8 py-1">
              <div className="text-[12px] text-white/75">{hud?.collisions ?? 0}</div>
              bumps
            </div>
            <div className="rounded border border-white/8 py-1">
              <div className="text-[12px] text-white/75">{hud?.fps ?? 0}</div>
              fps
            </div>
          </div>
          {detail && (
            <div className="mt-2 rounded border border-white/8 bg-white/[0.03] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-white/40">
              {detail}
            </div>
          )}
          {sessionId && (
            <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/25">session #{sessionId} recording</div>
          )}
        </div>
      </div>

      {/* minimap */}
      <div className="pointer-events-none absolute bottom-24 right-3 z-10 hidden w-[188px] sm:block">
        <div className="pointer-events-auto rounded-xl border border-white/10 bg-black/55 p-2 backdrop-blur">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/40">floorplan</span>
            <span className="font-mono text-[9px] text-[#c9f45b]">{hud?.camera === "first" ? "FPV" : "3PV"}</span>
          </div>
          <div className="relative h-[120px] overflow-hidden rounded-lg border border-white/8 bg-[#0a1015]">
            <MiniPlan plan={project.floorplan} tint={project.environment.tint} className="absolute inset-0 h-full w-full" />
            {hud && (
              <svg viewBox={`${planBox.minX - 1.2} ${planBox.minZ - 1.2} ${planBox.width + 2.4} ${planBox.depth + 2.4}`} className="absolute inset-0 h-full w-full">
                <g transform={`translate(${hud.x} ${hud.z})`}>
                  <circle r="0.55" fill="#ffffff" opacity="0.95" />
                  <circle r="0.95" fill="#ffffff" opacity="0.16" />
                  <line
                    x1="0"
                    y1="0"
                    x2={Math.sin(hud.heading) * 1.5}
                    y2={Math.cos(hud.heading) * 1.5}
                    stroke="#6fe3d2"
                    strokeWidth="0.22"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* emote + control bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 to-transparent p-3 pt-12">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-1.5">
          {POSES.map((pose) => {
            const enabled = pose.id === "idle" || project.avatar.poses.includes(pose.id);
            const active = hud?.pose === pose.id;
            return (
              <button
                key={pose.id}
                type="button"
                disabled={!enabled}
                onClick={() => engineRef.current?.setPose(pose.id as PoseId)}
                title={pose.hint}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] backdrop-blur transition ${
                  active
                    ? "border-[#c9f45b]/70 bg-[#c9f45b]/20 text-[#e9ffb8]"
                    : enabled
                      ? "border-white/12 bg-black/45 text-white/55 hover:border-white/30 hover:text-white"
                      : "border-white/5 bg-black/30 text-white/20"
                }`}
              >
                <span className="text-[9px] opacity-60">{pose.key}</span>
                {pose.label}
              </button>
            );
          })}
          <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" />
          <button
            type="button"
            onClick={() => engineRef.current?.toggleCamera()}
            className="rounded-full border border-white/12 bg-black/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55 backdrop-blur transition hover:text-white"
          >
            C · {hud?.camera === "first" ? "first" : "third"} person
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.scan()}
            className="rounded-full border border-white/12 bg-black/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55 backdrop-blur transition hover:text-white"
          >
            E · scan
          </button>
          <button
            type="button"
            onClick={() => engineRef.current?.resetPlayer()}
            className="rounded-full border border-white/12 bg-black/45 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-white/55 backdrop-blur transition hover:text-white"
          >
            R · respawn
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-xl items-center justify-center gap-3 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
          <span>WASD move</span>
          <span className="text-white/15">·</span>
          <span>shift sprint</span>
          <span className="text-white/15">·</span>
          <span>space jump</span>
          <span className="text-white/15">·</span>
          <span>drag look</span>
          <span className="text-white/15">·</span>
          <span>{hud?.status ?? status}</span>
        </div>
      </div>

      {/* mobile controls */}
      <div className="absolute bottom-28 left-3 z-20 flex flex-col gap-1.5 sm:hidden">
        <div className="flex gap-1.5">
          <button
            type="button"
            className="h-11 w-11 rounded-lg border border-white/15 bg-black/50 font-mono text-white/70 backdrop-blur"
            onPointerDown={() => sendKey("ArrowUp", true)}
            onPointerUp={() => sendKey("ArrowUp", false)}
            onPointerLeave={() => sendKey("ArrowUp", false)}
          >
            ↑
          </button>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            className="h-11 w-11 rounded-lg border border-white/15 bg-black/50 font-mono text-white/70 backdrop-blur"
            onPointerDown={() => sendKey("ArrowLeft", true)}
            onPointerUp={() => sendKey("ArrowLeft", false)}
            onPointerLeave={() => sendKey("ArrowLeft", false)}
          >
            ←
          </button>
          <button
            type="button"
            className="h-11 w-11 rounded-lg border border-white/15 bg-black/50 font-mono text-white/70 backdrop-blur"
            onPointerDown={() => sendKey("ArrowDown", true)}
            onPointerUp={() => sendKey("ArrowDown", false)}
            onPointerLeave={() => sendKey("ArrowDown", false)}
          >
            ↓
          </button>
          <button
            type="button"
            className="h-11 w-11 rounded-lg border border-white/15 bg-black/50 font-mono text-white/70 backdrop-blur"
            onPointerDown={() => sendKey("ArrowRight", true)}
            onPointerUp={() => sendKey("ArrowRight", false)}
            onPointerLeave={() => sendKey("ArrowRight", false)}
          >
            →
          </button>
        </div>
      </div>

      {/* intro briefing */}
      {showIntro && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/55 p-5 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6">
            <div className="label">tester briefing · session start</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{project.goal.title}</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">{project.goal.brief}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
              <div className="rounded-lg border border-white/8 p-2">
                <div className="text-[13px] text-white/80">{total}</div>
                markers
              </div>
              <div className="rounded-lg border border-white/8 p-2">
                <div className="text-[13px] text-white/80">{Math.round(project.goal.timeLimitSec / 60)}:00</div>
                limit
              </div>
              <div className="rounded-lg border border-white/8 p-2">
                <div className="text-[13px] text-white/80">{project.avatar.name}</div>
                avatar
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/45">
              <span className="text-[#c9f45b]">WASD</span> to walk the walkable floorplan,{" "}
              <span className="text-white/70">drag</span> to look, <span className="text-white/70">1–5</span> for poses. Every
              pickup, collision and emote is logged for the validation report.
            </div>
            <button type="button" onClick={() => setShowIntro(false)} className="btn btn-accent mt-5 w-full">
              Start run
            </button>
          </div>
        </div>
      )}

      {/* completion banner */}
      {hud?.completed && !feedbackOpen && (
        <div className="absolute inset-x-0 top-1/3 z-20 flex justify-center px-4">
          <div className="panel flex items-center gap-4 px-5 py-3">
            <div>
              <div className="label">goal complete</div>
              <div className="text-sm font-semibold text-white">
                All {total} markers scanned in {formatDuration(hud.timeSec)}
              </div>
            </div>
            <button type="button" onClick={() => void finish("goal_complete")} className="btn btn-accent !py-1.5 !text-[11px]">
              Leave feedback →
            </button>
          </div>
        </div>
      )}

      {/* feedback modal */}
      {feedbackOpen && (
        <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
          <div className="panel w-full max-w-lg p-6">
            {submitted ? (
              <div>
                <div className="label">telemetry + feedback stored</div>
                <h2 className="mt-2 text-xl font-semibold text-white">Run archived</h2>
                <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                  {hud?.completed ? "You cleared every scan marker. " : "Partial run recorded. "}
                  {Math.round(hud?.distance ?? 0)} m walked, {hud?.collisions ?? 0} collisions, {formatDuration(hud?.timeSec ?? 0)} in
                  the space. Your notes are on the validation report.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Link href={`/insights/${project.id}`} className="btn btn-accent">
                    Open validation report →
                  </Link>
                  <button type="button" onClick={() => window.location.reload()} className="btn btn-ghost">
                    Run again
                  </button>
                  <Link href={`/studio/${project.id}`} className="btn btn-ghost">
                    Tune prototype
                  </Link>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="label">post-run feedback · 30 seconds</div>
                    <h2 className="mt-1.5 text-xl font-semibold text-white">How did the space feel?</h2>
                  </div>
                  <button type="button" onClick={() => setFeedbackOpen(false)} className="text-white/35 hover:text-white" aria-label="Close feedback">
                    ✕
                  </button>
                </div>

                <div className="mt-4 flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className={`text-2xl transition ${star <= rating ? "text-[#c9f45b]" : "text-white/15 hover:text-white/35"}`}
                      aria-label={`${star} star${star > 1 ? "s" : ""}`}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-[11px] text-white/40">{rating}/5</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {FEEDBACK_TAGS.map((tag) => {
                    const active = tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTags((prev) => (active ? prev.filter((t) => t !== tag) : [...prev, tag]))}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          active ? "border-[#c9f45b]/60 bg-[#c9f45b]/15 text-[#e9ffb8]" : "border-white/10 text-white/45 hover:border-white/25"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="What was confusing? Where did you want more detail in the splat?"
                  className="field mt-3 resize-none"
                />

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="field w-auto !py-1.5 text-[12px]">
                    <option value="playtester">Playtester</option>
                    <option value="designer">Designer</option>
                    <option value="stakeholder">Stakeholder</option>
                  </select>
                  <button type="button" onClick={() => void submitFeedback()} disabled={submitting} className="btn btn-accent disabled:opacity-60">
                    {submitting ? "Saving…" : "Submit feedback"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-black/80 p-6 text-center">
          <div>
            <div className="label">renderer unavailable</div>
            <h2 className="mt-2 text-xl font-semibold text-white">WebGL2 could not start</h2>
            <p className="mt-2 max-w-sm text-sm text-white/50">{detail || "Try a browser with hardware acceleration enabled."}</p>
            <Link href={`/studio/${project.id}`} className="btn btn-ghost mt-4">
              Back to studio
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
