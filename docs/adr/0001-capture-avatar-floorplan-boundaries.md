# ADR 0001 — Capture, avatar and floorplan boundaries

- Status: Proposed
- Date: 2026-11-24
- Scope: `polybrush-studio` at `413abb1`

## Context — what the project actually is today

This is a Next.js 16 / React 19 prototype with four discernible contexts:

| Context | Code | Responsibility | State owner |
| --- | --- | --- | --- |
| Authoring | `src/app/studio/[id]`, `StudioClient`, `FloorplanEditor` | Tune environment, draw walkable area, choose avatar/goal | Local React state, explicit Save |
| Simulation | `src/lib/sim/engine.ts`, `sim/splat.ts`, `SimCanvas` | PlayCanvas app, camera, movement, poses, markers, HUD | `SimEngine` instance |
| Validation | `src/app/play/[id]`, session/feedback APIs, `repo.ts`, `db/schema.ts` | Session telemetry, completion metrics, feedback | Postgres via Drizzle |
| Capture asset | `api/upload`, `api/assets/[name]`, `.data/` | Accept SOG/PLY/image/GLB uploads, serve bytes | Local filesystem `.data/uploads` |

`ProjectConfig` is one JSONB blob containing environment + floorplan + avatar + goal. That is a good MVP choice: one versioned unit, cheap iteration, no migration per tuning knob. The cost is that unrelated changes share a lifecycle — moving an orb and swapping a capture both invalidate the same config and the same preview key (`studio-${id}-${JSON.stringify(previewConfig)}` in `StudioClient`). Keep it for now; the natural future seam is `WalkableArea` (geometry) vs `TaskLayer` (orbs/spawn/goal), not four microservice-style contexts.

Dependency direction is currently healthy: `lib/types.ts` holds pure geometry/config rules with no PlayCanvas import; `SimEngine` depends on those rules; the DB schema stores config as opaque JSON. Do not let renderer types leak into `ProjectConfig`.

### Claim vs implementation recap

