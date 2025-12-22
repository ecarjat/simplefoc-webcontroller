import Plotly from "plotly.js-dist-min";
import { DownsampleMode, TelemetryConfig } from "../telemetry/config";
import { RenderBatch } from "../telemetry/BufferManager";

export type TraceDefinition = {
  name: string;
  color: string;
  axis?: "y" | "y2";
};

type RendererOptions = {
  config: TelemetryConfig;
  traces: TraceDefinition[];
  maxPointsOnChart?: number;
};

const downsampleStride = (values: number[], stride: number) => {
  if (stride <= 1) return values;
  const result: number[] = [];
  for (let i = 0; i < values.length; i += stride) {
    result.push(values[i]);
  }
  return result;
};

export class PlotlyRenderer {
  private graphDiv: Plotly.PlotlyHTMLElement | null = null;
  private traces: TraceDefinition[] = [];
  private config: TelemetryConfig;
  private maxPoints: number;

  constructor(opts: RendererOptions) {
    this.traces = opts.traces;
    this.config = opts.config;
    this.maxPoints = opts.maxPointsOnChart || opts.config.maxPointsOnChart;
  }

  async init(div: Plotly.PlotlyHTMLElement) {
    this.graphDiv = div;
    const initData = this.traces.map((trace, idx) => ({
      x: [],
      y: [],
      type: this.config.traceType,
      mode: "lines",
      name: trace.name,
      line: { color: trace.color },
      yaxis: trace.axis || "y",
    }));
    const layout = this.buildLayout();
    await Plotly.newPlot(div, initData, layout);
  }

  setTraces(traces: TraceDefinition[]) {
    this.traces = traces;
    if (this.graphDiv) {
      // Rebuild plot once when traces change
      this.init(this.graphDiv);
    }
  }

  render(batch: RenderBatch) {
    if (!this.graphDiv || !batch.timestamps.length) return;
    const strideN = this.config.downsampleMode === "stride" ? this.config.strideN : 1;
    const xs =
      strideN > 1 ? downsampleStride(batch.timestamps, strideN) : batch.timestamps;
    const update: any = { x: [], y: [] };
    batch.traces.forEach((vals, idx) => {
      const ys = strideN > 1 ? downsampleStride(vals, strideN) : vals;
      update.x.push(xs);
      update.y.push(ys);
    });
    Plotly.extendTraces(
      this.graphDiv,
      update,
      batch.traces.map((_, idx) => idx),
      this.maxPoints
    );
    Plotly.relayout(this.graphDiv, {
      "yaxis.autorange": true,
      "yaxis2.autorange": true,
    });
  }

  private buildLayout() {
    const layout: Partial<Plotly.Layout> = {
      showlegend: false,
      margin: { t: 10, r: 60, b: 40, l: 50 },
      xaxis: { autorange: true },
    };
    (layout as any).yaxis = {
      title: "Y1",
      autorange: true,
    };
    (layout as any).yaxis2 = {
      title: "Y2",
      autorange: true,
      overlaying: "y",
      side: "right",
    };
    return layout;
  }
}
