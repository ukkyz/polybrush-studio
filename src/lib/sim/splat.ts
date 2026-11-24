import {
  isPointInPolygon,
  polygonBounds,
  type EnvironmentConfig,
  type FloorPlan,
} from "@/lib/types";

export type SplatSample = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  scale: number;
  opacity: number;
};

export type GeneratedSplat = {
  buffer: ArrayBuffer;
  count: number;
  samples: SplatSample[];
};

const SH_C0 = 0.28209479177387814;
const REST_COUNT = 45;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const int = Number.parseInt(full, 16);
  if (Number.isNaN(int)) return [0.8, 0.95, 0.35];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function shade(color: [number, number, number], factor: number, tint: [number, number, number], tintMix: number): [number, number, number] {
  return [
    mix(color[0] * factor, tint[0], tintMix),
    mix(color[1] * factor, tint[1], tintMix),
    mix(color[2] * factor, tint[2], tintMix),
  ];
}

/**
 * Builds a synthetic Gaussian-splat scene from the walkable floorplan:
 * floor, wall, prop and light gaussians. The result is a standards compliant
 * 3DGS PLY (position, log-scale, quaternion, logit-opacity, SH DC + rest)
 * that PlayCanvas renders through its native gsplat renderer.
 */
export function buildDemoSplat(plan: FloorPlan, env: EnvironmentConfig): GeneratedSplat {
  const seed = Math.floor(
    plan.polygon.reduce((acc, p) => acc + p.x * 31 + p.z * 17, 7) + env.preset.length * 97,
  );
  const rand = mulberry32(seed);
  const accent = hexToRgb(env.tint).map(toLinear) as [number, number, number];
  const bounds = polygonBounds(plan.polygon);
  const samples: SplatSample[] = [];
  const temp: [number, number, number] = [0.62, 0.66, 0.7];

  const push = (s: SplatSample) => {
    if (samples.length < 26000 && Number.isFinite(s.x) && Number.isFinite(s.z)) samples.push(s);
  };

  // ---- floor -------------------------------------------------------------
  const floorTarget = 11500;
  let guard = 0;
  while (samples.length < floorTarget && guard < floorTarget * 40) {
    guard += 1;
    const x = bounds.minX + rand() * bounds.width;
    const z = bounds.minZ + rand() * bounds.depth;
    if (!isPointInPolygon(plan.polygon, x, z)) continue;
    const distFromCenter = Math.hypot(x - bounds.cx, z - bounds.cz) / (Math.max(bounds.width, bounds.depth) / 2);
    const checker = (Math.floor(x * 1.4) + Math.floor(z * 1.4)) % 2 === 0;
    const base = checker ? 0.22 : 0.16;
    const factor = base + rand() * 0.06;
    const c = shade(temp, factor, accent, 0.06 + Math.max(0, 0.12 - distFromCenter * 0.1));
    push({
      x,
      y: -0.03 + rand() * 0.02,
      z,
      r: c[0],
      g: c[1],
      b: c[2],
      scale: 0.042 + rand() * 0.038,
      opacity: 0.88,
    });
  }

  // ---- walls -------------------------------------------------------------
  const wallTarget = samples.length + 6200;
  const wallColor: [number, number, number] = [0.5, 0.55, 0.6];
  let edgeGuard = 0;
  while (samples.length < wallTarget && edgeGuard < 60) {
    edgeGuard += 1;
    for (let i = 0; i < plan.polygon.length && samples.length < wallTarget; i += 1) {
      const a = plan.polygon[i];
      const b = plan.polygon[(i + 1) % plan.polygon.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const count = Math.min(560, Math.max(30, Math.round(len * 46)));
      for (let s = 0; s < count; s += 1) {
        const t = rand();
        const x = mix(a.x, b.x, t) + (rand() - 0.5) * 0.06;
        const z = mix(a.z, b.z, t) + (rand() - 0.5) * 0.06;
        const y = rand() * 2.75;
        const heightFade = 0.95 - (y / 2.75) * 0.5;
        const c = shade(wallColor, 0.3 + heightFade * 0.42 + rand() * 0.05, accent, 0.035);
        push({ x, y, z, r: c[0], g: c[1], b: c[2], scale: 0.045 + rand() * 0.025, opacity: 0.82 });
      }
      // emissive light strip along the top of selected walls
      if (i % 2 === 0) {
        const strip = Math.min(320, Math.round(len * 24));
        for (let s = 0; s < strip; s += 1) {
          const t = rand();
          const x = mix(a.x, b.x, t);
          const z = mix(a.z, b.z, t);
          const y = 2.5 + rand() * 0.07;
          const glow = 0.65 + rand() * 0.4;
          push({
            x,
            y,
            z,
            r: mix(accent[0], 1, 0.6) * glow,
            g: mix(accent[1], 1, 0.6) * glow,
            b: mix(accent[2], 1, 0.6) * glow,
            scale: 0.05 + rand() * 0.02,
            opacity: 0.95,
          });
        }
      }
    }
  }

  // ---- props -------------------------------------------------------------
  for (const obstacle of plan.obstacles) {
    const count = 900;
    for (let i = 0; i < count; i += 1) {
      const face = Math.floor(rand() * 4);
      const hw = obstacle.w / 2;
      const hd = obstacle.d / 2;
      let x = obstacle.x;
      let z = obstacle.z;
      if (face === 0) {
        x += (rand() - 0.5) * obstacle.w;
        z += hd;
      } else if (face === 1) {
        x += (rand() - 0.5) * obstacle.w;
        z -= hd;
      } else if (face === 2) {
        x += hw;
        z += (rand() - 0.5) * obstacle.d;
      } else {
        x -= hw;
        z += (rand() - 0.5) * obstacle.d;
      }
      const y = 0.02 + rand() * 1.05;
      const top = y > 0.98;
      const c = top
        ? shade(accent, 0.85, accent, 0.5)
        : shade([0.42, 0.46, 0.5], 0.24 + rand() * 0.16, accent, 0.1);
      push({ x, y, z, r: c[0], g: c[1], b: c[2], scale: 0.03 + rand() * 0.03, opacity: 0.86 });
    }
  }

  // ---- ceiling / ambient dust -------------------------------------------
  const dust = 1400;
  for (let i = 0; i < dust; i += 1) {
    const x = bounds.minX + rand() * bounds.width;
    const z = bounds.minZ + rand() * bounds.depth;
    if (!isPointInPolygon(plan.polygon, x, z)) continue;
    const y = 1.4 + rand() * 1.7;
    const c = shade(accent, 0.45 + rand() * 0.5, accent, 0.65);
    push({ x, y, z, r: c[0], g: c[1], b: c[2], scale: 0.012 + rand() * 0.018, opacity: 0.32 });
  }

  return { buffer: encodePly(samples), count: samples.length, samples };
}

export function encodePly(samples: SplatSample[]): ArrayBuffer {
  const props = [
    "x",
    "y",
    "z",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_0",
    "rot_1",
    "rot_2",
    "rot_3",
    "opacity",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    ...Array.from({ length: REST_COUNT }, (_, i) => `f_rest_${i}`),
  ];
  const header =
    [
      "ply",
      "format binary_little_endian 1.0",
      "comment Synthetic Gaussian splats generated by Splatwalk",
      `element vertex ${samples.length}`,
      ...props.map((p) => `property float ${p}`),
      "end_header",
      "",
    ].join("\n");
  const headerBytes = new TextEncoder().encode(header);
  const stride = props.length * 4;
  const buffer = new ArrayBuffer(headerBytes.byteLength + samples.length * stride);
  const out = new Uint8Array(buffer);
  out.set(headerBytes, 0);
  const view = new DataView(buffer, headerBytes.byteLength);

  let offset = 0;
  const write = (value: number) => {
    view.setFloat32(offset, value, true);
    offset += 4;
  };

  for (const s of samples) {
    write(s.x);
    write(s.y);
    write(s.z);
    const scale = Math.log(Math.max(0.0015, s.scale));
    write(scale);
    write(scale);
    write(scale);
    write(1);
    write(0);
    write(0);
    write(0);
    const alpha = Math.min(0.995, Math.max(0.02, s.opacity));
    write(Math.log(alpha / (1 - alpha)));
    write((s.r - 0.5) / SH_C0);
    write((s.g - 0.5) / SH_C0);
    write((s.b - 0.5) / SH_C0);
    for (let i = 0; i < REST_COUNT; i += 1) write(0);
  }

  return buffer;
}
