import * as pc from "playcanvas";
import { buildDemoSplat } from "./splat";
import {
  isWalkable,
  polygonBounds,
  type ProjectConfig,
  type PoseId,
} from "@/lib/types";

export type SimStatus = "booting" | "ready" | "splat" | "fallback" | "error";

export type HudState = {
  status: SimStatus;
  timeSec: number;
  timeLimitSec: number;
  distance: number;
  collisions: number;
  collected: string[];
  totalOrbs: number;
  pose: PoseId;
  camera: "third" | "first";
  completed: boolean;
  fps: number;
  x: number;
  z: number;
  heading: number;
  splatCount: number;
  hint: string;
};

export type SimEventMessage = { type: string; payload: Record<string, unknown> };

export type SimMetrics = {
  durationSec: number;
  distanceM: number;
  orbsCollected: number;
  collisions: number;
  emotesUsed: number;
  cameraChanges: number;
  completed: boolean;
};

export type SimOptions = {
  canvas: HTMLCanvasElement;
  config: ProjectConfig;
  mode: "play" | "preview";
  onHud?: (state: HudState) => void;
  onEvent?: (event: SimEventMessage) => void;
  onStatus?: (status: SimStatus, detail?: string) => void;
};

type PoseState = {
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderLx: number;
  shoulderRx: number;
  shoulderLz: number;
  shoulderRz: number;
  elbowL: number;
  elbowR: number;
  headX: number;
  headY: number;
  bodyY: number;
  bodyRoll: number;
  bodyPitch: number;
  torsoYaw: number;
};

const ZERO_POSE: PoseState = {
  hipL: 0,
  hipR: 0,
  kneeL: 0,
  kneeR: 0,
  shoulderLx: 0,
  shoulderRx: 0,
  shoulderLz: 0.06,
  shoulderRz: 0.06,
  elbowL: 0.08,
  elbowR: 0.08,
  headX: 0,
  headY: 0,
  bodyY: 0,
  bodyRoll: 0,
  bodyPitch: 0,
  torsoYaw: 0,
};

