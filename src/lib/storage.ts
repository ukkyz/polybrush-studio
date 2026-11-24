import path from "node:path";

export function uploadDir(): string {
  return path.join(process.cwd(), ".data", "uploads");
}
