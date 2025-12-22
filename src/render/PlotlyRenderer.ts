import Plotly from "plotly.js";
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
    const hasY2 = this.traces.some((t) => t.axis === "y2");
    const hasY1 = this.traces.some((t) => t.axis !== "y2");
    const initData: Partial<Plotly.Data>[] = this.traces.map((trace) => ({
      x: [],
      y: [],
      type: this.config.traceType,
      mode: "lines" as const,
      name: trace.name,
      line: { color: trace.color },
      yaxis: trace.axis || "y",
    }));
    const layout = this.buildLayout({ hasY1, hasY2 });
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
    if (
      !this.graphDiv ||
      !batch.timestamps.length ||
      this.traces.length === 0 ||
      batch.traces.length === 0
    ) {
      return;
    }
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
    const hasY2 = this.traces.some((t) => t.axis === "y2");
    const hasY1 = this.traces.some((t) => t.axis !== "y2");
    const relayoutUpdate: Record<string, any> = {};
    relayoutUpdate["yaxis.autorange"] = true;
    relayoutUpdate["yaxis.visible"] = hasY1;
    if (hasY2) {
      relayoutUpdate["yaxis2.autorange"] = true;
      relayoutUpdate["yaxis2.visible"] = true;
    } else {
      relayoutUpdate["yaxis2.visible"] = false;
    }
    Plotly.relayout(this.graphDiv, relayoutUpdate);
  }

  private buildLayout({ hasY1, hasY2 }: { hasY1: boolean; hasY2: boolean }) {
    const layout: Partial<Plotly.Layout> = {
      showlegend: false,
      margin: { t: 10, r: 60, b: 40, l: 50 },
      xaxis: { autorange: true },
    };
    (layout as any).yaxis = {
      title: "Y1",
      autorange: true,
      visible: hasY1,
    };
    (layout as any).yaxis2 = {
      title: "Y2",
      autorange: true,
      overlaying: "y",
      side: "right",
      visible: hasY2,
    };
    return layout;
  }
}
