import path from "node:path";
import { defineConfig } from "drizzle-kit";

const configured = process.env.DATABASE_URL?.trim() || ".data/polybrush.sqlite";
const raw = configured.startsWith("file:") ? configured.slice("file:".length) : configured;
const url = path.isAbsolute(raw) ? raw : path.join(process.cwd(), ".data", path.basename(raw));

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  verbose: true,
});
