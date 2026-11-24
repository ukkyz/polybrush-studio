import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

/**
 * Local-first SQLite for rapid prototyping. DATABASE_URL accepts a plain file
 * path or a `file:` URL; without it we use .data/polybrush.sqlite so a fresh
 * clone runs with zero configuration.
 */
const configured = process.env.DATABASE_URL?.trim() || ".data/polybrush.sqlite";
const rawPath = configured.startsWith("file:") ? configured.slice("file:".length) : configured;
export const databasePath = path.isAbsolute(rawPath)
  ? rawPath
  : path.join(process.cwd(), ".data", path.basename(rawPath));

mkdirSync(path.dirname(databasePath), { recursive: true });

const globalForDb = globalThis as typeof globalThis & {
  __polybrushSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__polybrushSqlite ??
  new Database(databasePath, {
    // WAL keeps reads and writes from blocking each other during playtests.
    timeout: 5000,
  });

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

if (process.env.NODE_ENV !== "production") {
  globalForDb.__polybrushSqlite = sqlite;
}

export const db = drizzle({ client: sqlite });
