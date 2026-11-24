import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { uploadDir } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 90 * 1024 * 1024;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const MODEL_EXT = new Set(["glb", "gltf"]);
const SPLAT_EXT = new Set(["ply", "sog", "splat", "spz", "ksplat", "lcc2"]);

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "file_required" }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "empty_file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });
    }

    const original = file.name || "asset.bin";
    const ext = original.split(".").pop()?.toLowerCase() ?? "bin";
    const safeBase = original
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 48) || "asset";
    const stored = `${randomUUID().slice(0, 8)}-${safeBase}.${ext}`;

    const dir = uploadDir();
    await mkdir(dir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, stored), buffer);

    const format = IMAGE_EXT.has(ext)
      ? "panorama"
      : MODEL_EXT.has(ext)
        ? "model"
        : SPLAT_EXT.has(ext)
          ? "splat"
          : "unknown";

    return Response.json({
      url: `/api/assets/${stored}`,
      filename: original,
      size: buffer.byteLength,
      format,
    });
  } catch (error) {
    console.error("upload failed", error);
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }
}