function hexToColor(hex: string, fallback = "#ffffff"): pc.Color {
  const raw = /^#[0-9a-f]{3,8}$/i.test(hex) ? hex : fallback;
  const clean = raw.slice(1);
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return new pc.Color(1, 1, 1);
  return new pc.Color(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export class SimEngine {
  private readonly options: SimOptions;
  private app: pc.Application | null = null;
  private cameraEntity: pc.Entity | null = null;
  private envRoot: pc.Entity | null = null;
  private shellGroup: pc.Entity | null = null;
  private avatarRoot: pc.Entity | null = null;
  private avatarVisual: pc.Entity | null = null;
  private avatarModel: pc.Entity | null = null;

  private joints: Record<string, pc.Entity | null> = {};
  private orbNodes = new Map<string, pc.Entity>();
  private collected = new Set<string>();
  private objectUrls: string[] = [];
  private assets: pc.Asset[] = [];
  private disposed = false;
  private updateHandle: ((dt: number) => void) | null = null;

  private keys = new Set<string>();
  private pointer = { down: false, x: 0, y: 0 };
  private listeners: { target: EventTarget; type: string; fn: EventListener }[] = [];

  // player
  private pos = { x: 0, z: 0 };
  private y = 0;
  private vy = 0;
  private grounded = true;
  private heading = 0;
  private camYaw = 0;
  private camPitch = 18;
  private cameraMode: "third" | "first" = "third";
  private distance = 0;
  private collisions = 0;
  private emotesUsed = 0;
  private cameraChanges = 0;
  private elapsed = 0;
  private clock = 0;
  private completed = false;
  private timedOut = false;
  private paused = false;
  private pose: PoseId = "idle";
  private emoteTimer = 0;
  private walkPhase = 0;
  private lastCollisionAt = 0;
  private lastHudAt = 0;
  private lastEmitAt = 0;
  private fps = 60;
  private status: SimStatus = "booting";
  private splatCount = 0;
  private hint = "";
  private currentPose: PoseState = { ...ZERO_POSE };
  private previewYaw = 0;
  private previewPoseIndex = 0;
  private previewPoseTimer = 0;
  private meshCache = new Map<string, pc.Mesh>();
  private materialCache = new Map<string, pc.StandardMaterial>();
  private previewPaused = false;

  constructor(options: SimOptions) {
    this.options = options;
  }

  getConfig(): ProjectConfig {
    return this.options.config;
  }

  async start(): Promise<void> {
    const { canvas, config, mode } = this.options;
    this.setStatus("booting");

    const app = new pc.Application(canvas, {
      graphicsDeviceOptions: { antialias: true, alpha: false, preserveDrawingBuffer: false },
    });
    this.app = app;
    app.setCanvasFillMode(pc.FILLMODE_NONE);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.resize();
    app.start();

    const bounds = polygonBounds(config.floorplan.polygon);
    const accent = hexToColor(config.environment.tint, "#c9f45b");

    app.scene.ambientLight = new pc.Color(
      0.16 + config.environment.ambient * 0.5,
      0.18 + config.environment.ambient * 0.52,
      0.22 + config.environment.ambient * 0.55,
    );

    const camera = new pc.Entity("camera");
    camera.addComponent("camera", {
      clearColor: hexToColor(config.environment.skyColor, "#0b1114"),
      fov: mode === "preview" ? 52 : 64,
      nearClip: 0.05,
      farClip: 220,
    });
    app.root.addChild(camera);
    this.cameraEntity = camera;

    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: new pc.Color(0.95, 0.98, 1),
      intensity: 1.15,
      castShadows: false,
    });
    sun.setEulerAngles(46, 28, 0);
    app.root.addChild(sun);

    const fill = new pc.Entity("fill");
    fill.addComponent("light", {
      type: "omni",
      color: accent,
      intensity: 1.5,
      range: Math.max(12, bounds.width * 1.2),
      castShadows: false,
    });
    fill.setPosition(bounds.cx, 3.2, bounds.cz);
    app.root.addChild(fill);

    const spawn = this.safeSpawn();
    this.pos = { x: spawn.x, z: spawn.z };
    this.heading = rad(config.floorplan.spawnHeading);
    this.camYaw = rad(config.floorplan.spawnHeading);

    this.buildEnvironment();
    this.buildAvatar();

    this.attachInput();
    this.placeCamera(0);

    this.updateHandle = (dt: number) => this.update(dt);
    app.on("update", this.updateHandle);
    this.setStatus("ready");
    this.emitHud(true);

    this.emit({ type: "session_start", payload: { mode, preset: config.environment.preset } });
  }

  // ------------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------------

  private setStatus(status: SimStatus, detail?: string): void {
    this.status = status;
    this.options.onStatus?.(status, detail);
  }

  private emit(event: SimEventMessage): void {
    this.options.onEvent?.(event);
  }

  private material(
    key: string,
    build: (m: pc.StandardMaterial) => void,
  ): pc.StandardMaterial {
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const mat = new pc.StandardMaterial();
    mat.useMetalness = true;
    mat.metalness = 0.15;
    mat.gloss = 0.45;
    build(mat);
    mat.update();
    this.materialCache.set(key, mat);
    return mat;
  }

  private bodyMaterial(): pc.StandardMaterial {
    const { bodyColor } = this.options.config.avatar;
    return this.material(`body-${bodyColor}`, (m) => {
      m.diffuse = hexToColor(bodyColor, "#d7ff5f");
      m.metalness = 0.3;
      m.gloss = 0.6;
    });
  }

  private accentMaterial(): pc.StandardMaterial {
    const { accentColor } = this.options.config.avatar;
    return this.material(`accent-${accentColor}`, (m) => {
      m.diffuse = hexToColor(accentColor, "#1a222c");
      m.metalness = 0.45;
      m.gloss = 0.5;
    });
  }

  private visorMaterial(): pc.StandardMaterial {
    const { visorColor } = this.options.config.avatar;
    return this.material(`visor-${visorColor}`, (m) => {
      m.diffuse = hexToColor(visorColor, "#0b1017");
      m.emissive = hexToColor(visorColor, "#0b1017");
      m.emissiveIntensity = 1.5;
      m.metalness = 0.9;
      m.gloss = 0.9;
    });
  }

  private glowMaterial(hex: string, opacity = 1): pc.StandardMaterial {
    return this.material(`glow-${hex}-${opacity}`, (m) => {
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = hexToColor(hex, "#c9f45b");
      m.emissiveIntensity = 2.1;
      m.opacity = opacity;
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = opacity >= 1;
      m.update();
    });
  }

  private darkMaterial(hex: string, emissiveScale = 0, opacity = 1): pc.StandardMaterial {
    return this.material(`dark-${hex}-${emissiveScale}-${opacity}`, (m) => {
      m.diffuse = hexToColor(hex, "#151b22");
      if (emissiveScale > 0) {
        m.emissive = hexToColor(hex, "#151b22");
        m.emissiveIntensity = emissiveScale;
      }
      m.metalness = 0.2;
      m.gloss = 0.35;
      m.opacity = opacity;
      if (opacity < 1) {
        m.blendType = pc.BLEND_NORMAL;
        m.depthWrite = false;
      }
    });
  }

  private meshFor(kind: "box" | "sphere" | "capsule" | "cylinder", a: number, b = 0, c = 0): pc.Mesh {
    const key = `${kind}-${a}-${b}-${c}`;
    const cached = this.meshCache.get(key);
    if (cached) return cached;
    const device = this.app!.graphicsDevice;
    let mesh: pc.Mesh;
    if (kind === "box") {
      mesh = pc.Mesh.fromGeometry(device, new pc.BoxGeometry({ halfExtents: new pc.Vec3(a / 2, b / 2, c / 2) }));
    } else if (kind === "sphere") {
      mesh = pc.Mesh.fromGeometry(device, new pc.SphereGeometry({ radius: a, latitudeBands: 16, longitudeBands: 24 }));
    } else if (kind === "capsule") {
      mesh = pc.Mesh.fromGeometry(device, new pc.CapsuleGeometry({ radius: a, height: b, sides: 14, heightSegments: 2 }));
    } else {
      mesh = pc.Mesh.fromGeometry(device, new pc.CylinderGeometry({ radius: a, height: b, capSegments: 18 }));
    }
    this.meshCache.set(key, mesh);
    return mesh;
  }

  private renderNode(
    name: string,
    mesh: pc.Mesh,
    material: pc.StandardMaterial,
    opts: { pos?: [number, number, number]; euler?: [number, number, number]; parent?: pc.Entity } = {},
  ): pc.Entity {
    const entity = new pc.Entity(name);
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, material)] });
    if (opts.pos) entity.setLocalPosition(opts.pos[0], opts.pos[1], opts.pos[2]);
    if (opts.euler) entity.setLocalEulerAngles(opts.euler[0], opts.euler[1], opts.euler[2]);
    (opts.parent ?? this.app!.root).addChild(entity);
    return entity;
  }

  private safeSpawn() {
    const { floorplan } = this.options.config;
    if (isWalkable(floorplan, floorplan.spawn.x, floorplan.spawn.z, 0.2)) return floorplan.spawn;
    const bounds = polygonBounds(floorplan.polygon);
    for (let r = 0; r < 6; r += 1) {
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        const x = bounds.cx + Math.cos(angle) * r;
        const z = bounds.cz + Math.sin(angle) * r;
        if (isWalkable(floorplan, x, z, 0.2)) return { x, z };
      }
    }
    return { x: bounds.cx, z: bounds.cz };
  }

  // ------------------------------------------------------------------------
  // environment
  // ------------------------------------------------------------------------

  private buildEnvironment(): void {
    if (!this.app) return;
    if (this.envRoot) this.envRoot.destroy();
    this.orbNodes.clear();

    const root = new pc.Entity("environment");
    this.app.root.addChild(root);
    this.envRoot = root;

    const shell = new pc.Entity("shell");
    root.addChild(shell);
    this.shellGroup = shell;

    const { floorplan, environment } = this.options.config;
    const bounds = polygonBounds(floorplan.polygon);
    const accent = environment.tint;

    // floor slab
    const floor = this.renderNode(
      "floor",
      this.meshFor("box", bounds.width + 1.6, 0.12, bounds.depth + 1.6),
      this.darkMaterial("#141a20", 0.03),
      { parent: shell },
    );
    floor.setLocalPosition(bounds.cx, -0.09, bounds.cz);

    // guide grid
    const gridMat = this.glowMaterial(accent, 0.22);
    const step = 1;
    for (let x = Math.ceil(bounds.minX); x <= bounds.maxX; x += step) {
      const line = this.renderNode("grid-x", this.meshFor("box", 0.018, 0.006, bounds.depth), gridMat, { parent: shell });
      line.setLocalPosition(x, -0.02, bounds.cz);
    }
    for (let z = Math.ceil(bounds.minZ); z <= bounds.maxZ; z += step) {
      const line = this.renderNode("grid-z", this.meshFor("box", bounds.width, 0.006, 0.018), gridMat, { parent: shell });
      line.setLocalPosition(bounds.cx, -0.02, z);
    }

    // walls around the walkable polygon
    const wallMat = this.darkMaterial("#2b333d", 0.08, 0.72);
    const trimMat = this.glowMaterial(accent, 0.65);
    const polygon = floorplan.polygon;
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
      const wall = this.renderNode("wall", this.meshFor("box", 0.14, 2.85, len), wallMat, { parent: shell });
      wall.setLocalPosition((a.x + b.x) / 2, 1.42, (a.z + b.z) / 2);
      wall.setLocalEulerAngles(0, yaw, 0);
      const trim = this.renderNode("trim", this.meshFor("box", 0.05, 0.06, len * 0.96), trimMat, { parent: shell });
      trim.setLocalPosition((a.x + b.x) / 2, 2.62, (a.z + b.z) / 2);
      trim.setLocalEulerAngles(0, yaw, 0);
    }

    // obstacles become physical furniture
    for (const obstacle of floorplan.obstacles) {
      const prop = this.renderNode(
        "prop",
        this.meshFor("box", obstacle.w, 1.0, obstacle.d),
        this.darkMaterial("#232b34", 0.05),
        { parent: shell },
      );
      prop.setLocalPosition(obstacle.x, 0.5, obstacle.z);
      const cap = this.renderNode(
        "prop-cap",
        this.meshFor("box", obstacle.w + 0.04, 0.03, obstacle.d + 0.04),
        this.glowMaterial(accent, 0.8),
        { parent: shell },
      );
      cap.setLocalPosition(obstacle.x, 1.02, obstacle.z);
    }

    // spawn pad
    const pad = this.renderNode("spawn-pad", this.meshFor("cylinder", 0.52, 0.02), this.glowMaterial(accent, 0.35), {
      parent: shell,
    });
    pad.setLocalPosition(floorplan.spawn.x, 0.01, floorplan.spawn.z);

    // collectible scan markers
    const orbMat = this.glowMaterial(accent);
    const haloMat = this.material(`halo-${accent}`, (m) => {
      m.diffuse = new pc.Color(0, 0, 0);
      m.emissive = hexToColor(accent, "#c9f45b");
      m.emissiveIntensity = 1.2;
      m.opacity = 0.22;
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = false;
    });
    for (const orb of floorplan.orbs) {
      const node = new pc.Entity(`orb-${orb.id}`);
      node.setLocalPosition(orb.x, 1.1, orb.z);
      root.addChild(node);
      const core = this.renderNode("orb-core", this.meshFor("sphere", 0.12), orbMat, { parent: node });
      core.setLocalScale(1, 1, 1);
      const halo = this.renderNode("orb-halo", this.meshFor("sphere", 0.26), haloMat, { parent: node });
      halo.setLocalScale(1, 1, 1);
      const ring = this.renderNode("orb-ring", this.meshFor("cylinder", 0.24, 0.012), orbMat, { parent: node });
      ring.setLocalEulerAngles(12, 0, 0);
      const beam = this.renderNode("orb-beam", this.meshFor("box", 0.012, 1.0, 0.012), haloMat, { parent: node });
      beam.setLocalPosition(0, -0.55, 0);
      this.orbNodes.set(orb.id, node);
    }

    if (environment.kind === "splat") {
      this.loadEnvironmentSplat();
    } else if (environment.kind === "panorama" && environment.url) {
      this.loadPanorama(environment.url);
    } else if (environment.kind === "panorama") {
      this.setStatus("fallback", "No panorama uploaded yet — showing the floorplan shell.");
    }

    shell.enabled = environment.kind !== "splat" || environment.showShell;
  }

  private loadEnvironmentSplat(): void {
    if (!this.app) return;
    const { environment } = this.options.config;
    let url = environment.url;
    let filename = environment.filename ?? "environment.ply";

    if (environment.source === "upload" && url) {
      // use uploaded asset as is
    } else {
      const generated = buildDemoSplat(this.options.config.floorplan, environment);
      const blob = new Blob([generated.buffer], { type: "application/octet-stream" });
      url = URL.createObjectURL(blob);
      this.objectUrls.push(url);
      filename = `splatwalk-${environment.preset}.ply`;
      this.splatCount = generated.count;
      this.emit({ type: "splat_generated", payload: { splats: generated.count, preset: environment.preset } });
      this.setStatus("ready", `Generated ${generated.count.toLocaleString()} gaussians from the floorplan`);
    }

    if (!url) {
      this.setStatus("fallback", "No splat asset attached");
      return;
    }

    this.app.assets.loadFromUrlAndFilename(url, filename, "gsplat", (err, asset) => {
      if (this.disposed || !this.app) return;
      if (err || !asset) {
        const detail = typeof err === "string" ? err : "Unable to parse gaussian splat asset";
        this.setStatus("fallback", `${detail}. Showing the walkable shell instead.`);
        this.emit({ type: "splat_error", payload: { message: detail } });
        if (this.shellGroup) this.shellGroup.enabled = true;
        return;
      }
      this.assets.push(asset);
      const entity = new pc.Entity("splat-environment");
      entity.addComponent("gsplat", { asset });
      entity.setLocalScale(environment.splatScale, environment.splatScale, environment.splatScale);
      entity.setLocalPosition(0, environment.splatY, 0);
      // Uploaded captures may use a different up-axis convention. Keep all three
      // axes adjustable so upside-down and tilted scans can be corrected in Studio.
      entity.setLocalEulerAngles(environment.splatPitch ?? 0, environment.splatYaw ?? 0, environment.splatRoll ?? 0);
      this.envRoot?.addChild(entity);
      if (!environment.showShell && this.shellGroup) this.shellGroup.enabled = false;
      this.setStatus("splat", "Gaussian splat environment ready");
      this.emit({ type: "splat_ready", payload: { source: environment.source } });
      this.emitHud(true);
    });
  }

  private loadPanorama(url: string): void {
    if (!this.app) return;
    this.app.assets.loadFromUrlAndFilename(url, "panorama.jpg", "texture", (err, asset) => {
      if (this.disposed || !this.app) return;
      if (err || !asset) {
        this.setStatus("fallback", "Panorama could not be decoded");
        return;
      }
      this.assets.push(asset);
      const texture = asset.resource as pc.Texture;
      const mat = new pc.StandardMaterial();
      mat.diffuse = new pc.Color(0, 0, 0);
      mat.emissive = new pc.Color(1, 1, 1);
      mat.emissiveMap = texture;
      mat.useLighting = false;
      mat.cull = pc.CULLFACE_FRONT;
      mat.update();
      const sphere = this.renderNode("panorama", this.meshFor("sphere", 80), mat, { parent: this.envRoot ?? undefined });
      sphere.setLocalEulerAngles(0, this.options.config.environment.splatYaw, 0);
      this.setStatus("ready", "Equirectangular panorama environment");
      this.emit({ type: "panorama_ready", payload: {} });
    });
  }

  // ------------------------------------------------------------------------
  // avatar
  // ------------------------------------------------------------------------

  private buildAvatar(): void {
    if (!this.app) return;
    const { avatar, floorplan } = this.options.config;
    const root = new pc.Entity("avatar");
    root.setLocalPosition(this.pos.x, 0, this.pos.z);
    root.setLocalEulerAngles(0, (this.heading * 180) / Math.PI, 0);
    this.app.root.addChild(root);
    this.avatarRoot = root;

    const visual = new pc.Entity("avatar-visual");
    root.addChild(visual);
    this.avatarVisual = visual;
    visual.setLocalScale(avatar.scale, avatar.scale, avatar.scale);

    const body = this.bodyMaterial();
    const accent = this.accentMaterial();
    const visor = this.visorMaterial();
    const glow = this.glowMaterial(avatar.bodyColor);
    const isOrb = avatar.style === "orb";
    const slim = avatar.style === "scout" ? 0.86 : 1;

    const shadow = this.renderNode(
      "shadow",
      this.meshFor("cylinder", 0.36, 0.01),
      this.material("shadow", (m) => {
        m.diffuse = new pc.Color(0, 0, 0);
        m.opacity = 0.32;
        m.blendType = pc.BLEND_NORMAL;
        m.depthWrite = false;
      }),
      { parent: visual },
    );
    shadow.setLocalPosition(0, 0.015, 0);

    const ring = this.renderNode("spawn-ring", this.meshFor("cylinder", 0.3, 0.012), glow, { parent: visual });
    ring.setLocalPosition(0, 0.02, 0);
    ring.setLocalScale(1, 1, 1);

    const hips = this.renderNode("hips", this.meshFor("box", 0.3 * slim, 0.16, 0.22), accent, { parent: visual });
    hips.setLocalPosition(0, isOrb ? 0.42 : 0.86, 0);

    const torso = new pc.Entity("torso");
    torso.setLocalPosition(0, isOrb ? 0.92 : 1.14, 0);
    visual.addChild(torso);
    this.renderNode("torso-body", this.meshFor("capsule", 0.16 * slim, 0.46), body, { parent: torso });
    const chest = this.renderNode("chest", this.meshFor("box", 0.22, 0.09, 0.045), accent, { parent: torso });
    chest.setLocalPosition(0, 0.06, -0.145);
    const core = this.renderNode("core-glow", this.meshFor("sphere", 0.045), glow, { parent: torso });
    core.setLocalPosition(0, 0.06, -0.172);
    const pack = this.renderNode("pack", this.meshFor("box", 0.2, 0.24, 0.1), accent, { parent: torso });
    pack.setLocalPosition(0, -0.01, 0.15);
    const packLight = this.renderNode("pack-light", this.meshFor("box", 0.14, 0.02, 0.02), glow, { parent: torso });
    packLight.setLocalPosition(0, 0.06, 0.2);

    const headPivot = new pc.Entity("head-pivot");
    headPivot.setLocalPosition(0, isOrb ? 0.32 : 0.36, 0);
    torso.addChild(headPivot);
    this.joints.head = headPivot;
    const head = this.renderNode("head", this.meshFor("sphere", 0.15 * slim), body, { parent: headPivot });
    head.setLocalScale(1, 0.94, 1);
    const visorNode = this.renderNode("visor", this.meshFor("box", 0.21 * slim, 0.058, 0.05), visor, { parent: headPivot });
    visorNode.setLocalPosition(0, 0.012, -0.125);
    const earL = this.renderNode("ear-l", this.meshFor("cylinder", 0.045, 0.03), accent, { parent: headPivot });
    earL.setLocalPosition(-0.145 * slim, 0, 0);
    earL.setLocalEulerAngles(0, 0, 90);
    const earR = this.renderNode("ear-r", this.meshFor("cylinder", 0.045, 0.03), accent, { parent: headPivot });
    earR.setLocalPosition(0.145 * slim, 0, 0);
    earR.setLocalEulerAngles(0, 0, 90);
    const antenna = this.renderNode("antenna", this.meshFor("cylinder", 0.008, 0.16), accent, { parent: headPivot });
    antenna.setLocalPosition(0, 0.19, 0.02);
    const antennaTip = this.renderNode("antenna-tip", this.meshFor("sphere", 0.026), glow, { parent: headPivot });
    antennaTip.setLocalPosition(0, 0.27, 0.02);

    const joint = (name: string, parent: pc.Entity, x: number, y: number, z: number) => {
      const entity = new pc.Entity(name);
      entity.setLocalPosition(x, y, z);
      parent.addChild(entity);
      this.joints[name] = entity;
      return entity;
    };

    const shoulderY = isOrb ? 1.06 : 1.3;
    for (const side of ["L", "R"] as const) {
      const sign = side === "L" ? -1 : 1;
      const shoulder = joint(`shoulder${side}`, visual, sign * 0.215 * slim, shoulderY, 0);
      const upper = this.renderNode("upper-arm", this.meshFor("capsule", 0.048, 0.22), body, { parent: shoulder });
      upper.setLocalPosition(0, -0.11, 0);
      const pauldron = this.renderNode("pauldron", this.meshFor("sphere", 0.075), accent, { parent: shoulder });
      pauldron.setLocalPosition(0, 0.01, 0);
      const elbow = joint(`elbow${side}`, shoulder, 0, -0.22, 0);
      const fore = this.renderNode("forearm", this.meshFor("capsule", 0.042, 0.2), body, { parent: elbow });
      fore.setLocalPosition(0, -0.1, 0);
      const hand = this.renderNode("hand", this.meshFor("sphere", 0.052), glow, { parent: elbow });
      hand.setLocalPosition(0, -0.21, 0);
    }

    for (const side of ["L", "R"] as const) {
      const sign = side === "L" ? -1 : 1;
      const hip = joint(`hip${side}`, visual, sign * 0.1, isOrb ? 0.42 : 0.86, 0);
      const thigh = this.renderNode("thigh", this.meshFor("capsule", 0.062, 0.28), body, { parent: hip });
      thigh.setLocalPosition(0, -0.14, 0);
      const knee = joint(`knee${side}`, hip, 0, -0.28, 0);
      const shin = this.renderNode("shin", this.meshFor("capsule", 0.052, 0.28), body, { parent: knee });
      shin.setLocalPosition(0, -0.14, 0);
      const foot = this.renderNode("foot", this.meshFor("box", 0.12, 0.06, 0.22), accent, { parent: knee });
      foot.setLocalPosition(0, -0.3, -0.04);
      if (isOrb) {
        hip.enabled = false;
      }
    }

    if (isOrb) {
      const float = this.renderNode("hover-base", this.meshFor("sphere", 0.17), glow, { parent: visual });
      float.setLocalPosition(0, 0.18, 0);
      float.setLocalScale(0.7, 1.6, 0.7);
    }

    this.currentPose = { ...ZERO_POSE };
    if (avatar.modelUrl) {
      this.loadGlbAvatar(avatar.modelUrl);
    }

    // place the preview camera target around the avatar
    const spawn = floorplan.spawn;
    this.pos = { x: spawn.x, z: spawn.z };
  }

  private loadGlbAvatar(url: string): void {
    if (!this.app) return;
    this.app.assets.loadFromUrlAndFilename(url, this.options.config.avatar.modelName ?? "avatar.glb", "container", (err, asset) => {
      if (this.disposed || !this.app) return;
      if (err || !asset) {
        this.emit({ type: "avatar_error", payload: { message: String(err ?? "load failed") } });
        return;
      }
      this.assets.push(asset);
      try {
        const resource = asset.resource as pc.ContainerResource | undefined;
        if (!resource) throw new Error("Container resource unavailable");
        const entity = resource.instantiateRenderEntity();
        if (this.avatarVisual) this.avatarVisual.enabled = false;
        const holder = new pc.Entity("glb-avatar");
        holder.addChild(entity);
        entity.setLocalPosition(0, 0, 0);
        this.avatarRoot?.addChild(holder);
        this.avatarModel = holder;
        this.emit({ type: "avatar_ready", payload: { source: "glb" } });
      } catch {
        this.emit({ type: "avatar_error", payload: { message: "Unable to instantiate model" } });
      }
    });
  }

  private updateAvatar(dt: number, planarSpeed: number): void {
    if (!this.avatarVisual || !this.avatarRoot) return;
    const moving = planarSpeed > 0.2;
    let pose = this.pose;
    if (this.emoteTimer > 0) {
      this.emoteTimer -= dt;
      if (this.emoteTimer <= 0) this.pose = "idle";
    } else if (moving && (pose === "idle" || pose === "walk" || pose === "run")) {
      pose = planarSpeed > 4.6 ? "run" : "walk";
    } else if (!moving && (pose === "walk" || pose === "run")) {
      pose = "idle";
    }
    this.pose = pose;

    const t = this.clock;
    const stride = Math.max(0.6, this.options.config.avatar.stride);
    if (moving) {
      this.walkPhase += dt * (2.1 + planarSpeed * 1.35) / stride;
    } else {
      this.walkPhase += dt * 1.6;
    }
    const phase = this.walkPhase;
    const runFactor = pose === "run" ? 1.35 : 1;
    const swing = moving ? Math.sin(phase) * 0.62 * runFactor : 0;
    const target: PoseState = { ...ZERO_POSE };

    if (pose === "wave") {
      target.shoulderRz = 2.25 + Math.sin(t * 9) * 0.28;
      target.shoulderRx = -0.2;
      target.elbowR = 0.5 + Math.sin(t * 9 + 1) * 0.22;
      target.headY = -0.18;
      target.headX = -0.08;
      target.shoulderLz = -0.08;
    } else if (pose === "sit") {
      target.hipL = 1.42;
      target.hipR = 1.42;
      target.kneeL = -1.52;
      target.kneeR = -1.52;
      target.bodyY = -0.4;
      target.shoulderLx = -0.42;
      target.shoulderRx = -0.42;
      target.elbowL = -0.6;
      target.elbowR = -0.6;
      target.headX = 0.05;
    } else if (pose === "dance") {
      const beat = Math.sin(t * 6);
      target.hipL = beat * 0.35;
      target.hipR = -beat * 0.35;
      target.kneeL = Math.max(0, beat) * 0.5;
      target.kneeR = Math.max(0, -beat) * 0.5;
      target.shoulderLz = 1.6 + beat * 0.9;
      target.shoulderRz = 1.6 - beat * 0.9;
      target.elbowL = -0.7 + beat * 0.4;
      target.elbowR = -0.7 - beat * 0.4;
      target.torsoYaw = Math.sin(t * 3) * 0.35;
      target.bodyY = Math.abs(beat) * 0.06;
      target.headY = Math.sin(t * 2.2) * 0.25;
    } else if (pose === "point") {
      target.shoulderRx = 1.5;
      target.shoulderRz = 0.2;
      target.elbowR = 0.12;
      target.headY = -0.12;
      target.shoulderLz = -0.2;
      target.bodyPitch = -0.04;
    } else if (pose === "jump" || (!this.grounded && moving)) {
      target.hipL = -0.5;
      target.hipR = -0.32;
      target.kneeL = 0.85;
      target.kneeR = 0.6;
      target.shoulderLz = 1.1;
      target.shoulderRz = 1.1;
      target.bodyPitch = 0.05;
    } else if (moving) {
      target.hipL = swing;
      target.hipR = -swing;
      target.kneeL = Math.max(0, -swing) * 1.5;
      target.kneeR = Math.max(0, swing) * 1.5;
      target.shoulderLx = -swing * 0.8;
      target.shoulderRx = swing * 0.8;
      target.shoulderLz = 0.12;
      target.shoulderRz = 0.12;
      target.elbowL = 0.25 + Math.max(0, swing) * 0.5;
      target.elbowR = 0.25 + Math.max(0, -swing) * 0.5;
      target.bodyY = Math.abs(Math.sin(phase * 2)) * 0.035;
      target.torsoYaw = Math.sin(phase) * 0.08;
      target.bodyPitch = pose === "run" ? 0.1 : 0.04;
    } else {
      target.bodyY = Math.sin(t * 1.4) * 0.012;
      target.headY = Math.sin(t * 0.7) * 0.16;
      target.shoulderLz = 0.1 + Math.sin(t * 1.4) * 0.03;
      target.shoulderRz = 0.1 + Math.sin(t * 1.4 + 0.6) * 0.03;
      target.elbowL = 0.12;
      target.elbowR = 0.12;
    }

    const k = 14;
    const next = this.currentPose;
    for (const key of Object.keys(next) as (keyof PoseState)[]) {
      next[key] = damp(next[key], target[key], k, dt);
    }

    const visual = this.avatarVisual;
    visual.setLocalPosition(0, next.bodyY, 0);
    visual.setLocalEulerAngles(next.bodyRoll * 57.3, next.torsoYaw * 57.3, next.bodyPitch * 57.3);
    const setRot = (name: string, x: number, y: number, z: number) => {
      this.joints[name]?.setLocalEulerAngles((x * 180) / Math.PI, (y * 180) / Math.PI, (z * 180) / Math.PI);
    };
    setRot("hipL", next.hipL, 0, 0);
    setRot("hipR", next.hipR, 0, 0);
    setRot("kneeL", next.kneeL, 0, 0);
    setRot("kneeR", next.kneeR, 0, 0);
    setRot("shoulderL", next.shoulderLx, 0, -next.shoulderLz);
    setRot("shoulderR", next.shoulderRx, 0, next.shoulderRz);
    setRot("elbowL", next.elbowL, 0, 0);
    setRot("elbowR", next.elbowR, 0, 0);
    // head pivot is the child entity added to torso
    if (this.joints.head) {
      setRot("head", next.headX, next.headY, 0);
    }

    if (this.avatarRoot) {
      this.avatarRoot.setLocalPosition(this.pos.x, this.y, this.pos.z);
      this.avatarRoot.setLocalEulerAngles(0, (this.heading * 180) / Math.PI, 0);
    }
    if (this.avatarModel) {
      this.avatarModel.setLocalPosition(0, 0, 0);
    }
  }

  // ------------------------------------------------------------------------
  // input + loop
  // ------------------------------------------------------------------------

  private listen(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push({ target, type, fn });
  }

  private attachInput(): void {
    if (this.options.mode !== "play") return;
    this.listen(window, "keydown", ((event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      this.keys.add(key);
      if (key === "shift") this.keys.add("shift");
      if (key === "c") this.toggleCamera();
      if (key === "r") this.resetPlayer();
      if (key === "e") this.scan();
      const poseKeys: Record<string, PoseId> = { "1": "idle", "2": "wave", "3": "sit", "4": "dance", "5": "point" };
      if (poseKeys[key]) this.setPose(poseKeys[key]);
    }) as EventListener);
    this.listen(window, "keyup", ((event: KeyboardEvent) => {
      this.keys.delete(event.key.toLowerCase());
    }) as EventListener);
    this.listen(window, "blur", (() => this.keys.clear()) as EventListener);

    const canvas = this.options.canvas;
    this.listen(canvas, "pointerdown", ((event: PointerEvent) => {
      this.pointer.down = true;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    }) as EventListener);
    this.listen(canvas, "pointermove", ((event: PointerEvent) => {
      if (!this.pointer.down) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.camYaw -= dx * 0.006;
      this.camPitch = Math.min(70, Math.max(-20, this.camPitch + dy * 0.22));
    }) as EventListener);
    this.listen(canvas, "pointerup", (() => {
      this.pointer.down = false;
    }) as EventListener);
    this.listen(canvas, "pointerleave", (() => {
      this.pointer.down = false;
    }) as EventListener);
    this.listen(canvas, "wheel", ((event: WheelEvent) => {
      event.preventDefault();
      this.camPitch = Math.min(70, Math.max(-10, this.camPitch + event.deltaY * 0.02));
    }) as EventListener);
  }

  private placeCamera(dt: number): void {
    if (!this.cameraEntity) return;
    const { config, mode } = this.options;
    if (mode === "preview") {
      const bounds = polygonBounds(config.floorplan.polygon);
      this.previewYaw += dt * 0.16;
      const radius = Math.max(6.5, Math.max(bounds.width, bounds.depth) * 0.78);
      const cx = bounds.cx;
      const cz = bounds.cz;
      const camX = cx + Math.sin(this.previewYaw) * radius;
      const camZ = cz + Math.cos(this.previewYaw) * radius;
      this.cameraEntity.setPosition(camX, 4.2 + Math.sin(this.previewYaw * 0.6) * 0.6, camZ);
      this.cameraEntity.lookAt(new pc.Vec3(cx, 1.0, cz));
      return;
    }

    const eyeHeight = 1.62 * config.avatar.scale;
    if (this.cameraMode === "first") {
      const eye = new pc.Vec3(this.pos.x, this.y + eyeHeight, this.pos.z);
      this.cameraEntity.setPosition(eye);
      const forward = new pc.Vec3(-Math.sin(this.camYaw), Math.sin(rad(this.camPitch) * 0.35), -Math.cos(this.camYaw));
      this.cameraEntity.lookAt(new pc.Vec3(eye.x + forward.x, eye.y + forward.y, eye.z + forward.z));
      if (this.avatarVisual) this.avatarVisual.enabled = false;
      if (this.avatarModel) this.avatarModel.enabled = false;
    } else {
      if (this.avatarVisual && !this.options.config.avatar.modelUrl) this.avatarVisual.enabled = true;
      if (this.avatarModel) this.avatarModel.enabled = true;
      const dist = 4.1;
      const pitch = rad(this.camPitch);
      const offset = new pc.Vec3(Math.sin(this.camYaw) * Math.cos(pitch), Math.sin(pitch) + 0.32, Math.cos(this.camYaw) * Math.cos(pitch));
      const target = new pc.Vec3(this.pos.x, this.y + 1.25 * config.avatar.scale, this.pos.z);
      const position = new pc.Vec3(
        this.pos.x + offset.x * dist,
        Math.max(0.5, this.y + 1.15 + offset.y * dist),
        this.pos.z + offset.z * dist,
      );
      this.cameraEntity.setPosition(position);
      this.cameraEntity.lookAt(target);
    }
  }

  private movePlayer(dt: number): { planarSpeed: number } {
    const { floorplan, avatar } = this.options.config;
    const running = Number(this.keys.has("shift"));
    const baseSpeed = avatar.speed;
    const speed = baseSpeed * (1 + running * 0.55);

    let ix = 0;
    let iz = 0;
    if (this.options.mode === "play") {
      if (this.keys.has("w") || this.keys.has("arrowup")) iz += 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) iz -= 1;
      if (this.keys.has("a") || this.keys.has("arrowleft")) ix -= 1;
      if (this.keys.has("d") || this.keys.has("arrowright")) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    if (len === 0) {
      this.vy -= 13 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
      }
      return { planarSpeed: 0 };
    }
    ix /= len;
    iz /= len;
    const forward = { x: -Math.sin(this.camYaw), z: -Math.cos(this.camYaw) };
    const right = { x: Math.cos(this.camYaw), z: -Math.sin(this.camYaw) };
    let dx = forward.x * iz + right.x * ix;
    let dz = forward.z * iz + right.z * ix;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;

    const step = speed * dt;
    const radius = 0.3;
    let moved = false;
    if (isWalkable(floorplan, this.pos.x + dx * step, this.pos.z + dz * step, radius)) {
      this.pos.x += dx * step;
      this.pos.z += dz * step;
      moved = true;
    } else if (isWalkable(floorplan, this.pos.x + dx * step, this.pos.z, radius)) {
      this.pos.x += dx * step;
      moved = true;
    } else if (isWalkable(floorplan, this.pos.x, this.pos.z + dz * step, radius)) {
      this.pos.z += dz * step;
      moved = true;
    }

    if (moved) {
      this.distance += step;
      this.heading = Math.atan2(-dx, -dz);
    } else if (this.elapsed - this.lastCollisionAt > 0.8) {
      this.lastCollisionAt = this.elapsed;
      this.collisions += 1;
      this.emit({ type: "collision", payload: { x: Math.round(this.pos.x * 10) / 10, z: Math.round(this.pos.z * 10) / 10 } });
    }

    if (this.keys.has(" ") && this.grounded) {
      this.vy = 4.4;
      this.grounded = false;
      this.emit({ type: "jump", payload: {} });
    }

    this.vy -= 13 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
    }

    return { planarSpeed: moved ? speed : 0 };
  }

  private checkOrbs(): void {
    const { floorplan } = this.options.config;
    for (const orb of floorplan.orbs) {
      if (this.collected.has(orb.id)) continue;
      const dist = Math.hypot(this.pos.x - orb.x, this.pos.z - orb.z);
      if (dist < 1.15) {
        this.collected.add(orb.id);
        this.emit({ type: "orb_collected", payload: { id: orb.id, label: orb.label, count: this.collected.size } });
        const node = this.orbNodes.get(orb.id);
        if (node) node.enabled = false;
        if (this.collected.size >= floorplan.orbs.length && !this.completed) {
          this.completed = true;
          this.emit({ type: "goal_complete", payload: { durationSec: Math.round(this.elapsed) } });
        }
      }
    }
  }

  private animateOrbs(dt: number): void {
    const t = this.clock;
    let index = 0;
    for (const [id, node] of this.orbNodes) {
      if (this.collected.has(id)) continue;
      index += 1;
      node.setLocalPosition(node.getLocalPosition().x, 1.12 + Math.sin(t * 1.6 + index) * 0.12, node.getLocalPosition().z);
      node.setLocalEulerAngles(0, t * 42 + index * 30, 0);
    }
    void dt;
  }

  private update(dtRaw: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));
    this.fps = this.fps * 0.92 + (1 / dt) * 0.08;
    const { mode, config } = this.options;
    const paused = this.paused || this.previewPaused;
    if (!paused) {
      this.clock += dt;
      if (mode === "play") this.elapsed += dt;
    }

    let planarSpeed = 0;
    if (!paused) {
      if (mode === "play") {
        const result = this.movePlayer(dt);
        planarSpeed = result.planarSpeed;
        if (!this.completed && this.elapsed >= config.goal.timeLimitSec && !this.timedOut) {
          this.timedOut = true;
          this.emit({ type: "timeout", payload: { durationSec: Math.round(this.elapsed) } });
        }
        this.checkOrbs();
      }
      this.animateOrbs(dt);
      this.updateAvatar(dt, planarSpeed);
      if (mode === "preview") {
        this.previewPoseTimer += dt;
        if (this.previewPoseTimer > 4.2) {
          this.previewPoseTimer = 0;
          this.previewPoseIndex = (this.previewPoseIndex + 1) % 4;
          const emotes: PoseId[] = ["wave", "point", "dance", "idle"];
          this.setPose(emotes[this.previewPoseIndex]);
        }
      }
      this.placeCamera(dt);
    }

    if (this.clock - this.lastHudAt > 0.12) this.emitHud();
    void paused;
  }

  private emitHud(force = false): void {
    if (!this.options.onHud) return;
    if (!force && this.clock - this.lastHudAt < 0.1) return;
    this.lastHudAt = this.clock;
    this.options.onHud({
      status: this.status,
      timeSec: this.elapsed,
      timeLimitSec: this.options.config.goal.timeLimitSec,
      distance: this.distance,
      collisions: this.collisions,
      collected: [...this.collected],
      totalOrbs: this.options.config.floorplan.orbs.length,
      pose: this.pose,
      camera: this.cameraMode,
      completed: this.completed,
      fps: Math.round(this.fps),
      x: this.pos.x,
      z: this.pos.z,
      heading: this.heading,
      splatCount: this.splatCount,
      hint: this.hint,
    });
  }

  // ------------------------------------------------------------------------
  // public controls
  // ------------------------------------------------------------------------

  setPose(pose: PoseId): void {
    const allowed = this.options.config.avatar.poses;
    if (pose !== "idle" && !allowed.includes(pose)) return;
    this.pose = pose;
    if (pose !== "idle") {
      this.emotesUsed += 1;
      this.emoteTimer = pose === "sit" ? 8 : 5;
      this.emit({ type: "emote", payload: { pose } });
    }
    this.emitHud(true);
  }

  toggleCamera(): void {
    this.cameraMode = this.cameraMode === "third" ? "first" : "third";
    this.cameraChanges += 1;
    if (this.cameraMode === "first" && this.avatarVisual) this.avatarVisual.enabled = false;
    if (this.cameraMode === "third" && this.avatarVisual && !this.options.config.avatar.modelUrl) {
      this.avatarVisual.enabled = true;
    }
    this.emit({ type: "camera_toggle", payload: { mode: this.cameraMode } });
    this.emitHud(true);
  }

  scan(): void {
    let nearest: { label: string; dist: number } | null = null;
    for (const orb of this.options.config.floorplan.orbs) {
      if (this.collected.has(orb.id)) continue;
      const dist = Math.hypot(this.pos.x - orb.x, this.pos.z - orb.z);
      if (!nearest || dist < nearest.dist) nearest = { label: orb.label, dist };
    }
    this.hint = nearest && nearest.dist < 4 ? `Scanning ${nearest.label} — ${nearest.dist.toFixed(1)}m` : "No marker in range";
    this.emit({ type: "scan", payload: { hint: this.hint } });
    this.emitHud(true);
  }

  resetPlayer(): void {
    const spawn = this.options.config.floorplan.spawn;
    this.pos = { x: spawn.x, z: spawn.z };
    this.y = 0;
    this.vy = 0;
    this.emit({ type: "respawn", payload: {} });
    this.emitHud(true);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  resize(): void {
    this.app?.resizeCanvas();
  }

  getMetrics(): SimMetrics {
    return {
      durationSec: Math.round(this.elapsed),
      distanceM: Math.round(this.distance * 10) / 10,
      orbsCollected: this.collected.size,
      collisions: this.collisions,
      emotesUsed: this.emotesUsed,
      cameraChanges: this.cameraChanges,
      completed: this.completed,
    };
  }

  destroy(): void {
    this.disposed = true;
    if (this.app) {
      if (this.updateHandle) this.app.off("update", this.updateHandle);
      this.app.destroy();
      this.app = null;
    }
    for (const { target, type, fn } of this.listeners) {
      target.removeEventListener(type, fn);
    }
    this.listeners = [];
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
  }
}
