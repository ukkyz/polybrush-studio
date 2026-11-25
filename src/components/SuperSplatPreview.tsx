"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  filename: string;
  pitch: number;
  yaw: number;
  roll: number;
  x: number;
  y: number;
  z: number;
  scale: number;
};

/** High-fidelity capture inspection using PlayCanvas's official SuperSplat viewer. */
export default function SuperSplatPreview({ url, filename, pitch, yaw, roll, x, y, z, scale }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Awaited<ReturnType<typeof import("@playcanvas/supersplat-viewer/viewer").createViewer>> | null>(null);
  const [status, setStatus] = useState("Starting SuperSplat viewer…");
  const [error, setError] = useState("");
  const [viewerReady, setViewerReady] = useState(false);
  const transformRef = useRef({ pitch, yaw, roll, x, y, z, scale });

  useEffect(() => {
    transformRef.current = { pitch, yaw, roll, x, y, z, scale };
  }, [pitch, yaw, roll, x, y, z, scale]);

  useEffect(() => {
    let cancelled = false;
    let detachLoaded: (() => void) | undefined;
    const start = async () => {
      const container = containerRef.current;
      if (!container) return;
      try {
        const { createViewer } = await import("@playcanvas/supersplat-viewer/viewer");
        if (cancelled) return;
        const viewer = await createViewer({
          container,
          contentUrl: url,
          contentFilename: filename,
          settings: {},
          ui: false,
          hpr: true,
          fullload: true,
          renderer: "webgpu",
        });
        if (cancelled) {
          viewer.destroy();
          return;
        }
        viewerRef.current = viewer;
        const applyOrientation = () => {
          if (!viewer.state.loaded) return;
          const entity = viewer.app.root.findByName("gsplat");
          if (!entity) return;
          const ext = filename.toLowerCase().split(".").pop();
          const transform = transformRef.current;
          // Match SuperSplat's format-aware up-axis correction, then layer Studio's
          // editable Euler adjustments on top of that canonical orientation.
          const basePitch = ext === "lcc2" ? 270 : 0;
          const baseRoll = ext === "spz" ? 0 : 180;
          entity.setLocalEulerAngles(basePitch + transform.pitch, transform.yaw, baseRoll + transform.roll);
          entity.setLocalPosition(transform.x, transform.y, transform.z);
          entity.setLocalScale(transform.scale, transform.scale, transform.scale);
          viewer.state.quality = viewer.state.qualityAvailable.includes("max")
            ? "max"
            : viewer.state.qualityAvailable.at(-1) ?? "default";
          viewer.frameScene();
          setViewerReady(true);
          setStatus("High-quality capture ready · adjust orientation in Studio");
        };
        if (viewer.state.loaded) applyOrientation();
        else {
          const onLoaded = () => applyOrientation();
          viewer.events.on("loaded:changed", onLoaded);
          detachLoaded = () => viewer.events.off("loaded:changed", onLoaded);
          setStatus("Loading full capture detail…");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load the capture in SuperSplat.");
          setStatus("Viewer unavailable");
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      detachLoaded?.();
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [url, filename]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerReady || !viewer || !viewer.state.loaded) return;
    const entity = viewer.app.root.findByName("gsplat");
    if (!entity) return;
    const ext = filename.toLowerCase().split(".").pop();
    entity.setLocalEulerAngles(ext === "lcc2" ? 270 + pitch : pitch, yaw, (ext === "spz" ? 0 : 180) + roll);
    entity.setLocalPosition(x, y, z);
    entity.setLocalScale(scale, scale, scale);
  }, [filename, pitch, yaw, roll, x, y, z, scale, viewerReady]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070c11]">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
        <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-white/65">{status}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/35">SuperSplat · full LOD</span>
      </div>
      {error && <div className="absolute inset-x-3 top-3 rounded-lg border border-rose-300/20 bg-black/70 p-3 text-xs text-rose-200">{error}</div>}
    </div>
  );
}
