import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { AvatarConfig, EnvironmentConfig, FloorPlan, GoalConfig } from "../lib/types";

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  environment: text("environment", { mode: "json" }).$type<EnvironmentConfig>().notNull(),
  floorplan: text("floorplan", { mode: "json" }).$type<FloorPlan>().notNull(),
  avatar: text("avatar", { mode: "json" }).$type<AvatarConfig>().notNull(),
  goal: text("goal", { mode: "json" }).$type<GoalConfig>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  durationSec: real("duration_sec").notNull().default(0),
  distanceM: real("distance_m").notNull().default(0),
  orbsCollected: integer("orbs_collected").notNull().default(0),
  totalOrbs: integer("total_orbs").notNull().default(0),
  collisions: integer("collisions").notNull().default(0),
  emotesUsed: integer("emotes_used").notNull().default(0),
  cameraChanges: integer("camera_changes").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  endReason: text("end_reason"),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: text("payload", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .$defaultFn(() => ({})),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []),
  comment: text("comment").notNull().default(""),
  role: text("role").notNull().default("tester"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
