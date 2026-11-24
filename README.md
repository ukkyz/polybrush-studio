# PolyBrush Studio

A local-first rapid prototyping studio for **Gaussian-splat walkthrough validation**. Bring your own capture, draw the walkable floorplan, drop in a character, send testers through a task, and read the telemetry — without standing up a backend service.

> Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · PlayCanvas 2.24 · **Drizzle ORM / Drizzle Kit 1.0.0-rc.6** · SQLite (`better-sqlite3`)

---

## Quick start

```bash
npm install
npm run db:migrate   # creates .data/polybrush.sqlite (or use db:push for schema-only iteration)
npm run dev          # http://localhost:3000
```

No database server, no `DATABASE_URL`, no seed script to run manually: the dashboard seeds two demo projects with synthetic sessions and feedback on first load.

Optional configuration (see `.env.example`):

```dotenv
DATABASE_URL=polybrush.sqlite   # relative names live in .data/; absolute paths are used as-is
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next dev server with hot reload |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:generate` | Generate a versioned SQL migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply committed migrations |
| `npm run db:push` | Push the schema directly (fastest local iteration) |
| `npm run db:studio` | Browse sessions, events and feedback in Drizzle Studio |

---

## Feature map

### 1. Capture and environment

- **Splat environments**: use a generated Gaussian-splat demo scene or upload your own `.sog`, `.ply`, `.splat`, `.spz`, `.ksplat` or `.lcc2` capture. SOG is handled by PlayCanvas's native gsplat renderer.
- **Panorama environments**: upload a 2:1 equirectangular image; the app wraps it around the walkable shell.
- **Calibration controls**: sliders for splat scale, yaw and vertical offset, plus ambient light, accent tint, sky colour and an optional structural shell overlay.
- **Presets**: Corner Loft (L-shaped), Gallery Wing and Atrium Deck each ship with a matching generated splat and floorplan.
- **Bundled sample assets**: `.data/sog/office.sog` (~1M splats) and five `.glb` characters in `.data/glb/` for immediate experimentation.
- **Asset delivery**: uploads land in `.data/uploads/` and are served through `/api/assets/[name]` with a 90 MB per-file limit.

### 2. Avatar and animation

- **Procedural rig**: capsule-based articulated human with joint-driven idle, walk, run and breathing motion; three body styles (`walker`, `scout`, `orb`).
- **Custom characters**: upload a `.glb` / `.gltf` model; the studio shows the attached filename and can clear it.
- **Emotes**: Idle (`1`), Wave (`2`), Sit (`3`), Dance (`4`), Point (`5`). Emote use is counted as a telemetry event.
- **Movement tuning**: name, body/accent/visor colours, scale, speed and stride controls.
- **Cameras**: third-person chase camera or first-person view (`C`), pointer-drag orbit, wheel pitch, with first/third-person switches recorded in analytics.
- **Sample clip data**: `Visitor.glb` contains `Relaxed`, `Stroll_IP` and `WaveOnce` clips; animation wiring is described in the ADR (see below).

### 3. Walkable floorplan authoring

- **2D canvas editor** with six tools: Select/drag, +Corner, +Prop, +Marker, Spawn, Erase.
- **Polygon walkable area**, rectangular obstacles (furniture/columns), collectible scan markers and a spawn point with heading.
- **Deterministic collision**: `isWalkable()` checks the polygon, a capsule padding probe and obstacle rectangles. There is no physics engine to tune.
- **Live preview**: editing a config rebuilds the PlayCanvas preview after a short debounce, so changes are visible without leaving the studio.
- **Goal editor**: title, brief, time limit, written hypothesis, target completion rate and target average duration.

### 4. Play loop and telemetry

- **Controls**: `WASD`/arrows to move, `Shift` to run, `Space` to jump, `C` camera, `R` respawn, `E` scan probe, `1`–`5` emotes.
- **Goal loop**: collect every scan marker before the time limit; completion and timeout both finalize the session.
- **HUD**: live status, remaining time, distance, collisions, markers, pose, camera mode, FPS, position and splat count.
- **Event stream**: `session_start`, `splat_ready`/`splat_error`, `splat_generated`, `avatar_ready`/`avatar_error`, `orb_collected`, `emote`, `collision`, `jump`, `scan`, `camera_toggle`, `respawn`, `goal_complete`, `timeout` — batched to the server every 9 seconds and on exit.
- **Feedback capture**: on-session-complete modal with a 1–5 rating, tag chips, free-text comment and role; submitted to `/api/feedback`.
- **Resilient telemetry**: queue retries, `keepalive` on page exit, and best-effort failure handling so a network hiccup never blocks play.

### 5. Insights and validation

- **Dashboard**: project cards, prototype list, weighted rating, completion rate, feedback count and splash preview.
- **Project insights page**: completion rate, average duration and distance, emote count, average markers collected, event mix, session log and tester quotes.
- **Seeded validation history**: two demo prototypes include synthetic sessions and feedback so every analytics surface has data on first run.
- **Hypothesis field**: each goal config carries a written hypothesis and target completion rate / duration, making the experiment explicit before testers arrive.
- **Variant testing**: no built-in A/B assignment yet — create one project per variant and compare their insights pages.

