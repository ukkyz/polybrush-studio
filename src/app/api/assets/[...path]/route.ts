import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { uploadDir } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ply: "application/octet-stream",
  sog: "application/octet-stream",
  splat: "application/octet-stream",
  spz: "application/octet-stream",
  ksplat: "application/octet-stream",
  lcc2: "application/octet-stream",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params;
  if (segments.length !== 1 && segments.length !== 2) return Response.json({ error: "not_found" }, { status: 404 });
  const clean = segments.map((segment) => path.basename(segment ?? ""));
  if (clean.some((segment, index) => !segment || segment.includes("..") || segment !== segments[index])) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (clean.length === 2 && !/^[a-zA-Z0-9-]{6,48}$/.test(clean[0])) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const filePath = clean.length === 1
    ? path.join(uploadDir(), clean[0])
    : path.join(uploadDir(), clean[0], clean[1]);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(filePath);
    const ext = path.extname(clean.at(-1) ?? "").slice(1).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
}
