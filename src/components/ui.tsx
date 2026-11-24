import Link from "next/link";
import type { ReactNode } from "react";
import { polygonBounds, type FloorPlan } from "@/lib/types";

export function Logo({ withWord = true }: { withWord?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] border border-white/15 bg-white/[0.04]">
        <span className="absolute inset-0 rounded-[10px] bg-[radial-gradient(circle_at_30%_20%,rgba(201,244,91,0.5),transparent_65%)]" />
        <svg viewBox="0 0 24 24" className="relative h-4 w-4 text-[#c9f45b]" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 18.5 9.5 5l4 8.5L16.5 9 20 18.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {withWord && (
        <span className="flex flex-col leading-none">
          <span className="text-[13px] font-semibold tracking-[0.22em] text-white">SPLATWALK</span>
          <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/35">simulation studio</span>
        </span>
      )}
    </Link>
  );
}

export function TopBar({ children, back }: { children?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-[#06080b]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-5">
        <Logo />
        {back && (
          <Link href={back.href} className="ml-2 hidden items-center gap-1.5 text-xs text-white/50 transition hover:text-white sm:flex">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tint = "#c9f45b",
}: {
  label: string;
  value: string;
  sub?: string;
  tint?: string;
}) {
  return (
    <div className="panel-soft px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight" style={{ color: tint }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-tight text-white/40">{sub}</div>}
    </div>
  );
}

export function Meter({ value, tint = "#c9f45b", height = 6 }: { value: number; tint?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/10" style={{ height }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: tint }}
      />
    </div>
  );
}

export function MiniPlan({
  plan,
  tint = "#c9f45b",
  className = "",
}: {
  plan: FloorPlan;
  tint?: string;
  className?: string;
}) {
  const bounds = polygonBounds(plan.polygon);
  const pad = 1.2;
  const vb = `${bounds.minX - pad} ${bounds.minZ - pad} ${bounds.width + pad * 2} ${bounds.depth + pad * 2}`;
  const dots = Array.from({ length: 46 }, (_, i) => {
    const angle = (i / 46) * Math.PI * 2;
    const r = 0.32 + ((i * 37) % 100) / 190;
    return {
      x: bounds.cx + Math.cos(angle) * bounds.width * r * 0.5,
      z: bounds.cz + Math.sin(angle) * bounds.depth * r * 0.5,
      r: 0.04 + ((i * 13) % 7) / 90,
      o: 0.2 + ((i * 29) % 60) / 100,
    };
  });

  return (
    <svg viewBox={vb} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id={`fill-${tint.replace("#", "")}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={tint} stopOpacity="0.22" />
          <stop offset="100%" stopColor={tint} stopOpacity="0.04" />
        </linearGradient>
        <pattern id={`grid-${tint.replace("#", "")}`} width="1" height="1" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="0.02" />
        </pattern>
      </defs>
      <rect x={bounds.minX - pad} y={bounds.minZ - pad} width={bounds.width + pad * 2} height={bounds.depth + pad * 2} fill={`url(#grid-${tint.replace("#", "")})`} />
      <polygon
        points={plan.polygon.map((p) => `${p.x},${p.z}`).join(" ")}
        fill={`url(#fill-${tint.replace("#", "")})`}
        stroke={tint}
        strokeWidth="0.09"
        strokeLinejoin="round"
      />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.z} r={d.r} fill={tint} opacity={d.o} />
      ))}
      {plan.obstacles.map((o) => (
        <rect
          key={o.id}
          x={o.x - o.w / 2}
          y={o.z - o.d / 2}
          width={o.w}
          height={o.d}
          fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="0.05"
          rx={0.08}
        />
      ))}
      {plan.orbs.map((orb) => (
        <g key={orb.id}>
          <circle cx={orb.x} cy={orb.z} r="0.32" fill={tint} opacity="0.2" />
          <circle cx={orb.x} cy={orb.z} r="0.15" fill={tint} />
        </g>
      ))}
      <circle cx={plan.spawn.x} cy={plan.spawn.z} r="0.2" fill="#6fe3d2" />
      <circle cx={plan.spawn.x} cy={plan.spawn.z} r="0.42" fill="none" stroke="#6fe3d2" strokeWidth="0.07" opacity="0.7" />
    </svg>
  );
}

export function SectionHead({
  kicker,
  title,
  description,
  right,
}: {
  kicker: string;
  title: string;
  description?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="label">{kicker}</div>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/45">{description}</p>}
      </div>
      {right}
    </div>
  );
}

export function EnvBadge({ kind, source }: { kind: string; source: string }) {
  const text =
    kind === "splat"
      ? source === "upload"
        ? "uploaded .ply / .sog"
        : "generated gaussians"
      : kind === "panorama"
        ? "equirect panorama"
        : "mesh shell";
  return <span className="chip">{text}</span>;
}
