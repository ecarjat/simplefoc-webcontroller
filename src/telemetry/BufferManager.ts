export type SampleBatch = {
  timestamps: number[];
  values: number[][];
};

export type RenderBatch = {
  timestamps: number[];
  traces: number[][];
};

export type BufferStats = {
  utilization: number;
  droppedSamples: number;
  dropEvents: number;
  size: number;
  capacity: number;
};

export class BufferManager {
  private buffers: number[][] = [];
  private timestamps: number[] = [];
  private droppedSamples = 0;
  private dropEvents = 0;
  private readonly capacity: number;
  private readonly highWatermark: number;
  private readonly lowWatermark: number;

  constructor(
    traceCount: number,
    opts: { capacity: number; highWatermark: number; lowWatermark: number }
  ) {
    this.capacity = opts.capacity;
    this.highWatermark = opts.highWatermark;
    this.lowWatermark = opts.lowWatermark;
    this.resetBuffers(traceCount);
  }

  private resetBuffers(traceCount: number) {
    this.buffers = Array.from({ length: traceCount }, () => []);
    this.timestamps = [];
  }

  setTraceCount(traceCount: number) {
    this.resetBuffers(traceCount);
  }

  pushBatch(batch: SampleBatch) {
    if (!batch.timestamps.length) return;
    const traceCount = this.buffers.length;
    batch.timestamps.forEach((ts, idx) => {
      this.timestamps.push(ts);
      for (let t = 0; t < traceCount; t++) {
        const val =
          batch.values[t] && typeof batch.values[t][idx] === "number"
            ? batch.values[t][idx]
            : 0;
        this.buffers[t].push(val);
      }
    });
    this.enforceCapacity();
  }

  private enforceCapacity() {
    const current = this.timestamps.length;
    if (current <= this.capacity * this.highWatermark) return;
    const targetSize = Math.floor(this.capacity * this.lowWatermark);
    const removeCount = Math.max(0, current - targetSize);
    if (removeCount > 0) {
      this.dropEvents += 1;
      this.droppedSamples += removeCount;
      this.timestamps.splice(0, removeCount);
      this.buffers.forEach((buf) => buf.splice(0, removeCount));
    }
  }

  drainForRender(maxSamples: number): RenderBatch {
    if (!this.timestamps.length) return { timestamps: [], traces: [] };
    const take = Math.min(maxSamples, this.timestamps.length);
    const ts = this.timestamps.splice(0, take);
    const traces = this.buffers.map((buf) => buf.splice(0, take));
    return { timestamps: ts, traces };
  }

  getStats(): BufferStats {
    const size = this.timestamps.length;
    return {
      utilization: Math.min(1, size / this.capacity),
      droppedSamples: this.droppedSamples,
      dropEvents: this.dropEvents,
      size,
      capacity: this.capacity,
    };
  }
}
