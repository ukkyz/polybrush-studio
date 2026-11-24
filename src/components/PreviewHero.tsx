"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import type { SimStatus } from "@/lib/sim/engine";
import type { Project } from "@/lib/types";

const SimCanvas = dynamic(() => import("./SimCanvas"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-[#080d12]">
      <div className="flex flex-col items-center gap-2 text-white/40">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-[#c9f45b]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em]">booting playcanvas</span>
      </div>
    </div>
  ),
});

const STATUS_LABEL: Record<SimStatus, string> = {
  booting: "booting renderer",
  ready: "scene ready",
  splat: "gaussian splats live",
  fallback: "mesh fallback",
  error: "renderer offline",
};

export default function PreviewHero({ project }: { project: Project }) {
  const [status, setStatus] = useState<SimStatus>("booting");
  const [detail, setDetail] = useState("");

  return (
    <div className="panel relative overflow-hidden p-2">
      <div className="relative h-[360px] overflow-hidden rounded-[14px] border border-white/10 bg-[#070c11] sm:h-[420px]">
        <SimCanvas
          config={project}
          mode="preview"
          configKey={`hero-${project.id}-${project.updatedAt}`}
          onStatus={(next, message) => {
            setStatus(next);
            if (message) setDetail(message);
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_35%,rgba(4,7,10,0.65)_100%)]" />

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[#c9f45b]/40 bg-black/55 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-[#c9f45b] backdrop-blur">
            <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[#c9f45b]" />
            live preview
          </span>
          <span className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/60 backdrop-blur">
            {STATUS_LABEL[status]}
          </span>
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-white/45">prototype 01 / walkable splat</div>
            <div className="mt-1 text-lg font-semibold text-white">{project.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">
              <span>{project.floorplan.orbs.length} markers</span>
              <span className="text-white/20">/</span>
              <span>{project.avatar.name}</span>
              <span className="text-white/20">/</span>
              <span>{project.avatar.poses.length + 2} poses</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href={`/studio/${project.id}`} className="btn btn-ghost !px-3 !py-1.5 !text-[11px]">
              Edit studio
            </Link>
            <Link href={`/play/${project.id}`} className="btn btn-accent !px-3 !py-1.5 !text-[11px]">
              Enter simulation →
            </Link>
          </div>
        </div>

        {detail && status === "fallback" && (
          <div className="absolute left-3 right-3 top-12 rounded-md border border-amber-300/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] text-amber-100/80">
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
