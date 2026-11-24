"use client";

import { useEffect, useRef } from "react";
import { SimEngine, type HudState, type SimEventMessage, type SimStatus } from "@/lib/sim/engine";
import type { ProjectConfig } from "@/lib/types";

type Props = {
  config: ProjectConfig;
  mode: "play" | "preview";
  configKey?: string;
  className?: string;
  onHud?: (state: HudState) => void;
  onEvent?: (event: SimEventMessage) => void;
  onStatus?: (status: SimStatus, detail?: string) => void;
  onReady?: (engine: SimEngine | null) => void;
};

export default function SimCanvas({
  config,
  mode,
  configKey = "default",
  className,
  onHud,
  onEvent,
  onStatus,
  onReady,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const callbacks = useRef({ onHud, onEvent, onStatus, onReady });
  callbacks.current = { onHud, onEvent, onStatus, onReady };
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let engine: SimEngine | null = null;
    let cancelled = false;
    let observer: ResizeObserver | null = null;

    const boot = async () => {
      try {
        engine = new SimEngine({
          canvas,
          config: configRef.current,
          mode,
          onHud: (state) => callbacks.current.onHud?.(state),
          onEvent: (event) => callbacks.current.onEvent?.(event),
          onStatus: (status, detail) => callbacks.current.onStatus?.(status, detail),
        });
        await engine.start();
        if (cancelled) {
          engine.destroy();
          return;
        }
        callbacks.current.onReady?.(engine);
        observer = new ResizeObserver(() => engine?.resize());
        observer.observe(host);
      } catch (error) {
        console.error("simulation failed to start", error);
        callbacks.current.onStatus?.("error", error instanceof Error ? error.message : "WebGL initialisation failed");
      }
    };

    void boot();

    return () => {
      cancelled = true;
      observer?.disconnect();
      callbacks.current.onReady?.(null);
      engine?.destroy();
      engine = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey, mode]);

  return (
    <div ref={hostRef} className={className ?? "relative h-full w-full"}>
      <canvas key={configKey} ref={canvasRef} className="h-full w-full touch-none outline-none" />
    </div>
  );
}
