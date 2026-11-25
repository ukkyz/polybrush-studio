export type Point = { x: number; z: number };

export type Obstacle = {
  id: string;
  label: string;
  x: number;
  z: number;
  w: number;
  d: number;
};

export type Orb = {
  id: string;
  label: string;
  x: number;
  z: number;
};

export type FloorPlan = {
  polygon: Point[];
  spawn: Point;
  spawnHeading: number;
  obstacles: Obstacle[];
  orbs: Orb[];
};

export type EnvironmentKind = "splat" | "panorama" | "mesh";
export type EnvironmentSource = "generated" | "upload";
export type SplatQuality = "balanced" | "high" | "maximum";
export type ScenePreset = "loft" | "gallery" | "atrium";

export type EnvironmentConfig = {
  kind: EnvironmentKind;
  source: EnvironmentSource;
  preset: ScenePreset;
  url: string | null;
  filename: string | null;
  splatScale: number;
  splatQuality: SplatQuality;
  splatYaw: number;
  splatPitch: number;
  splatRoll: number;
  splatY: number;
  tint: string;
  ambient: number;
  fog: boolean;
  showShell: boolean;
  skyColor: string;
};

export type AvatarStyle = "walker" | "scout" | "orb";
export type PoseId = "idle" | "walk" | "run" | "jump" | "wave" | "sit" | "dance" | "point";

export type AvatarConfig = {
  name: string;
  style: AvatarStyle;
  bodyColor: string;
  accentColor: string;
  visorColor: string;
  scale: number;
  speed: number;
  stride: number;
  modelUrl: string | null;
  modelName: string | null;
  poses: PoseId[];
};

export type GoalConfig = {
  title: string;
  brief: string;
  timeLimitSec: number;
  hypothesis: string;
  targetCompletionRate: number;
  targetAvgDurationSec: number;
};

export type ProjectConfig = {
  name: string;
  description: string;
  environment: EnvironmentConfig;
  floorplan: FloorPlan;
  avatar: AvatarConfig;
  goal: GoalConfig;
};

