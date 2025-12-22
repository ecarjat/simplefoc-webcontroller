export type MetricsSnapshot = {
  ingestSamplesPerSec: number;
  renderFps: number;
  parseErrors: number;
  droppedSamples: number;
  dropEvents: number;
  bufferUtilization: number;
  lastUpdateTs: number;
};

const ewma = (prev: number, sample: number, alpha: number) =>
  prev === 0 ? sample : prev * (1 - alpha) + sample * alpha;

export class Metrics {
  private ingestSamplesPerSec = 0;
  private renderFps = 0;
  private parseErrors = 0;
  private droppedSamples = 0;
  private dropEvents = 0;
  private bufferUtilization = 0;
  private lastRender = performance.now();
  private lastIngest = performance.now();

  trackIngest(samples: number) {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastIngest);
    const rate = (samples * 1000) / dt;
    this.ingestSamplesPerSec = ewma(this.ingestSamplesPerSec, rate, 0.2);
    this.lastIngest = now;
  }

  trackRender() {
    const now = performance.now();
    const dt = Math.max(1, now - this.lastRender);
    const fps = 1000 / dt;
    this.renderFps = ewma(this.renderFps, fps, 0.2);
    this.lastRender = now;
  }

  trackParseError() {
    this.parseErrors += 1;
  }

  updateBufferStats(dropped: number, dropEvents: number, utilization: number) {
    this.droppedSamples = dropped;
    this.dropEvents = dropEvents;
    this.bufferUtilization = utilization;
  }

  snapshot(): MetricsSnapshot {
    return {
      ingestSamplesPerSec: this.ingestSamplesPerSec,
      renderFps: this.renderFps,
      parseErrors: this.parseErrors,
      droppedSamples: this.droppedSamples,
      dropEvents: this.dropEvents,
      bufferUtilization: this.bufferUtilization,
      lastUpdateTs: performance.now(),
    };
  }
}
