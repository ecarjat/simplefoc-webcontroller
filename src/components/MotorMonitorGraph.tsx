import {
  Checkbox,
  Stack,
  TextField,
  FormControlLabel,
  Box,
  Typography,
  Button,
  Tooltip,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
import Plotly from "plotly.js";
import { useSerialLineEvent } from "../lib/useSerialLineEvent";
import { useSerialPort } from "../lib/serialContext";
import {
  REGISTER_BY_NAME,
  REGISTER_DEFINITIONS,
  RegisterDefinition,
} from "../lib/registerMap";
import { TelemetryData } from "../lib/serialTypes";
import { defaultTelemetryConfig } from "../telemetry/config";
import { PlotlyRenderer } from "../render/PlotlyRenderer";
import { TelemetryPipeline } from "../telemetry/TelemetryPipeline";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { ResizableBox } from "react-resizable";
import "react-resizable/css/styles.css";

const COLORS = [
  "#e53935",
  "#1e88e5",
  "#43a047",
  "#fb8c00",
  "#8e24aa",
  "#00897b",
  "#6d4c41",
];

type TraceConfig = {
  id: number;
  name: string;
  color: string;
  enabled: boolean;
  axis: "y" | "y2";
  tooltip?: string;
};

export const MotorMonitorGraph = ({ motorKey }: { motorKey: string }) => {
  const serial = useSerialPort();
  const plotContainerRef = useRef<HTMLDivElement | null>(null);
  const plotDivRef = useRef<Plotly.PlotlyHTMLElement | null>(null);
  const rendererRef = useRef<PlotlyRenderer | null>(null);
  const pipelineRef = useRef<TelemetryPipeline | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [frequencyHz, setFrequencyHz] = useState(50);
  const [plotHeight, setPlotHeight] = useState(400);
  const defaultTracesRef = useRef<TraceConfig[]>([
    {
      id: REGISTER_BY_NAME.TARGET.id,
      name: "TARGET",
      color: COLORS[0],
      enabled: true,
      axis: "y",
    },
    {
      id: REGISTER_BY_NAME.POSITION.id,
      name: "POSITION",
      color: COLORS[1],
      enabled: true,
      axis: "y",
    },
    {
      id: REGISTER_BY_NAME.SENSOR_ANGLE.id,
      name: "SENSOR_ANGLE",
      color: COLORS[2],
      enabled: true,
      axis: "y2",
    },
    {
      id: REGISTER_BY_NAME.VELOCITY.id,
      name: "VELOCITY",
      color: COLORS[3],
      enabled: true,
      axis: "y2",
    },
  ]);
  const [traces, setTraces] = useState<TraceConfig[]>(defaultTracesRef.current);

  const { primaryOptions, velOptions, angOptions, otherOptions } = useMemo(() => {
    const filterNumeric = (def: RegisterDefinition) => {
      if (def.name.startsWith("TELEMETRY")) return false;
      if (typeof def.encoding === "string") {
        return def.encoding === "f32" || def.encoding === "u32";
      }
      return def.encoding.kind === "composite";
    };
    const defs = REGISTER_DEFINITIONS.filter(filterNumeric);
    const makeOption = (def: RegisterDefinition, idx: number): TraceConfig => ({
      id: def.id,
      name: def.name,
      color: COLORS[idx % COLORS.length],
      enabled: defaultTracesRef.current.some((t) => t.id === def.id),
      axis: "y",
      tooltip: def.tooltip,
    });

    const primaryIds = [
      REGISTER_BY_NAME.TARGET.id,
      REGISTER_BY_NAME.POSITION.id,
      REGISTER_BY_NAME.SENSOR_ANGLE.id,
      REGISTER_BY_NAME.VELOCITY.id,
    ];
    const velIds = [
      REGISTER_BY_NAME.VEL_PID_P?.id,
      REGISTER_BY_NAME.VEL_PID_I?.id,
      REGISTER_BY_NAME.VEL_PID_D?.id,
      REGISTER_BY_NAME.VEL_PID_RAMP?.id,
      REGISTER_BY_NAME.VEL_PID_LIM?.id,
      REGISTER_BY_NAME.VEL_LPF_T?.id,
    ].filter(Boolean) as number[];
    const angIds = [
      REGISTER_BY_NAME.ANG_PID_P?.id,
      REGISTER_BY_NAME.ANG_PID_I?.id,
      REGISTER_BY_NAME.ANG_PID_D?.id,
      REGISTER_BY_NAME.ANG_PID_RAMP?.id,
      REGISTER_BY_NAME.ANG_PID_LIM?.id,
      REGISTER_BY_NAME.ANG_LPF_T?.id,
    ].filter(Boolean) as number[];

    const primaryDefs = defs.filter((d) => primaryIds.includes(d.id));
    const velDefs = defs.filter((d) => velIds.includes(d.id));
    const angDefs = defs.filter((d) => angIds.includes(d.id));
    const otherDefs = defs.filter(
      (d) =>
        !primaryIds.includes(d.id) && !velIds.includes(d.id) && !angIds.includes(d.id)
    );

    return {
      primaryOptions: primaryDefs.map(makeOption),
      velOptions: velDefs.map(makeOption),
      angOptions: angDefs.map(makeOption),
      otherOptions: otherDefs.map(makeOption),
    };
  }, []);

  // Configure telemetry in binary mode whenever trace selection changes
  useEffect(() => {
    if (!serial || serial.mode !== "binary") return;
    const enabled = traces.filter((t) => t.enabled);
    const registers = enabled.map((t) => ({ motor: Number(motorKey), register: t.id }));
    serial.configureTelemetry?.(registers, frequencyHz);
  }, [serial, traces, frequencyHz, motorKey]);

  const perfConfig = useMemo(
    () => ({
      ...defaultTelemetryConfig,
      traceType: "scatter" as const,
      renderHz: 120,
      bufferSeconds: 0.25,
      maxDrainPerTick: 50,
      maxPointsOnChart: 1500,
    }),
    []
  );

  useEffect(() => {
    if (plotDivRef.current) {
      Plotly.Plots.resize(plotDivRef.current);
    }
  }, [plotHeight]);

  const renderTraceRow = (
    opt: TraceConfig,
    idx: number,
    tracesState: TraceConfig[],
    setTracesState: (updater: (prev: TraceConfig[]) => TraceConfig[]) => void
  ) => {
    const current =
      tracesState.find((t) => t.id === opt.id) ||
      ({
        ...opt,
        color: opt.color || COLORS[idx % COLORS.length],
        enabled: false,
        tooltip: opt.tooltip,
      } as TraceConfig);
    const tooltip = current.tooltip ?? opt.tooltip;
    return (
      <Stack
        key={opt.id}
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ width: "100%" }}
      >
        <Typography
          variant="body2"
          sx={{ width: 32, color: current.color, fontWeight: 600 }}
        >
          {current.name.slice(0, 3)}
        </Typography>
        <Tooltip title={tooltip || ""} disableHoverListener={!tooltip}>
          <FormControlLabel
            sx={{ flex: 1 }}
            control={
              <Checkbox
                checked={current.enabled}
                onChange={(e) =>
                  setTracesState((prev) => {
                    const next = [...prev];
                    const existingIndex = next.findIndex((t) => t.id === opt.id);
                    if (existingIndex >= 0) {
                      next[existingIndex] = {
                        ...next[existingIndex],
                        tooltip: tooltip,
                        enabled: e.target.checked,
                      };
                    } else {
                      next.push({
                        ...opt,
                        color: COLORS[idx % COLORS.length],
                        tooltip: opt.tooltip,
                        enabled: e.target.checked,
                      });
                    }
                    return next;
                  })
                }
              />
            }
            label={
              <Typography variant="body2" sx={{ color: current.color }}>
                {opt.name}
              </Typography>
            }
          />
        </Tooltip>
        <TextField
          type="color"
          size="small"
          value={current.color}
          onChange={(e) =>
            setTracesState((prev) =>
              prev.map((t) =>
                t.id === opt.id ? { ...t, color: e.target.value } : t
              )
            )
          }
          sx={{ width: 60, minWidth: 60 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={current.axis === "y"}
              onChange={(e) => {
                if (!e.target.checked) return;
                setTracesState((prev) =>
                  prev.map((t) =>
                    t.id === opt.id ? { ...t, axis: "y" } : t
                  )
                );
              }}
            />
          }
          label="Y1"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={current.axis === "y2"}
              onChange={(e) => {
                if (!e.target.checked) return;
                setTracesState((prev) =>
                  prev.map((t) =>
                    t.id === opt.id ? { ...t, axis: "y2" } : t
                  )
                );
              }}
            />
          }
          label="Y2"
        />
      </Stack>
    );
  };

  // Initialize Plotly and pipeline once
  useEffect(() => {
    if (!plotContainerRef.current) return;
    if (!plotDivRef.current) {
      const div = document.createElement("div");
      div.style.width = "100%";
      div.style.height = "100%";
      plotContainerRef.current.appendChild(div);
      plotDivRef.current = div as unknown as Plotly.PlotlyHTMLElement;
    }
    const enabledTraces = traces.filter((t) => t.enabled);
    rendererRef.current = new PlotlyRenderer({
      config: perfConfig,
      traces: enabledTraces.map((t) => ({
        name: t.name,
        color: t.color,
        axis: t.axis,
      })),
    });
    pipelineRef.current = new TelemetryPipeline({
      traces: enabledTraces.map((t) => ({
        name: t.name,
        color: t.color,
        axis: t.axis,
      })),
      config: perfConfig,
      renderer: rendererRef.current,
    });
    pipelineRef.current.attachDiv(plotDivRef.current);

    return () => {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update traces in renderer/pipeline when selection changes
  useEffect(() => {
    if (!rendererRef.current || !pipelineRef.current) return;
    const enabledTraces = traces.filter((t) => t.enabled);
    rendererRef.current.setTraces(
      enabledTraces.map((t) => ({
        name: t.name,
        color: t.color,
        axis: t.axis,
      }))
    );
    pipelineRef.current.setTraces(
      enabledTraces.map((t) => ({
        name: t.name,
        color: t.color,
        axis: t.axis,
      }))
    );
  }, [traces]);

  // Telemetry ingestion for binary mode
  useEffect(() => {
    if (!serial || serial.mode !== "binary") return;
    const handler = (data: TelemetryData) => {
      if (!pipelineRef.current || frozen) return;
      // map values in order of current enabled traces
      const enabled = traces.filter((t) => t.enabled);
      const mappedValues = enabled.map((t) => {
        const idx = data.registers.findIndex((r) => r.register === t.id);
        const val = data.values[idx];
        if (Array.isArray(val)) {
          return typeof val[0] === "number" ? val[0] : 0;
        }
        return typeof val === "number" ? val : 0;
      });
      pipelineRef.current.ingest(mappedValues, performance.now());
    };
    serial.on("telemetry", handler);
    return () => {
      serial.off("telemetry", handler);
    };
  }, [serial, traces, frozen]);

  // ASCII fallback: parse M lines and push
  useSerialLineEvent((line) => {
    if (!pipelineRef.current || serial?.mode !== "ascii" || frozen) return;
    if (line.content.startsWith(`${motorKey}M`)) {
      const parts = line.content.slice(2).split("\t").map(Number);
      if (!parts.length) return;
      const enabled = traces.filter((t) => t.enabled);
      const mapped = enabled.map((_, idx) => parts[idx] ?? 0);
      pipelineRef.current.ingest(mapped, performance.now());
    }
  });

  return (
    <Stack direction="row" spacing={8} alignItems="flex-start">
      <Box sx={{ minWidth: 320, flexShrink: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField
            label="Telemetry rate (Hz)"
            type="number"
            size="small"
            value={frequencyHz}
            onChange={(e) => setFrequencyHz(Number(e.target.value))}
            sx={{ flex: 1 }}
          />
          <Button
            variant={frozen ? "contained" : "outlined"}
            color={frozen ? "warning" : "primary"}
            onClick={() => setFrozen((f) => !f)}
          >
            Freeze
          </Button>
        </Stack>
        <Stack spacing={1}>
          {primaryOptions.map((opt, idx) =>
            renderTraceRow(opt, idx, traces, setTraces)
          )}
        </Stack>
        <Accordion defaultExpanded={false} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>
              Velocity PID
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1 }}>
            <Stack spacing={1}>
              {velOptions.map((opt, idx) =>
                renderTraceRow(opt, idx, traces, setTraces)
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
        <Accordion defaultExpanded={false} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>
              Angle PID
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 1 }}>
            <Stack spacing={1}>
              {angOptions.map((opt, idx) =>
                renderTraceRow(opt, idx, traces, setTraces)
              )}
            </Stack>
          </AccordionDetails>
        </Accordion>
        {otherOptions.length > 0 && (
          <Accordion defaultExpanded={false} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>
                Other
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 1 }}>
              <Stack spacing={1}>
                {otherOptions.map((opt, idx) =>
                  renderTraceRow(opt, idx, traces, setTraces)
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>
      <Box sx={{ flex: 1, minHeight: 400}}>
        <ResizableBox
          width={Infinity}
          height={plotHeight}
          axis="y"
          minConstraints={[100, 300]}
          maxConstraints={[Infinity, 900]}
          handle={(h: any, ref: any) => (
            <span
              ref={ref}
              className={`react-resizable-handle react-resizable-handle-${h}`}
              style={{ height: 8 }}
            />
          )}
          onResize={(_: any, data: { size: { height: number; width: number } }) => {
            setPlotHeight(data.size.height);
            if (plotDivRef.current) {
              Plotly.Plots.resize(plotDivRef.current);
            }
          }}
        >
          <div
            ref={plotContainerRef}
            style={{
              width: "98%",
              height: "100%",
              minHeight: 300,
              overflow: "hidden",
            }}
          />
        </ResizableBox>
      </Box>
    </Stack>
  );
};
