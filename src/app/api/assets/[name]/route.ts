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
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
};

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const clean = path.basename(name ?? "");
  if (!clean || clean.includes("..")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const filePath = path.join(uploadDir(), clean);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const data = await readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
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