export type Project = ProjectConfig & {
  id: number;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionSummary = {
  id: number;
  projectId: number;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  distanceM: number;
  orbsCollected: number;
  totalOrbs: number;
  collisions: number;
  emotesUsed: number;
  cameraChanges: number;
  completed: boolean;
  endReason: string | null;
};

export type FeedbackEntry = {
  id: number;
  projectId: number;
  sessionId: number | null;
  rating: number;
  tags: string[];
  comment: string;
  role: string;
  createdAt: string;
};

export type ProjectAnalytics = {
  sessions: number;
  completedSessions: number;
  completionRate: number;
  avgDurationSec: number;
  avgDistanceM: number;
  totalEmotes: number;
  feedbackCount: number;
  avgRating: number;
  avgOrbsCollected: number;
  events: { type: string; count: number }[];
  recentSessions: SessionSummary[];
  feedback: FeedbackEntry[];
};

export const POSES: { id: PoseId; label: string; key: string; hint: string }[] = [
  { id: "idle", label: "Idle", key: "1", hint: "Rest pose, subtle breathing loop" },
  { id: "wave", label: "Wave", key: "2", hint: "Greeting emote with head tilt" },
  { id: "sit", label: "Sit", key: "3", hint: "Seated pose for observation" },
  { id: "dance", label: "Dance", key: "4", hint: "Looping celebratory emote" },
  { id: "point", label: "Point", key: "5", hint: "Direct attention at a scan target" },
];

export const EMOTE_POSES: PoseId[] = ["wave", "sit", "dance", "point"];

export const PALETTE = {
  accent: "#c9f45b",
  accentDeep: "#9fd11f",
  violet: "#9b8cff",
  cyan: "#6fe3d2",
  orange: "#ffb26b",
  pink: "#ff8fb8",
  paper: "#eef3f7",
  ink: "#080b0f",
};

export const BODY_COLORS = ["#d7ff5f", "#9b8cff", "#6fe3d2", "#ffb26b", "#ff8fb8", "#e9eef5"];
export const ACCENT_COLORS = ["#1a222c", "#c9f45b", "#9b8cff", "#ff8fb8", "#ffffff", "#6fe3d2"];
export const VISOR_COLORS = ["#0b1017", "#c9f45b", "#6fe3d2", "#ff8fb8", "#9b8cff"];

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultEnvironment(): EnvironmentConfig {
  return {
    kind: "splat",
    source: "generated",
    preset: "loft",
    url: null,
    filename: null,
    splatScale: 1,
    splatQuality: "maximum",
    splatYaw: 0,
    splatPitch: 0,
    splatRoll: 0,
    splatY: 0,
    tint: "#c9f45b",
    ambient: 0.65,
    fog: true,
    showShell: false,
    skyColor: "#0b1114",
  };
}

export function defaultAvatar(): AvatarConfig {
  return {
    name: "Kite",
    style: "walker",
    bodyColor: "#d7ff5f",
    accentColor: "#1a222c",
    visorColor: "#0b1017",
    scale: 1,
    speed: 3.4,
    stride: 1,
    modelUrl: null,
    modelName: null,
    poses: ["idle", "wave", "sit", "dance", "point"],
  };
}

export function defaultGoal(orbs: number): GoalConfig {
  return {
    title: "Scan the space",
    brief: `Walk the floorplan and collect all ${orbs} scan markers. Use emotes to record reactions at each marker.`,
    timeLimitSec: 180,
    hypothesis: "Testers can orient themselves in an uploaded space within 90 seconds and finish a scan run without guidance.",
    targetCompletionRate: 70,
    targetAvgDurationSec: 120,
  };
}

export const FLOORPLAN_PRESETS: Record<ScenePreset, { label: string; note: string; plan: FloorPlan }> = {
  loft: {
    label: "Corner loft",
    note: "L-shaped studio with a column obstacle",
    plan: {
      polygon: [
        { x: -6, z: -5 },
        { x: 6, z: -5 },
        { x: 6, z: 1 },
        { x: 1, z: 1 },
        { x: 1, z: 6 },
        { x: -6, z: 6 },
      ],
      spawn: { x: -3.2, z: 2.4 },
      spawnHeading: 25,
      obstacles: [
        { id: "ob_column", label: "Structural column", x: -1.4, z: -1.2, w: 1.2, d: 1.2 },
        { id: "ob_plinth", label: "Scan plinth", x: 3.4, z: -2.8, w: 1.6, d: 0.9 },
      ],
      orbs: [
        { id: "orb_1", label: "North window", x: 4.2, z: -3.9 },
        { id: "orb_2", label: "Reading nook", x: -4.4, z: -3.4 },
        { id: "orb_3", label: "Column base", x: 0.4, z: -0.6 },
        { id: "orb_4", label: "Service bar", x: 3.6, z: 3.6 },
        { id: "orb_5", label: "Entry hatch", x: -4.6, z: 4.4 },
      ],
    },
  },
  gallery: {
    label: "Gallery wing",
    note: "Long hall with display plinths",
    plan: {
      polygon: [
        { x: -8, z: -3 },
        { x: 8, z: -3 },
        { x: 8, z: 3 },
        { x: -8, z: 3 },
      ],
      spawn: { x: -6.2, z: 0 },
      spawnHeading: 90,
      obstacles: [
        { id: "ob_plinth1", label: "Plinth A", x: -2.4, z: 0, w: 1.4, d: 1.4 },
        { id: "ob_plinth2", label: "Plinth B", x: 2.4, z: 0, w: 1.4, d: 1.4 },
      ],
      orbs: [
        { id: "orb_1", label: "West wall", x: -6.4, z: -2.1 },
        { id: "orb_2", label: "Plinth A", x: -2.4, z: 2.1 },
        { id: "orb_3", label: "Centre aisle", x: 0, z: -2.2 },
        { id: "orb_4", label: "Plinth B", x: 2.4, z: 2.1 },
        { id: "orb_5", label: "East wall", x: 6.4, z: -1.4 },
      ],
    },
  },
  atrium: {
    label: "Atrium deck",
    note: "Wide octagonal deck with a core",
    plan: {
      polygon: [
        { x: -5, z: -6 },
        { x: 5, z: -6 },
        { x: 7, z: -3 },
        { x: 7, z: 3 },
        { x: 5, z: 6 },
        { x: -5, z: 6 },
        { x: -7, z: 3 },
        { x: -7, z: -3 },
      ],
      spawn: { x: 0, z: 4.6 },
      spawnHeading: 180,
      obstacles: [{ id: "ob_core", label: "Atrium core", x: 0, z: 0, w: 2.6, d: 2.6 }],
      orbs: [
        { id: "orb_1", label: "North rail", x: 0, z: -5 },
        { id: "orb_2", label: "East deck", x: 5.6, z: 0 },
        { id: "orb_3", label: "South rail", x: 0, z: 5 },
        { id: "orb_4", label: "West deck", x: -5.6, z: 0 },
        { id: "orb_5", label: "Core edge", x: 2.8, z: 2.8 },
      ],
    },
  },
};

export function clonePlan(plan: FloorPlan): FloorPlan {
  return {
    polygon: plan.polygon.map((p) => ({ ...p })),
    spawn: { ...plan.spawn },
    spawnHeading: plan.spawnHeading,
    obstacles: plan.obstacles.map((o) => ({ ...o })),
    orbs: plan.orbs.map((o) => ({ ...o })),
  };
}

export function presetPlan(preset: ScenePreset): FloorPlan {
  return clonePlan(FLOORPLAN_PRESETS[preset].plan);
}

export function isPointInPolygon(polygon: Point[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isInsideObstacle(plan: FloorPlan, x: number, z: number, pad = 0): boolean {
  return plan.obstacles.some(
    (o) => Math.abs(x - o.x) < o.w / 2 + pad && Math.abs(z - o.z) < o.d / 2 + pad,
  );
}

export function isWalkable(plan: FloorPlan, x: number, z: number, pad = 0.32): boolean {
  if (!isPointInPolygon(plan.polygon, x, z)) return false;
  // keep the capsule away from the boundary
  const probes: Point[] = [
    { x: x + pad, z },
    { x: x - pad, z },
    { x, z: z + pad },
    { x, z: z - pad },
  ];
  if (probes.some((p) => !isPointInPolygon(plan.polygon, p.x, p.z))) return false;
  return !isInsideObstacle(plan, x, z, pad);
}

export function polygonBounds(polygon: Point[]) {
  const xs = polygon.map((p) => p.x);
  const zs = polygon.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, width: maxX - minX, depth: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

export function projectPath(project: { slug: string; id: number }): string {
  return `/p/${project.slug}-${project.id}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42) || "simulation";
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
