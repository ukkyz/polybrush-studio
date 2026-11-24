"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { polygonBounds, uid, type FloorPlan, type Point } from "@/lib/types";

type Mode = "move" | "vertex" | "obstacle" | "orb" | "spawn" | "delete";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "move", label: "Select", hint: "Drag corners, props or markers" },
  { id: "vertex", label: "+ Corner", hint: "Click an edge to insert a corner" },
  { id: "obstacle", label: "+ Prop", hint: "Click-drag a blocked rectangle" },
  { id: "orb", label: "+ Marker", hint: "Click to drop a scan marker" },
  { id: "spawn", label: "Spawn", hint: "Click to move the spawn point" },
  { id: "delete", label: "Erase", hint: "Click a marker or prop to remove" },
];

type DragState =
  | { kind: "vertex"; index: number }
  | { kind: "obstacle"; id: string; offsetX: number; offsetZ: number }
  | { kind: "orb"; id: string }
  | { kind: "new-obstacle"; start: Point; current: Point }
  | null;

export default function FloorplanEditor({
  plan,
  onChange,
  accent = "#c9f45b",
  height = 340,
}: {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
  accent?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<Mode>("move");
  const [hover, setHover] = useState<string>("");
  const dragRef = useRef<DragState>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const sizeRef = useRef({ width: 300, height });
  const viewRef = useRef({ scale: 20, cx: 0, cz: 0, width: 300, height });

  const toScreen = useCallback((x: number, z: number) => {
    const view = viewRef.current;
    return {
      px: view.width / 2 + (x - view.cx) * view.scale,
      py: view.height / 2 + (z - view.cz) * view.scale,
    };
  }, []);

  const toWorld = useCallback((px: number, py: number) => {
    const view = viewRef.current;
    return {
      x: view.cx + (px - view.width / 2) / view.scale,
      z: view.cz + (py - view.height / 2) / view.scale,
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width, height: h } = sizeRef.current;
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    canvas.style.width = `${width}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, h);

    const current = planRef.current;
    const bounds = polygonBounds(current.polygon);
    const scale = Math.max(8, Math.min((width - 40) / Math.max(2, bounds.width + 2), (h - 40) / Math.max(2, bounds.depth + 2)));
    viewRef.current = { scale, cx: bounds.cx, cz: bounds.cz, width, height: h };

    // backdrop
    const grad = ctx.createLinearGradient(0, 0, width, h);
    grad.addColorStop(0, "#0a0f14");
    grad.addColorStop(1, "#0c1319");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, h);

    // grid
    const gridStep = scale < 22 ? 2 : 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    const minX = Math.floor(bounds.minX - 3);
    const maxX = Math.ceil(bounds.maxX + 3);
    const minZ = Math.floor(bounds.minZ - 3);
    const maxZ = Math.ceil(bounds.maxZ + 3);
    for (let x = minX; x <= maxX; x += gridStep) {
      const a = toScreen(x, minZ);
      const b = toScreen(x, maxZ);
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
    }
    for (let z = minZ; z <= maxZ; z += gridStep) {
      const a = toScreen(minX, z);
      const b = toScreen(maxX, z);
      ctx.beginPath();
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
    }

    // walkable polygon
    ctx.beginPath();
    current.polygon.forEach((p, i) => {
      const { px, py } = toScreen(p.x, p.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(201,244,91,0.065)";
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // obstacles
    for (const obstacle of current.obstacles) {
      const corner = toScreen(obstacle.x - obstacle.w / 2, obstacle.z - obstacle.d / 2);
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      const w = obstacle.w * scale;
      const d = obstacle.d * scale;
      ctx.fillRect(corner.px, corner.py, w, d);
      ctx.strokeRect(corner.px, corner.py, w, d);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("PROP", corner.px + 4, corner.py + 12);
    }

    // polygon vertices
    current.polygon.forEach((p, index) => {
      const { px, py } = toScreen(p.x, p.z);
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#0b1116";
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(`${index}`, px + 8, py - 6);
    });

    // orbs
    current.orbs.forEach((orb, index) => {
      const { px, py } = toScreen(orb.x, orb.z);
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(201,244,91,0.18)";
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.font = "bold 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), px, py + 3);
      ctx.textAlign = "left";
    });

    // spawn
    const spawn = toScreen(current.spawn.x, current.spawn.z);
    const heading = (current.spawnHeading * Math.PI) / 180;
    const fx = -Math.sin(heading);
    const fz = -Math.cos(heading);
    ctx.beginPath();
    ctx.moveTo(spawn.px, spawn.py);
    ctx.lineTo(spawn.px + fx * 26, spawn.py + fz * 26);
    ctx.strokeStyle = "#6fe3d2";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spawn.px, spawn.py, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#6fe3d2";
    ctx.fill();

    const newObstacle = dragRef.current;
    if (newObstacle && newObstacle.kind === "new-obstacle") {
      const a = toScreen(newObstacle.start.x, newObstacle.start.z);
      const b = toScreen(newObstacle.current.x, newObstacle.current.z);
      ctx.strokeStyle = "rgba(111,227,210,0.9)";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(a.px, b.px), Math.min(a.py, b.py), Math.abs(b.px - a.px), Math.abs(b.py - a.py));
      ctx.setLineDash([]);
    }
  }, [accent, toScreen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const resize = () => {
      const width = host.clientWidth || 300;
      sizeRef.current = { width, height };
      draw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => observer.disconnect();
  }, [draw, height]);

  useEffect(() => {
    draw();
  }, [draw, plan]);

  const snap = (value: number) => Math.round(value * 4) / 4;

  const pointerPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return toWorld(event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = pointerPos(event);
    const current = planRef.current;
    const view = viewRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (mode === "spawn") {
      if (current.polygon.length) {
        const heading = (Math.atan2(-(world.x - current.spawn.x), -(world.z - current.spawn.z)) * 180) / Math.PI;
        onChange({ ...current, spawn: { x: snap(world.x), z: snap(world.z) }, spawnHeading: Math.round(heading) });
      }
      return;
    }
    if (mode === "orb") {
      onChange({
        ...current,
        orbs: [
          ...current.orbs,
          { id: uid("orb"), label: `Marker ${current.orbs.length + 1}`, x: snap(world.x), z: snap(world.z) },
        ],
      });
      return;
    }
    if (mode === "obstacle") {
      dragRef.current = { kind: "new-obstacle", start: { x: snap(world.x), z: snap(world.z) }, current: { x: world.x, z: world.z } };
      return;
    }
    if (mode === "vertex") {
      let bestIndex = -1;
      let bestDist = Infinity;
      let bestPoint: Point | null = null;
      for (let i = 0; i < current.polygon.length; i += 1) {
        const a = current.polygon[i];
        const b = current.polygon[(i + 1) % current.polygon.length];
        const abx = b.x - a.x;
        const abz = b.z - a.z;
        const lenSq = abx * abx + abz * abz || 1;
        const t = Math.max(0, Math.min(1, ((world.x - a.x) * abx + (world.z - a.z) * abz) / lenSq));
        const px = a.x + abx * t;
        const pz = a.z + abz * t;
        const dist = Math.hypot(world.x - px, world.z - pz);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
          bestPoint = { x: snap(px), z: snap(pz) };
        }
      }
      if (bestPoint && bestDist * view.scale < 22) {
        const polygon = [...current.polygon];
        polygon.splice(bestIndex + 1, 0, bestPoint);
        onChange({ ...current, polygon });
      }
      return;
    }
    if (mode === "delete") {
      const orb = current.orbs.find((o) => Math.hypot(o.x - world.x, o.z - world.z) * view.scale < 14);
      if (orb) {
        onChange({ ...current, orbs: current.orbs.filter((o) => o.id !== orb.id) });
        return;
      }
      const obstacle = [...current.obstacles]
        .reverse()
        .find((o) => Math.abs(world.x - o.x) < o.w / 2 && Math.abs(world.z - o.z) < o.d / 2);
      if (obstacle) {
        onChange({ ...current, obstacles: current.obstacles.filter((o) => o.id !== obstacle.id) });
        return;
      }
      if (current.polygon.length > 3) {
        let nearestIndex = -1;
        let nearestDist = Infinity;
        current.polygon.forEach((p, i) => {
          const dist = Math.hypot(p.x - world.x, p.z - world.z);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIndex = i;
          }
        });
        if (nearestDist * view.scale < 16) {
          onChange({ ...current, polygon: current.polygon.filter((_, i) => i !== nearestIndex) });
        }
      }
      return;
    }

    // move mode targets
    let nearestVertex = -1;
    let nearestDist = Infinity;
    current.polygon.forEach((p, i) => {
      const dist = Math.hypot(p.x - world.x, p.z - world.z) * view.scale;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestVertex = i;
      }
    });
    if (nearestDist < 16) {
      dragRef.current = { kind: "vertex", index: nearestVertex };
      return;
    }
    const orb = current.orbs.find((o) => Math.hypot(o.x - world.x, o.z - world.z) * view.scale < 14);
    if (orb) {
      dragRef.current = { kind: "orb", id: orb.id };
      return;
    }
    const obstacle = current.obstacles.find((o) => Math.abs(world.x - o.x) < o.w / 2 && Math.abs(world.z - o.z) < o.d / 2);
    if (obstacle) {
      dragRef.current = { kind: "obstacle", id: obstacle.id, offsetX: world.x - obstacle.x, offsetZ: world.z - obstacle.z };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const world = pointerPos(event);
    const current = planRef.current;
    const view = viewRef.current;
    setHover(`${world.x.toFixed(2)}m · ${world.z.toFixed(2)}m`);
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === "vertex") {
      const polygon = current.polygon.map((p, i) => (i === drag.index ? { x: snap(world.x), z: snap(world.z) } : p));
      onChange({ ...current, polygon });
    } else if (drag.kind === "orb") {
      const orbs = current.orbs.map((o) => (o.id === drag.id ? { ...o, x: snap(world.x), z: snap(world.z) } : o));
      onChange({ ...current, orbs });
    } else if (drag.kind === "obstacle") {
      const obstacles = current.obstacles.map((o) =>
        o.id === drag.id
          ? { ...o, x: snap(world.x - drag.offsetX), z: snap(world.z - drag.offsetZ) }
          : o,
      );
      onChange({ ...current, obstacles });
    } else if (drag.kind === "new-obstacle") {
      dragRef.current = { ...drag, current: { x: world.x, z: world.z } };
      draw();
    }
    void view;
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (drag && drag.kind === "new-obstacle") {
      const current = planRef.current;
      const x1 = drag.start.x;
      const z1 = drag.start.z;
      const x2 = snap(drag.current.x);
      const z2 = snap(drag.current.z);
      const w = Math.abs(x2 - x1);
      const d = Math.abs(z2 - z1);
      if (w > 0.4 && d > 0.4) {
        onChange({
          ...current,
          obstacles: [
            ...current.obstacles,
            { id: uid("ob"), label: `Prop ${current.obstacles.length + 1}`, x: (x1 + x2) / 2, z: (z1 + z2) / 2, w, d },
          ],
        });
      }
    }
    dragRef.current = null;
    draw();
  };

  const bounds = polygonBounds(plan.polygon);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0f14] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide transition ${
              mode === m.id
                ? "bg-[#c9f45b] text-[#080b0f]"
                : "border border-white/10 text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div ref={hostRef} className="relative overflow-hidden rounded-xl border border-white/5">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair"
          style={{ height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/50 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white/50">
          {hover || MODES.find((m) => m.id === mode)?.hint}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
        <span>
          {bounds.width.toFixed(1)} × {bounds.depth.toFixed(1)} m · {plan.orbs.length} markers · {plan.obstacles.length} props
        </span>
        <span>{plan.polygon.length} corners · grid 0.25 m</span>
      </div>
    </div>
  );
}
