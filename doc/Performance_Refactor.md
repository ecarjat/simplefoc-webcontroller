# SPEC (AMENDMENT): Refactor Existing Vite + WebSerial + Plotly Telemetry App for Smooth Streaming

## 0) Context
An existing Vite.js app currently:
- Reads telemetry from a serial device using the Web Serial API
- Parses the stream and renders charts using Plotly.js
- Feels sluggish and occasionally “hangs” for a couple of seconds

This spec defines **incremental amendments** to the existing codebase (not a greenfield rewrite) so the app matches the performance architecture described previously.

## 1) Objectives
1) Eliminate multi-second UI hangs under steady telemetry load and bursty serial input.
2) Ensure plotting is **rate-limited** and **decoupled** from serial ingest.
3) Bound memory and prevent runaway arrays.
4) Use Plotly’s **streaming fast path** (`extendTraces`) and WebGL traces (`scattergl`) where appropriate.
5) Add observability so we can prove improvements and catch regressions.

## 2) Key Changes (High Level)
### 2.1 Decouple: Ingest / Parse / Buffer / Render
**Current likely problem:** serial loop parses and updates Plotly in the same tick (or too often).
**Change:** Introduce a buffering layer and a render loop:
- Serial ingest runs as fast as it needs to.
- Parsing emits batches into a bounded buffer.
- Rendering runs at a fixed cadence (default 30 Hz) and drains from buffers.

### 2.2 Bounded buffers + drop policy (backpressure)
**Change:** implement ring buffer(s) with:
- Capacity based on `expectedHz * bufferSeconds`
- High/low watermark drop policy: drop oldest until buffer returns below low watermark

### 2.3 Plotly streaming updates only
**Change:** after initial `Plotly.newPlot`, updates must use:
- `Plotly.extendTraces(gd, update, traceIndices, maxPointsOnChart)`
Prohibit:
- calling `newPlot()` repeatedly
- calling `Plotly.react()` on every tick
- frequent `relayout` (allowed only at low frequency if rolling window mode is enabled)

### 2.4 Optional Worker-based parsing
If parsing is non-trivial (JSONL, many channels, heavy transforms), move decode+parse to a Worker.

## 3) Constraints / Compatibility
- Must integrate into the existing Vite app (TypeScript if already used).
- Must preserve existing UI and chart appearance as much as possible.
- Must not change device firmware/protocol unless explicitly enabled (binary protocol is optional, future).

## 4) Implementation Plan (Amend Existing Code)
### 4.1 Identify Existing Responsibilities
Codex agent should locate:
- Where Web Serial `port.readable.getReader()` loop lives
- Where decoding/parsing happens
- Where Plotly is updated (calls to `newPlot`, `react`, `extendTraces`, `relayout`)
- Where telemetry arrays are accumulated (likely unbounded arrays)

Deliverable: a short “map” in comments or doc:
- File path → responsibilities → key functions

### 4.2 Introduce a `TelemetryPipeline` (Orchestrator) Without Breaking UI
Add a new module (or adapt existing) that becomes the single integration point:

**New / amended module**: `src/telemetry/TelemetryPipeline.ts`
Responsibilities:
- Manage lifecycle: `start()`, `stop()`, `connect()`, `disconnect()`
- Own BufferManager instance
- Own PlotlyRenderer instance
- Own Metrics instance
- Optionally own a Worker instance

The existing UI should call into `TelemetryPipeline` rather than directly updating Plotly from the serial reader.

### 4.3 Amend Serial Reader to Be “Ingest Only”
**Current behavior to remove:** any Plotly calls from the serial read loop; avoid heavy parsing on main thread if possible.

**Target behavior:**
- Read `Uint8Array` chunks continuously
- Immediately pass chunks to:
  - Worker (preferred) OR
  - incremental line decoder on main thread
- No chart updates here
- Minimal allocations

### 4.4 Replace line parsing strategy with incremental decode
If current code does something like:
- concatenates strings repeatedly
- uses `bigString.split('\n')` frequently

Replace with incremental line extraction:
- Maintain `carry` string for incomplete final line
- Extract complete lines in a loop
- Parse line → push into batch arrays
- Emit batch to BufferManager

### 4.5 Add BufferManager with ring buffers + backpressure
**New module**: `src/telemetry/BufferManager.ts` (or amend existing)
Responsibilities:
- Maintain bounded buffers (shared timestamp + per-channel y buffers)
- Provide methods:
  - `pushBatch(batch: SampleBatch): void`
  - `drainForRender(maxN: number): RenderBatch` (returns arrays ready for Plotly)
  - `getStats(): BufferStats`

Backpressure policy (mandatory):
- If utilization > `dropHighWatermark` (default 0.8)
  - drop oldest until utilization <= `dropLowWatermark` (default 0.5)
- Track counters: droppedSamples, dropEvents

### 4.6 Add PlotlyRenderer with throttled render loop
**New module**: `src/render/PlotlyRenderer.ts` (or amend existing)
Responsibilities:
- Initialize plot once
- Run render loop at `renderHz` (default 30)
- Each tick:
  - `drainForRender(maxDrainPerTick)`
  - optionally downsample
  - `Plotly.extendTraces(...)` with `maxPointsOnChart`
- Never rebuild traces or layout per tick

Trace type update:
- Prefer `scattergl` + `mode:'lines'` for streaming telemetry.

Rolling window behavior (optional):
- Default: rely on `maxPointsOnChart` to bound plotted points.
- Optional rolling time window:
  - update `xaxis.range` at low frequency (2–5 Hz max)

