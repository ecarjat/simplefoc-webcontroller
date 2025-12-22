export type DownsampleMode = "none" | "stride" | "minmax";

export type TelemetryConfig = {
  renderHz: number;
  expectedHz: number;
  bufferSeconds: number;
  maxPointsOnChart: number;
  maxDrainPerTick: number;
  traceType: "scattergl" | "scatter";
  downsampleMode: DownsampleMode;
  strideN: number;
  useWorker: boolean;
  dropHighWatermark: number;
  dropLowWatermark: number;
};

export const defaultTelemetryConfig: TelemetryConfig = {
  renderHz: 30,
  expectedHz: 500,
  bufferSeconds: 10,
  maxPointsOnChart: 10000,
  maxDrainPerTick: 2000,
  traceType: "scattergl",
  downsampleMode: "none",
  strideN: 1,
  useWorker: false,
  dropHighWatermark: 0.8,
  dropLowWatermark: 0.5,
};
