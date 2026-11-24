import { boolean, integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { AvatarConfig, EnvironmentConfig, FloorPlan, GoalConfig } from "@/lib/types";

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  environment: jsonb("environment").$type<EnvironmentConfig>().notNull(),
  floorplan: jsonb("floorplan").$type<FloorPlan>().notNull(),
  avatar: jsonb("avatar").$type<AvatarConfig>().notNull(),
  goal: jsonb("goal").$type<GoalConfig>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSec: real("duration_sec").notNull().default(0),
  distanceM: real("distance_m").notNull().default(0),
  orbsCollected: integer("orbs_collected").notNull().default(0),
  totalOrbs: integer("total_orbs").notNull().default(0),
  collisions: integer("collisions").notNull().default(0),
  emotesUsed: integer("emotes_used").notNull().default(0),
  cameraChanges: integer("camera_changes").notNull().default(0),
  completed: boolean("completed").notNull().default(false),
  endReason: text("end_reason"),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => sessions.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  comment: text("comment").notNull().default(""),
  role: text("role").notNull().default("tester"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
