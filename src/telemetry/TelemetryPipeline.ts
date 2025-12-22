import { BufferManager, SampleBatch } from "./BufferManager";
import { Metrics, MetricsSnapshot } from "../metrics/Metrics";
import { PlotlyRenderer, TraceDefinition } from "../render/PlotlyRenderer";
import { TelemetryConfig } from "./config";

export type PipelineHooks = {
  onMetrics?: (metrics: MetricsSnapshot) => void;
};

export class TelemetryPipeline {
  private buffer: BufferManager;
  private metrics = new Metrics();
  private renderer: PlotlyRenderer;
  private renderTimer: number | null = null;
  private config: TelemetryConfig;
  private traces: TraceDefinition[];
  private hooks: PipelineHooks;

  constructor(opts: {
    traces: TraceDefinition[];
    config: TelemetryConfig;
    renderer: PlotlyRenderer;
    hooks?: PipelineHooks;
  }) {
    this.traces = opts.traces;
    this.renderer = opts.renderer;
    this.config = opts.config;
    this.hooks = opts.hooks || {};
    const capacity = Math.max(1, Math.floor(this.config.expectedHz * this.config.bufferSeconds));
    this.buffer = new BufferManager(this.traces.length, {
      capacity,
      highWatermark: this.config.dropHighWatermark,
      lowWatermark: this.config.dropLowWatermark,
    });
  }

  attachDiv(div: Plotly.PlotlyHTMLElement) {
    this.renderer.init(div);
    this.startRenderLoop();
  }

  setTraces(traces: TraceDefinition[]) {
    this.traces = traces;
    this.buffer.setTraceCount(traces.length);
    this.renderer.setTraces(traces);
  }

  stop() {
    if (this.renderTimer) {
      clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
  }

  ingest(values: number[], timestamp: number) {
    if (values.length !== this.traces.length) {
      // pad or truncate
      const adjusted = this.traces.map((_, i) => values[i] ?? 0);
      values = adjusted;
    }
    const batch: SampleBatch = {
      timestamps: [timestamp],
      values: values.map((v) => [v]),
    };
    this.buffer.pushBatch(batch);
    this.metrics.trackIngest(1);
    this.emitMetrics();
  }

  private startRenderLoop() {
    if (this.renderTimer) return;
    const interval = Math.max(1, Math.floor(1000 / this.config.renderHz));
    this.renderTimer = window.setInterval(() => {
      const drained = this.buffer.drainForRender(this.config.maxDrainPerTick);
      if (drained.timestamps.length) {
        this.renderer.render(drained);
        const stats = this.buffer.getStats();
        this.metrics.updateBufferStats(
          stats.droppedSamples,
          stats.dropEvents,
          stats.utilization
        );
        this.metrics.trackRender();
        this.emitMetrics();
      }
    }, interval);
  }

  private emitMetrics() {
    if (this.hooks.onMetrics) {
      this.hooks.onMetrics(this.metrics.snapshot());
    }
  }
}
