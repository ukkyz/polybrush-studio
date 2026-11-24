"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import FloorplanEditor from "@/components/FloorplanEditor";
import { TopBar } from "@/components/ui";
import type { SimEventMessage, SimStatus } from "@/lib/sim/engine";
import {
  ACCENT_COLORS,
  BODY_COLORS,
  EMOTE_POSES,
  FLOORPLAN_PRESETS,
  POSES,
  VISOR_COLORS,
  presetPlan,
  type AvatarConfig,
  type EnvironmentConfig,
  type FloorPlan,
  type GoalConfig,
  type Project,
  type ProjectConfig,
  type SplatQuality,
} from "@/lib/types";

const SimCanvas = dynamic(() => import("@/components/SimCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#070c11]">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">building scene…</span>
    </div>
  ),
});

type Tab = "environment" | "floorplan" | "avatar" | "plan";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "environment", label: "Environment", icon: "◍" },
  { id: "floorplan", label: "Floorplan", icon: "⬡" },
  { id: "avatar", label: "Avatar", icon: "⌬" },
  { id: "plan", label: "Test plan", icon: "⌁" },
];

function swatchRow(
  colors: string[],
  value: string,
  onSelect: (color: string) => void,
) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          className="swatch"
          data-active={value.toLowerCase() === color.toLowerCase()}
          style={{ background: color }}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="font-mono text-[11px] text-white/70">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function StudioClient({ project }: { project: Project }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("environment");
  const [config, setConfig] = useState<ProjectConfig>({
    name: project.name,
    description: project.description,
    environment: project.environment,
    floorplan: project.floorplan,
    avatar: project.avatar,
    goal: project.goal,
  });
  const [previewConfig, setPreviewConfig] = useState<ProjectConfig>(config);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState<SimStatus>("booting");
  const [statusDetail, setStatusDetail] = useState("");
  const [telemetry, setTelemetry] = useState<string[]>([]);
  const dirty = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setPreviewConfig(config), 650);
    return () => clearTimeout(timer);
  }, [config]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const previewKey = useMemo(() => `studio-${project.id}-${JSON.stringify(previewConfig)}`, [previewConfig, project.id]);

  const updateEnv = (patch: Partial<EnvironmentConfig>) => {
    dirty.current = true;
    setConfig((prev) => ({ ...prev, environment: { ...prev.environment, ...patch } }));
  };
  const updateAvatar = (patch: Partial<AvatarConfig>) => {
    dirty.current = true;
    setConfig((prev) => ({ ...prev, avatar: { ...prev.avatar, ...patch } }));
  };
  const updateGoal = (patch: Partial<GoalConfig>) => {
    dirty.current = true;
    setConfig((prev) => ({ ...prev, goal: { ...prev.goal, ...patch } }));
  };
  const updatePlan = (floorplan: FloorPlan) => {
    dirty.current = true;
    setConfig((prev) => ({ ...prev, floorplan, goal: { ...prev.goal, brief: `${prev.goal.brief.split(". ")[0]}. Collect all ${floorplan.orbs.length} scan markers.` } }));
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error("save failed");
      dirty.current = false;
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      router.refresh();
      return true;
    } catch {
      setStatusDetail("Could not save — check the database connection.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File, target: "environment" | "avatar") => {
    setUploading(target);
    setStatusDetail("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await response.json()) as { url?: string; filename?: string; format?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      if (target === "environment") {
        if (data.format === "panorama") {
          updateEnv({ kind: "panorama", source: "upload", url: data.url, filename: data.filename ?? file.name });
        } else {
          updateEnv({ kind: "splat", source: "upload", url: data.url, filename: data.filename ?? file.name });
        }
      } else {
        updateAvatar({ modelUrl: data.url, modelName: data.filename ?? file.name });
      }
      setStatusDetail(`${file.name} uploaded (${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
    } catch (error) {
      setStatusDetail(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const onSimEvent = (event: SimEventMessage) => {
    setTelemetry((prev) => [`${new Date().toLocaleTimeString([], { hour12: false })} · ${event.type}`, ...prev].slice(0, 6));
  };

  const remove = async () => {
    if (!window.confirm("Delete this prototype and its session history?")) return;
    await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    router.push("/");
  };

  const boundsNote = `${config.floorplan.orbs.length} markers · ${config.floorplan.obstacles.length} props`;

  return (
    <div className="min-h-screen">
      <TopBar back={{ href: "/", label: "All prototypes" }}>
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-white/35 sm:block">
          {savedAt ? `saved ${savedAt}` : "not saved yet"}
        </span>
        <Link href={`/insights/${project.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-[11px]">
          Insights
        </Link>
        <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-ghost !px-3 !py-1.5 !text-[11px] disabled:opacity-50">
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={async () => {
            const ok = await save();
            if (ok) router.push(`/play/${project.id}`);
          }}
          className="btn btn-accent !px-3.5 !py-1.5 !text-[11px]"
        >
          Play simulation →
        </button>
      </TopBar>

      <main className="mx-auto grid w-full max-w-[1500px] gap-4 px-4 py-5 lg:grid-cols-[400px_1fr] xl:grid-cols-[430px_1fr]">
        {/* ---------------------------------------------------------------- */}
        <section className="panel flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden lg:sticky lg:top-[4.75rem]">
          <div className="border-b border-white/8 p-4">
            <div className="label">prototype builder</div>
            <input
              value={config.name}
              onChange={(e) => {
                dirty.current = true;
                setConfig((prev) => ({ ...prev, name: e.target.value }));
              }}
              className="mt-2 w-full border-none bg-transparent text-lg font-semibold tracking-tight text-white outline-none"
            />
            <textarea
              value={config.description}
              onChange={(e) => {
                dirty.current = true;
                setConfig((prev) => ({ ...prev, description: e.target.value }));
              }}
              rows={2}
              className="mt-1 w-full resize-none border-none bg-transparent text-[12px] leading-relaxed text-white/45 outline-none"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 border-b border-white/8 p-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition ${
                  tab === item.id ? "bg-white/[0.08] text-white" : "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
                }`}
              >
                <span className="text-[13px] text-[#c9f45b]">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === "environment" && (
              <div className="space-y-5">
                <div>
                  <div className="label mb-2">environment source</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "splat", label: "Splat" },
                      { id: "panorama", label: "Panorama" },
                      { id: "mesh", label: "Mesh" },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => updateEnv({ kind: option.id as EnvironmentConfig["kind"] })}
                        className={`rounded-lg border px-2 py-2 text-[11px] transition ${
                          config.environment.kind === option.id
                            ? "border-[#c9f45b]/60 bg-[#c9f45b]/10 text-[#e6ffb0]"
                            : "border-white/10 text-white/50 hover:border-white/25"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {config.environment.kind === "splat" && (
                  <>
                    <div>
                      <div className="label mb-2">demo preset</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(FLOORPLAN_PRESETS).map(([key, value]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              updateEnv({ source: "generated", preset: key as EnvironmentConfig["preset"], url: null, filename: null })
                            }
                            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                              config.environment.source === "generated" && config.environment.preset === key
                                ? "border-[#c9f45b]/60 bg-[#c9f45b]/10 text-[#e6ffb0]"
                                : "border-white/10 text-white/50 hover:border-white/25"
                            }`}
                            title={value.note}
                          >
                            {value.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel-soft p-3">
                      <div className="label">capture upload</div>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                        PlayCanvas parses <span className="font-mono text-white/60">.ply</span> and{" "}
                        <span className="font-mono text-white/60">.sog</span> natively. A capture replaces the generated
                        environment; the walkable floorplan stays your collision source.
                      </p>
                      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-white/55 transition hover:border-[#c9f45b]/50">
                        <span>{uploading === "environment" ? "Uploading…" : config.environment.source === "upload" ? config.environment.filename ?? "Capture attached" : "Choose .ply / .sog"}</span>
                        <span className="font-mono text-[10px] text-[#c9f45b]">BROWSE</span>
                        <input
                          type="file"
                          accept=".ply,.sog,.splat,.ksplat,.spz,.lcc2"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(file, "environment");
                          }}
                        />
                      </label>
                      {config.environment.source === "upload" && (
                        <button
                          type="button"
                          onClick={() => updateEnv({ source: "generated", url: null, filename: null })}
                          className="mt-2 text-[10px] text-white/35 underline decoration-white/20 underline-offset-2 hover:text-white/70"
                        >
                          back to generated gaussians
                        </button>
                      )}
                    </div>
                  </>
                )}

                {config.environment.kind === "panorama" && (
                  <div className="panel-soft p-3">
                    <div className="label">equirectangular panorama</div>
                    <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                      Upload a 360° image (2:1) to wrap the walkable shell in a captured backdrop.
                    </p>
                    <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-white/55 hover:border-[#c9f45b]/50">
                      <span>{uploading === "environment" ? "Uploading…" : config.environment.filename ?? "Choose image"}</span>
                      <span className="font-mono text-[10px] text-[#c9f45b]">BROWSE</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(file, "environment");
                        }}
                      />
                    </label>
                  </div>
                )}

                <div className="panel-soft p-3">
                  <div className="label">render detail</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                    Higher settings render at more pixels and request finer capture LODs where available. This can use more GPU memory and reduce frame rate.
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {([
                      ["balanced", "Balanced"],
                      ["high", "High"],
                      ["maximum", "Maximum"],
                    ] as [SplatQuality, string][]).map(([quality, label]) => (
                      <button
                        key={quality}
                        type="button"
                        aria-pressed={(config.environment.splatQuality ?? "balanced") === quality}
                        onClick={() => updateEnv({ splatQuality: quality })}
                        className={`rounded-lg border px-2 py-2 text-[11px] transition ${(config.environment.splatQuality ?? "balanced") === quality ? "border-[#c9f45b]/60 bg-[#c9f45b]/10 text-[#e6ffb0]" : "border-white/10 text-white/50 hover:border-white/25"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <SliderRow
                  label="splat scale"
                  value={config.environment.splatScale}
                  min={0.2}
                  max={3}
                  step={0.05}
                  onChange={(value) => updateEnv({ splatScale: value })}
                  format={(v) => `${v.toFixed(2)}×`}
                />
                <SliderRow
                  label="splat yaw"
                  value={config.environment.splatYaw}
                  min={-180}
                  max={180}
                  step={5}
                  onChange={(value) => updateEnv({ splatYaw: value })}
                  format={(v) => `${v}°`}
                />
                <SliderRow
                  label="splat pitch"
                  value={config.environment.splatPitch ?? 0}
                  min={-180}
                  max={180}
                  step={5}
                  onChange={(value) => updateEnv({ splatPitch: value })}
                  format={(v) => `${v}°`}
                />
                <SliderRow
                  label="splat roll"
                  value={config.environment.splatRoll ?? 0}
                  min={-180}
                  max={180}
                  step={5}
                  onChange={(value) => updateEnv({ splatRoll: value })}
                  format={(v) => `${v}°`}
                />
                <SliderRow
                  label="splat height"
                  value={config.environment.splatY}
                  min={-3}
                  max={3}
                  step={0.1}
                  onChange={(value) => updateEnv({ splatY: value })}
                  format={(v) => `${v.toFixed(1)} m`}
                />
                <SliderRow
                  label="ambient light"
                  value={config.environment.ambient}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => updateEnv({ ambient: value })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <div>
                  <div className="label mb-2">accent / splat tint</div>
                  {swatchRow(BODY_COLORS, config.environment.tint, (tint) => updateEnv({ tint }))}
                </div>
                <div>
                  <div className="label mb-2">sky / clear colour</div>
                  {swatchRow(ACCENT_COLORS, config.environment.skyColor, (skyColor) => updateEnv({ skyColor }))}
                </div>
                <label className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2">
                  <span className="text-[11px] text-white/60">Show walkable shell</span>
                  <input
                    type="checkbox"
                    checked={config.environment.showShell}
                    onChange={(e) => updateEnv({ showShell: e.target.checked })}
                    className="h-4 w-4 accent-[#c9f45b]"
                  />
                </label>
              </div>
            )}

            {tab === "floorplan" && (
              <div className="space-y-4">
                <div>
                  <div className="label mb-2">start from a layout</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(FLOORPLAN_PRESETS).map(([key, value]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          updatePlan(presetPlan(key as EnvironmentConfig["preset"]));
                          updateEnv({ preset: key as EnvironmentConfig["preset"], source: "generated" });
                        }}
                        className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/55 transition hover:border-[#c9f45b]/60 hover:text-white"
                      >
                        {value.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="panel-soft p-3">
                  <div className="label">markers</div>
                  <ul className="mt-2 space-y-1">
                    {config.floorplan.orbs.map((orb, index) => (
                      <li key={orb.id} className="flex items-center justify-between font-mono text-[11px] text-white/60">
                        <span>
                          <span className="text-[#c9f45b]">{String(index + 1).padStart(2, "0")}</span> {orb.label}
                        </span>
                        <span className="text-white/30">
                          {orb.x.toFixed(1)}, {orb.z.toFixed(1)}
                        </span>
                      </li>
                    ))}
                    {config.floorplan.orbs.length === 0 && <li className="text-[11px] text-white/35">No markers yet — use “+ Marker”.</li>}
                  </ul>
                </div>
                <SliderRow
                  label="spawn heading"
                  value={config.floorplan.spawnHeading}
                  min={-180}
                  max={180}
                  step={5}
                  onChange={(spawnHeading) => updatePlan({ ...config.floorplan, spawnHeading })}
                  format={(v) => `${v}°`}
                />
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/40">
                  Collision uses this polygon plus any prop rectangles. Keep at least 0.6 m of clearance around obstacles
                  so the avatar capsule never wedges.
                </div>
              </div>
            )}

            {tab === "avatar" && (
              <div className="space-y-5">
                <label className="block">
                  <span className="label">avatar name</span>
                  <input
                    value={config.avatar.name}
                    onChange={(e) => updateAvatar({ name: e.target.value })}
                    className="field mt-1.5"
                  />
                </label>
                <div>
                  <div className="label mb-2">rig style</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "walker", label: "Walker" },
                      { id: "scout", label: "Scout" },
                      { id: "orb", label: "Orb" },
                    ].map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => updateAvatar({ style: style.id as AvatarConfig["style"] })}
                        className={`rounded-lg border px-2 py-2 text-[11px] transition ${
                          config.avatar.style === style.id
                            ? "border-[#c9f45b]/60 bg-[#c9f45b]/10 text-[#e6ffb0]"
                            : "border-white/10 text-white/50 hover:border-white/25"
                        }`}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="label mb-2">body colour</div>
                  {swatchRow(BODY_COLORS, config.avatar.bodyColor, (bodyColor) => updateAvatar({ bodyColor }))}
                </div>
                <div>
                  <div className="label mb-2">joint / trim colour</div>
                  {swatchRow(ACCENT_COLORS, config.avatar.accentColor, (accentColor) => updateAvatar({ accentColor }))}
                </div>
                <div>
                  <div className="label mb-2">visor glow</div>
                  {swatchRow(VISOR_COLORS, config.avatar.visorColor, (visorColor) => updateAvatar({ visorColor }))}
                </div>
                <SliderRow
                  label="scale"
                  value={config.avatar.scale}
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  onChange={(scale) => updateAvatar({ scale })}
                  format={(v) => `${v.toFixed(2)}×`}
                />
                <SliderRow
                  label="move speed"
                  value={config.avatar.speed}
                  min={1.5}
                  max={7}
                  step={0.1}
                  onChange={(speed) => updateAvatar({ speed })}
                  format={(v) => `${v.toFixed(1)} m/s`}
                />
                <SliderRow
                  label="stride length"
                  value={config.avatar.stride}
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  onChange={(stride) => updateAvatar({ stride })}
                  format={(v) => `${v.toFixed(2)}×`}
                />

                <div>
                  <div className="label mb-2">available poses</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {POSES.filter((pose) => pose.id !== "idle").map((pose) => {
                      const enabled = config.avatar.poses.includes(pose.id);
                      return (
                        <button
                          key={pose.id}
                          type="button"
                          onClick={() =>
                            updateAvatar({
                              poses: enabled
                                ? config.avatar.poses.filter((p) => p !== pose.id)
                                : [...config.avatar.poses, pose.id],
                            })
                          }
                          className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] transition ${
                            enabled ? "border-[#c9f45b]/50 bg-[#c9f45b]/10 text-[#e6ffb0]" : "border-white/10 text-white/40"
                          }`}
                        >
                          <span>{pose.label}</span>
                          <span className="font-mono text-[10px] opacity-60">{pose.key}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                    Poses drive the procedural rig (walk / run / jump are automatic). Sitting and dancing loop until you
                    move again.
                  </p>
                </div>

                <div className="panel-soft p-3">
                  <div className="label">custom .glb avatar</div>
                  <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-white/55 hover:border-[#c9f45b]/50">
                    <span>{uploading === "avatar" ? "Uploading…" : config.avatar.modelName ?? "Choose .glb"}</span>
                    <span className="font-mono text-[10px] text-[#c9f45b]">BROWSE</span>
                    <input
                      type="file"
                      accept=".glb"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file, "avatar");
                      }}
                    />
                  </label>
                  {config.avatar.modelUrl && (
                    <button
                      type="button"
                      onClick={() => updateAvatar({ modelUrl: null, modelName: null })}
                      className="mt-2 text-[10px] text-white/35 underline underline-offset-2 hover:text-white/70"
                    >
                      remove model · use procedural rig
                    </button>
                  )}
                </div>
              </div>
            )}

            {tab === "plan" && (
              <div className="space-y-4">
                <label className="block">
                  <span className="label">objective title</span>
                  <input value={config.goal.title} onChange={(e) => updateGoal({ title: e.target.value })} className="field mt-1.5" />
                </label>
                <label className="block">
                  <span className="label">tester brief</span>
                  <textarea
                    value={config.goal.brief}
                    onChange={(e) => updateGoal({ brief: e.target.value })}
                    rows={3}
                    className="field mt-1.5 resize-none"
                  />
                </label>
                <label className="block">
                  <span className="label">hypothesis</span>
                  <textarea
                    value={config.goal.hypothesis}
                    onChange={(e) => updateGoal({ hypothesis: e.target.value })}
                    rows={3}
                    className="field mt-1.5 resize-none"
                  />
                </label>
                <SliderRow
                  label="time limit"
                  value={config.goal.timeLimitSec}
                  min={45}
                  max={420}
                  step={15}
                  onChange={(timeLimitSec) => updateGoal({ timeLimitSec })}
                  format={(v) => `${Math.round(v / 60)} min`}
                />
                <SliderRow
                  label="target completion"
                  value={config.goal.targetCompletionRate}
                  min={20}
                  max={100}
                  step={5}
                  onChange={(targetCompletionRate) => updateGoal({ targetCompletionRate })}
                  format={(v) => `${v}%`}
                />
                <SliderRow
                  label="target duration"
                  value={config.goal.targetAvgDurationSec}
                  min={30}
                  max={300}
                  step={10}
                  onChange={(targetAvgDurationSec) => updateGoal({ targetAvgDurationSec })}
                  format={(v) => `${v}s`}
                />
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-white/40">
                  Success criteria are compared against real session telemetry on the insights page. Everything above is
                  stored with the prototype.
                </div>
                <button type="button" onClick={() => void remove()} className="text-[11px] text-rose-300/70 underline underline-offset-2 hover:text-rose-200">
                  Delete prototype
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-white/8 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
            {boundsNote} · {config.environment.kind}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="min-w-0 space-y-4">
          <div className="panel overflow-hidden p-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1">
              <div className="flex items-center gap-2">
                <span className="label">live preview</span>
                <span className="chip !text-[9px]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: config.environment.tint }} />
                  {status}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-white/35">
                <span>{config.avatar.name}</span>
                <span>·</span>
                <span>{config.avatar.poses.length + 2} poses</span>
                <span>·</span>
                <span>{config.floorplan.orbs.length} markers</span>
              </div>
            </div>
            <div className="relative h-[300px] overflow-hidden rounded-xl border border-white/8 bg-[#070c11] sm:h-[400px] lg:h-[440px]">
              <SimCanvas
                config={previewConfig}
                mode="preview"
                configKey={previewKey}
                onStatus={(next, detail) => {
                  setStatus(next);
                  if (detail) setStatusDetail(detail);
                }}
                onEvent={onSimEvent}
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_45%,rgba(4,7,10,0.55)_100%)]" />
              <div className="absolute bottom-2 left-2 flex gap-1.5">
                {POSES.slice(0, 5).map((pose) => (
                  <span key={pose.id} className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/45">
                    {pose.key} {pose.label}
                  </span>
                ))}
              </div>
            </div>
            {(statusDetail || telemetry.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/8 bg-black/25 px-3 py-2">
                <span className="text-[11px] text-white/45">{statusDetail}</span>
                <div className="flex flex-wrap gap-1.5">
                  {telemetry.slice(0, 3).map((line) => (
                    <span key={line} className="rounded border border-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white/35">
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {tab === "floorplan" ? (
            <FloorplanEditor plan={config.floorplan} onChange={updatePlan} accent={config.environment.tint} height={360} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="panel p-4">
                <div className="label">test plan</div>
                <h3 className="mt-1.5 text-sm font-semibold text-white">{config.goal.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">{config.goal.brief}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-white/35">
                  <div>
                    <div className="text-white/70">{config.floorplan.orbs.length}</div>
                    markers
                  </div>
                  <div>
                    <div className="text-white/70">{config.goal.targetCompletionRate}%</div>
                    target
                  </div>
                  <div>
                    <div className="text-white/70">{Math.round(config.goal.timeLimitSec / 60)}m</div>
                    limit
                  </div>
                </div>
              </div>
              <div className="panel p-4">
                <div className="label">floorplan</div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-[96px] w-[140px] overflow-hidden rounded-lg border border-white/8 bg-black/25">
                    {/* simple visual echo of the plan */}
                    <svg viewBox="-9 -7 18 14" className="h-full w-full">
                      <polygon
                        points={config.floorplan.polygon.map((p) => `${p.x},${p.z}`).join(" ")}
                        fill="rgba(201,244,91,0.1)"
                        stroke={config.environment.tint}
                        strokeWidth="0.15"
                      />
                      {config.floorplan.orbs.map((orb) => (
                        <circle key={orb.id} cx={orb.x} cy={orb.z} r="0.32" fill={config.environment.tint} />
                      ))}
                    </svg>
                  </div>
                  <div className="text-[11px] leading-relaxed text-white/45">
                    {config.floorplan.polygon.length} corners, {config.floorplan.obstacles.length} props.
                    <button type="button" onClick={() => setTab("floorplan")} className="mt-1.5 block text-[#c9f45b] hover:underline">
                      Edit floorplan →
                    </button>
                  </div>
                </div>
              </div>
              <div className="panel p-4 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="label">validation hypothesis</div>
                  <Link href={`/insights/${project.id}`} className="text-[11px] text-[#c9f45b] hover:underline">
                    compare to telemetry →
                  </Link>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{config.goal.hypothesis}</p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
