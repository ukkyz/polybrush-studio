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

function basename(value: string): string {
  return path.posix.basename(value.replaceAll("\\", "/"));
}

async function uploadWebpObject(files: FormDataEntryValue[]) {
  const uploads = files.filter((entry): entry is File => entry instanceof File);
  if (uploads.length < 2 || uploads.length > 32) {
    return Response.json({ error: "splat_object_needs_2_to_32_files" }, { status: 400 });
  }
  const total = uploads.reduce((sum, file) => sum + file.size, 0);
  if (uploads.some((file) => file.size === 0)) return Response.json({ error: "empty_file" }, { status: 400 });
  if (total > MAX_BYTES) return Response.json({ error: "file_too_large", maxBytes: MAX_BYTES }, { status: 413 });

  const names = uploads.map((file) => basename(file.name));
  if (names.some((name) => !name || name.includes("..") || !/^[a-zA-Z0-9._-]+$/.test(name))) {
    return Response.json({ error: "invalid_splat_object_filename" }, { status: 400 });
  }
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) {
    return Response.json({ error: "duplicate_splat_object_filename" }, { status: 400 });
  }
  if (names.some((name) => !["json", "webp"].includes(path.extname(name).slice(1).toLowerCase()))) {
    return Response.json({ error: "splat_object_accepts_json_and_webp" }, { status: 400 });
  }
  const metadataIndex = names.findIndex((name) => name.toLowerCase() === "meta.json");
  if (metadataIndex < 0) return Response.json({ error: "splat_object_meta_json_required" }, { status: 400 });

  let metadata: unknown;
  try {
    metadata = JSON.parse(await uploads[metadataIndex].text()) as unknown;
  } catch {
    return Response.json({ error: "invalid_splat_object_metadata" }, { status: 400 });
  }
  const uploaded = new Set(names.map((name) => name.toLowerCase()));
  const referenced = new Set<string>();
  const collectWebpReferences = (value: unknown) => {
    if (typeof value === "string" && value.toLowerCase().endsWith(".webp")) {
      referenced.add(basename(value).toLowerCase());
    } else if (Array.isArray(value)) {
      value.forEach(collectWebpReferences);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(collectWebpReferences);
    }
  };
  collectWebpReferences(metadata);
  const missing = [...referenced].filter((name) => !uploaded.has(name));
  if (missing.length) return Response.json({ error: "splat_object_missing_files", files: missing }, { status: 400 });

  const id = randomUUID().replaceAll("-", "").slice(0, 16);
  const dir = path.join(uploadDir(), id);
  await mkdir(dir, { recursive: true });
  for (let index = 0; index < uploads.length; index += 1) {
    await writeFile(path.join(dir, names[index]), Buffer.from(await uploads[index].arrayBuffer()));
  }
  return Response.json({
    url: `/api/assets/${id}/meta.json`,
    filename: "meta.json",
    label: "WebP splat object",
    size: total,
    format: "splat-object",
  });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const objectFiles = form.getAll("files");
    if (objectFiles.length) return await uploadWebpObject(objectFiles);

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