### 6. Data and project management

- **Projects**: create from the top bar, edit in the studio, delete from the studio footer; config is a single versioned JSONB-style document in SQLite.
- **Sessions / events / feedback tables** with foreign keys and cascade deletes.
- **SQLite via Drizzle RC**: typed schema, JSON-mode text columns for config/payload/tags, timestamp-mode integers, WAL journaling and foreign keys enabled at runtime.
- **Health probe**: `GET /api/health` runs `select 1` through Drizzle.

### 7. Architecture guardrails

- `src/lib/types.ts` holds pure geometry/config rules; PlayCanvas and DB types never leak into it.
- The simulation depends on those rules, not the other way around.
- ADR [0001](docs/adr/0001-capture-avatar-floorplan-boundaries.md) records the capture / avatar / floorplan boundary decisions and the trade-offs behind them.

---

## Routes and API surface

| Route | Purpose |
| --- | --- |
| `/` | Dashboard and project list |
| `/studio/[id]` | Authoring: environment, avatar, floorplan, goal, live preview |
| `/play/[id]` | Playable simulation with telemetry and feedback |
| `/insights/[id]` | Analytics and tester feedback |
| `GET/POST /api/projects` | List/create projects (seeds demos on first GET) |
| `GET/PATCH/DELETE /api/projects/[id]` | Read/update/delete a project and its analytics |
| `POST /api/projects/[id]/sessions` | Start a session |
| `PATCH /api/sessions/[id]` | Finalize session metrics |
| `POST /api/sessions/[id]/events` | Batch telemetry events |
| `POST /api/feedback` | Submit tester feedback |
| `POST /api/upload` | Upload capture, image or model asset |
| `GET /api/assets/[name]` | Serve an uploaded asset |
| `GET /api/health` | Database health check |

---

## What changed in this iteration

- Replaced PostgreSQL/`pg` with **SQLite + `better-sqlite3`**, keeping the repository APIs intact (`repo.ts` call sites did not change).
- Upgraded to the current RC line: `drizzle-orm@1.0.0-rc.6` and `drizzle-kit@1.0.0-rc.6`.
- Rewrote `src/db/schema.ts` with `sqliteTable`, JSON-mode `text`, timestamp/boolean-mode `integer` and autoincrement primary keys.
- Added `drizzle.config.ts`, generated `drizzle/*/migration.sql`, and added `db:generate` / `db:migrate` / `db:push` / `db:studio` scripts.
- Adapted to RC API changes: raw SQL reads use `db.get()` instead of `db.execute()`, and the driver is constructed with `drizzle({ client })`.
- Added this README as the single feature/validation reference.

---

## Known limits (intentional for a prototype)

- SQLite is a single local file: great for one-machine prototypes, not for multi-instance/serverless production. Uploads are also local to `.data/uploads/`.
- `kind: "mesh"` is selectable in the studio UI but has no environment renderer yet; it falls back to the walkable shell.
- Uploaded GLBs are rendered statically until an animation state graph is wired (see the ADR). Only `Visitor.glb` of the bundled models has clips.
- Floorplans are authored on a blank 2D grid; capture-to-floorplan calibration and attribution metadata are ADR follow-ups. The bundled SOG is CC BY and requires crediting its author.
- Movement is 2D with a simple jump arc; no stairs or multi-level walkable areas.
- `npm run lint` still reports pre-existing `react-hooks/refs` errors in the canvas components (`FloorplanEditor`, `SimCanvas`, `StudioClient`); `typecheck` and `build` are clean.

---

## Recap, insight and retrospection

**Recap.** The project already had the full validation loop — capture, authoring, play, telemetry, feedback, insights — before this change. This iteration removed the infrastructure tax: `npm install && npm run db:migrate && npm run dev` is now enough to exercise the entire loop, with seeded data on first paint. Everything in the feature map above is reachable from the running app; the only functional gap introduced by the database swap was the health probe's raw-SQL call, which now uses the RC `db.get()` API.

**Insight.** A README that enumerates features is more than documentation here — it is the prototype's contract with its testers. It states the hypothesis, the measurable targets (completion rate, duration, markers), and exactly which events prove a behaviour happened. Switching to SQLite sharpened that contract: because the database is a file next to the code, a tester can clone, run and inspect the same evidence without provisioning anything. The RC upgrade was worth doing now rather than later because the API surface changed in ways that would have compounded with every new query (`db.execute` → `db.get`, driver construction shape, config keys).

**Retrospection.** What went well: the schema rewrite was mechanical because `repo.ts` never contained SQL — only Drizzle query builders — so no business logic changed. Typecheck, migration apply and production build all pass. What we traded away: PostgreSQL's concurrency, server-side durability and JSONB querying, in exchange for zero-setup iteration. That is the right trade today, but it becomes wrong the moment several testers hit a hosted instance simultaneously; the exit path is a libSQL/Turso endpoint with the same Drizzle dialect, or restoring Postgres before public launch. Next priorities, in the ADR's order: capture calibration underlay, an animated avatar rig adapter, and object-backed asset storage.