| Claim in the request | Current reality | Gap |
| --- | --- | --- |
| "I can use my own SOG files" | `api/upload` accepts `.sog`; `api/assets` serves it; `loadEnvironmentSplat()` loads it via `app.assets.loadFromUrlAndFilename(..., "gsplat")` and applies scale/yaw/Y. SOG is natively supported by the engine since 2.11 [1](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting/), and this repo pins `playcanvas ^2.24.2`. | No calibration between capture and floorplan; no provenance/license metadata; renderer is created through legacy `new pc.Application(...)`, which does not opt into the WebGPU path that SuperSplat Viewer prefers. |
| "Fast rendering engine using supersplat-viewer" | The viewer is referenced only as inspiration; `SimEngine` uses the same PlayCanvas gsplat renderer directly. | Actually an advantage (see Decision 1). The viewer is an application, not a rendering library. Its `createViewer` builds its own canvas, camera, input and UI subtree, and exposes `app` only as an escape hatch ([API reference](https://raw.githubusercontent.com/playcanvas/supersplat-viewer/main/docs/api.md)). Two viewers in one page means two WebGL contexts, two cameras and competing key handlers. |
| "Custom animated human like the third-person tutorial" | Procedural capsule rig has joint-driven idle/walk/run and emotes. Uploaded GLB path calls `instantiateRenderEntity()` and disables the procedural visual, but never adds an `anim` component. | A rigged GLB is rendered as a static mesh. Of the five bundled GLBs, only `Visitor.glb` contains clips: `Relaxed` (3.2 s), `Stroll_IP` (1.0 s), `WaveOnce` (1.44 s). The others have zero animations. The PlayCanvas third-person tutorial couples a chase camera with input/physics; its physics assumes mesh colliders, which a Gaussian splat does not provide ([tutorial](https://developer.playcanvas.com/tutorials/third-person-controller/)). |
| "User creates a floor plan as walkable area based on the SOG" | `FloorplanEditor` edits polygon corners, rectangular obstacles, markers, spawn and heading. `isWalkable()` is the authoritative collision predicate used by `movePlayer()`. | The editor draws on a blank grid with no capture underlay. The floorplan and the capture transform are two unlinked coordinate systems, so "based on the SOG" is currently manual guesswork. No validation that spawn/orbs are walkable. |

Local evidence worth carrying forward: `.data/sog/office.sog` is a valid bundled SOG with 999,131 splats and `meta.json` bounds of roughly 13 × 12 × 12 m (axis convention must be verified before reuse). Its `license.txt` is CC BY 4.0 and requires crediting Hilo / SuperSplat — the UI currently surfaces no attribution. Also, `kind: "mesh"` is selectable in the studio but has no branch in `buildEnvironment()`; it silently falls back to the shell.

## Decisions

### 1. Keep SuperSplat Viewer out of the game runtime

Use the PlayCanvas engine's native gsplat asset, as `SimEngine` already does. Treat `supersplat-viewer` as an **authoring and QA tool**, not as the runtime engine.

- Gain: one app, one camera, one input stack; telemetry and game rules stay under our control; no iframe/`createViewer` lifecycle coupling.
- Give up: the viewer's ready-made UI, annotation tools, collision overlay and LOD orchestration. We reimplement only what the simulation needs.
- If renderer throughput becomes the bottleneck, change the **graphics device creation** in `SimEngine` (WebGPU with WebGL2 fallback), not the viewer choice. That is a local, reversible change.
- Optional bridge: serve the viewer on a separate authoring route and use `captureFrame()` to produce a top-down calibration image for the floorplan editor (`?noui`, `content=/api/assets/...`). Never call into it from the play route.

### 2. Make one calibration the contract between capture and floorplan

Introduce a `SceneCalibration` value owned by `EnvironmentConfig`:

```ts
type SceneCalibration = {
  captureBounds: { min: Point3; max: Point3 };  // read from SOG meta.json
  groundY: number;                              // floor height in capture space
  yaw: number; scale: number; offset: Point3;   // single capture -> world transform
  derivedFrom: string;                          // asset URL / hash
};
```

Rules:

1. `FloorPlan.polygon`, obstacles, orbs and spawn are authored in **the same world space** the transform produces. The existing `splatScale`/`splatYaw`/`splatY` fields become the visible controls of that transform, not separate knobs.
2. On SOG upload, parse `meta.json` bounds server-side and offer a seeded polygon near those bounds; the user refines it. Do not attempt automatic walkability inference from splats in v1.
3. Add a semi-transparent capture underlay to `FloorplanEditor` (top-down screenshot from the viewer or a projected point cloud). Keep the current blank-grid mode as fallback.
4. Validate on save: simple (non-self-intersecting) polygon, spawn and every orb pass `isWalkable()`, obstacles inside bounds. Show violations inline. Cheap, deterministic, prevents unusable published runs.
5. Store asset provenance alongside the URL: format, splat count, bounds, license, attribution string. Render attribution in the play HUD/about panel. The bundled `office.sog` already requires this.

- Gain: the floorplan finally means something physical relative to the capture; recalibration is one struct, versionable in JSONB.
- Give up: exact automatic alignment; users still eyeball a first-pass polygon. That is acceptable — the cost of a wrong auto-fit is worse than a few minutes of drawing.
- Non-goal for v1: multi-level / 2.5D walkable areas. `isWalkable()` is deliberately 2D + a vertical jump arc; raising floors forces a new collision model.

### 3. Put an adapter between game intents and avatar bodies

Extract an interface inside the simulation context:

```ts
interface AvatarRig {
  readonly root: pc.Entity;
  setLocomotion(speed: number, grounded: boolean): void; // per-frame intent
  playPose(pose: PoseId): void;                          // discrete intent
  tick(dt: number): void;
}
```

Two implementations:

- `ProceduralRig` — today's joint animation; stays the default and the fallback.
- `GlbAnimRig` — instantiate the GLB, add an `anim` component, create a small state graph (`idle` ↔ `walk`/`run`, `emote`, `jump`), assign clips from `asset.resource.animations`, and drive transitions from `setLocomotion`/`playPose`. `Visitor.glb` maps naturally: `Relaxed` → idle, `Stroll_IP` → walk, `WaveOnce` → wave. Others degrade to static with a visible "no clips found" hint in the studio.

Keep `SimEngine` emitting semantic state (`pose`, `planarSpeed`, `grounded`) and telemetry event names unchanged; the rig consumes it. From the third-person tutorial borrow **chase-camera damping and input mapping only** — not its rigid-body controller, because our collision source is `isWalkable()`, a 2D predicate over the authored floorplan. Root motion from clips, if present, must be ignored or offset back; otherwise analytics distance diverges from visual movement.

- Gain: one gameplay path, swappable bodies; third-party GLBs cannot break movement or telemetry; capability checks happen at upload time.
- Give up: a shared base class with physics-driven root motion and full IK. Not needed for a validation tool where the question is "did the tester find the marker?", not "is the gait physically perfect?".

### 4. Treat captured assets as versioned resources, not anonymous bytes

`api/upload` currently writes to `.data/uploads` with a random prefix and returns a URL. Add an `asset` manifest (DB row or JSON file) keyed by hash with `format`, `size`, `splatCount`, `bounds`, `license`, `attribution`, and `createdAt`. Projects reference the asset id plus their own transform. On Vercel, the local filesystem is ephemeral — move bytes to object storage before relying on uploads across deploys/instances. Keep the existing `/api/assets/[name]` route shape as the proxy so browser code never changes origin.

## Trade-off matrix

| Option | Gains | Gives up | Choose when |
| --- | --- | --- | --- |
| Embed SuperSplat Viewer | Rich viewer UI, annotations, built-in walk mode | One app per viewer, duplicate cameras/input, weak control over telemetry | Standalone capture review page |
| Engine gsplat directly (current, recommended) | Full control, one render loop, tiny code surface | No viewer conveniences | Any simulation/game route |
| GLB mesh / voxel collision from viewer | Geometry-derived walkability | Heavy asset pipeline; imperfect against noisy splats | Later, if manual floorplans become the bottleneck |
| 2D floorplan collision (current) | Deterministic, testable, cheap, explainable in analytics | No stairs/multi-level, approximate props | v1 and most validation runs |
| Procedural rig | Zero asset dependency, deterministic poses | Stylised, not "realistic human" | Default/fallback |
| GLB + AnimComponent via adapter | Real character animation | Clip mapping, capability validation, root-motion care | When a rigged clip set is supplied |

## Delivery sequence (thin, reversible slices)

1. **Calibration scaffold** — add `SceneCalibration` + parsing of SOG `meta.json`; seed polygon from bounds; no UI change beyond a "fit to capture" button. Accept: SOG upload produces a polygon within capture bounds.
2. **Floorplan underlay + validation** — capture image underlay, walkability checks on save, attribution display. Accept: no published project with an unwalkable spawn or orb.
3. **Rig adapter** — extract `AvatarRig`, wire `GlbAnimRig` for `Visitor.glb` clips, keep procedural fallback. Accept: walk/idle/wave visibly change; distance telemetry unchanged; static GLB shows a hint.
4. **Renderer decision** — measure FPS on a 1M-splat capture with WebGL2 vs WebGPU; only then change device creation. Accept: decision recorded as a follow-up ADR with numbers.

## Consequences / risks

- Config JSONB grows; schema-on-read needs a config version field before introducing breaking shape changes.
- `captureFrame()` underlay generation adds an offline build step; keep the blank grid fallback so authoring never blocks on the viewer.
- Asset licensing is now an explicit field; historic uploads need a backfill before public sharing.
- Do not add physics or a second camera system to `SimEngine` to satisfy the tutorial look — that would couple the validation domain to a collision model we do not have.
