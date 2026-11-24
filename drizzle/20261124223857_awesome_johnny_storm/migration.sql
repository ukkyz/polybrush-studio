CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_events_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_events_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`session_id` integer,
	`rating` integer NOT NULL,
	`tags` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'tester' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_feedback_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_feedback_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`environment` text NOT NULL,
	`floorplan` text NOT NULL,
	`avatar` text NOT NULL,
	`goal` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`project_id` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`duration_sec` real DEFAULT 0 NOT NULL,
	`distance_m` real DEFAULT 0 NOT NULL,
	`orbs_collected` integer DEFAULT 0 NOT NULL,
	`total_orbs` integer DEFAULT 0 NOT NULL,
	`collisions` integer DEFAULT 0 NOT NULL,
	`emotes_used` integer DEFAULT 0 NOT NULL,
	`camera_changes` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`end_reason` text,
	CONSTRAINT `fk_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