### 4.7 Introduce Metrics and UI display hooks
**New module**: `src/metrics/Metrics.ts` (or amend existing)
Track:
- ingestSamplesPerSec (EWMA)
- renderFps (EWMA)
- parseErrors
- droppedSamples
- bufferUtilization
- lastUpdateTs

Expose to UI via:
- callback `onMetrics(m: MetricsSnapshot)`
- store (e.g., Zustand/Pinia/Vuex depending on framework) if already present
- minimal DOM updates (e.g., update metrics panel at 2–5 Hz)

### 4.8 Downsampling (display only)
Add config-driven downsampling in renderer:
- `downsampleMode`: `none | stride | minmax`
- Apply only to batches sent to Plotly.

Minimum: implement `stride` first (fast, simple).
Optional: implement `minmax` bucket (better visual fidelity).

### 4.9 Worker Mode (Recommended)
If enabled (`useWorker: true`):
- Create `src/worker/telemetry.worker.ts`
- Worker responsibilities:
  - accept chunks (Uint8Array) via `postMessage` (transferable)
  - decode lines, parse, emit SampleBatch back
Main thread:
- On message, call `BufferManager.pushBatch(...)`

Worker must be optional and gracefully disabled if unsupported.

## 5) Configuration (Centralize Existing Knobs)
Add / amend a config object used across pipeline:
- `renderHz` (default 30)
- `expectedHz` (default 500)
- `bufferSeconds` (default 10)
- `maxPointsOnChart` (default 10000)
- `maxDrainPerTick` (default 2000)
- `traceType` (`scattergl`)
- `downsampleMode` (`none|stride|minmax`)
- `strideN` (default 1)
- `useWorker` (default true)
- `dropHighWatermark` (0.8)
- `dropLowWatermark` (0.5)

Codex agent must integrate with any existing settings system rather than invent a parallel one.

## 6) Prohibited Patterns (Must Remove / Refactor)
Codex agent must search for and eliminate in hot paths:
- Plotly updates inside serial read loop
- `Plotly.newPlot()` being called repeatedly after initial setup
- `Plotly.react()` called at high frequency (per sample or per chunk)
- Unbounded growth arrays (push forever)
- frequent `layout` changes per tick (autorange/relayout each sample)
- heavy string splitting or JSON parsing in the main thread at high rate (unless worker)

## 7) Acceptance Criteria (Regression Proof)
### 7.1 No UI Hangs
- Under steady ingest (e.g., 1000 samples/sec, 4 channels):
  - UI remains responsive (no freezes > 100ms)
  - render stable at configured `renderHz` (±20%)
  - memory stable (no unbounded growth)

### 7.2 Backpressure Works
- Under overload/burst:
  - droppedSamples increases
  - chart remains live
  - app does not stall “catching up”

### 7.3 Plotly Update Path
- Verify by code inspection:
  - After initialization, only `extendTraces` is used for streaming
  - No repeated newPlot/react loops

### 7.4 Observability Visible
- Metrics panel shows:
  - ingest rate, render rate, buffer utilization, dropped count

## 8) Concrete Codex Tasks (Ordered)
1) **Audit & Map**: identify where serial read, parse, and plot updates occur; list file paths and functions.
2) **Introduce Pipeline**: create `TelemetryPipeline` and route existing UI calls through it.
3) **Refactor Serial Read Loop**: remove direct plot updates; output raw chunks.
4) **Implement/Integrate LineDecoder + Parser**: incremental decoding; batch outputs.
5) **Implement BufferManager**: ring buffers, backpressure.
6) **Refactor Plotly Updates**: init once, stream via `extendTraces`, switch to `scattergl`.
7) **Add Render Loop**: throttle to `renderHz`; drain + extend.
8) **Add Metrics**: counters + UI display at low frequency.
9) **Add Optional Worker**: move decode+parse off main thread (behind config flag).
10) **Load Test Harness**: add a synthetic telemetry generator to validate performance without hardware (dev-only).

## 9) Deliverables (Amendments)
- Modified existing files to remove prohibited patterns.
- New files added only as needed:
  - `src/telemetry/TelemetryPipeline.ts`
  - `src/telemetry/BufferManager.ts`
  - `src/render/PlotlyRenderer.ts`
  - `src/metrics/Metrics.ts`
  - `src/worker/telemetry.worker.ts` (optional)
- Minimal UI/logic changes to wire connect/disconnect and show metrics.

## Current implementation map (post-refactor)
- `src/simpleFoc/serial.ts`: WebSerial open/close, ASCII line decoder; ingest-only (no plotting).
- `src/components/MotorMonitorGraph.tsx`: telemetry selection UI, colors, rate; forwards telemetry to pipeline; hosts Plotly container.
- `src/telemetry/TelemetryPipeline.ts`: orchestrator owning buffer, renderer, metrics; runs throttled render loop.
- `src/telemetry/BufferManager.ts`: bounded ring buffers with drop watermarks and drop counters.
- `src/render/PlotlyRenderer.ts`: one-time Plotly init and streaming updates via `extendTraces` (`scattergl`).
- `src/metrics/Metrics.ts`: EWMA ingest/render stats, dropped counters.
- `src/telemetry/config.ts`: centralized performance knobs (renderHz, expectedHz, bufferSeconds, max points, downsample mode, watermarks).

## 10) Notes for Codex Agent
- Prefer minimal diffs: keep existing app structure, routing, and state approach.
- Make performance improvements measurable (metrics + optional dev test generator).
- Ensure clean shutdown:
  - stop render loop
  - cancel reader
  - release locks
  - close port
- Keep logs rate-limited (avoid console spam which also slows the UI).
