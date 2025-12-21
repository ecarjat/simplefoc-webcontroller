import { Axis } from "plotly.js";
import { useEffect, useRef, useState } from "react";
import Plot, { Figure } from "react-plotly.js";
import { useSerialLineEvent } from "../lib/useSerialLineEvent";
import { useSerialPort } from "../lib/serialContext";
import { REGISTER_BY_NAME } from "../lib/registerMap";
import { TelemetryData } from "../lib/serialTypes";
import { TextField } from "@mui/material";

const MAX_POINTS = 100;
const X_SCALE = new Array(MAX_POINTS).fill(0).map((x, i) => i);

const COLORS = ["red", "green", "blue", "orange", "pink"];
const BINARY_TRACE_NAMES = ["TARGET", "POSITION", "SENSOR_ANGLE", "VELOCITY"];

export const MotorMonitorGraph = ({ motorKey }: { motorKey: string }) => {
  const metrics = useRef([] as { name: string; data: number[] }[]);
  const [revision, setRevision] = useState(0);
  const [axisZooms, setAxisZooms] = useState({
    xaxis: undefined as undefined | number[],
    yaxis: [] as (undefined | number[])[],
  });
  const serial = useSerialPort();
  const [frequencyHz, setFrequencyHz] = useState(50);

  useSerialLineEvent((line) => {
    if ((serial as any)?.mode === "binary") return;
    if (line.content.startsWith(`${motorKey}M`)) {
      const points = line.content.slice(2).split("\t").map(Number);
      points.forEach((point, i) => {
        if (!metrics.current[i]) {
          metrics.current[i] = {
            name: i.toString(),
            data: [],
          };
        }
        metrics.current[i].data.push(point);
        if (metrics.current[i].data.length > MAX_POINTS) {
          metrics.current[i].data.splice(
            0,
            metrics.current[i].data.length - MAX_POINTS
          );
        }
      });
      setRevision((r) => r + 1);
    }
  });

  useEffect(() => {
    if (!serial || serial.mode !== "binary") return;
    const registers = [
      { motor: Number(motorKey), register: REGISTER_BY_NAME.TARGET.id },
      { motor: Number(motorKey), register: REGISTER_BY_NAME.POSITION.id },
      { motor: Number(motorKey), register: REGISTER_BY_NAME.SENSOR_ANGLE.id },
      { motor: Number(motorKey), register: REGISTER_BY_NAME.VELOCITY.id },
    ];
    serial.configureTelemetry?.(registers, frequencyHz);
  }, [serial, motorKey, frequencyHz]);

  useEffect(() => {
    if (!serial || serial.mode !== "binary") return;
    const handler = (data: TelemetryData) => {
      const values = data.values.map((val, idx) => {
        if (data.registers[idx].register === REGISTER_BY_NAME.POSITION.id) {
          const arr = Array.isArray(val) ? val : [val];
          if (arr.length >= 2) {
            return (arr[0] as number) + (arr[1] as number);
          }
        }
        return Array.isArray(val) ? val[0] : val;
      });
      values.forEach((point, i) => {
        if (!metrics.current[i]) {
          const defaultName =
            serial?.mode === "binary"
              ? BINARY_TRACE_NAMES[i] || i.toString()
              : `Trace ${i}`;
          metrics.current[i] = {
            name: defaultName,
            data: [],
          };
        }
        metrics.current[i].data.push(typeof point === "number" ? point : 0);
        if (metrics.current[i].data.length > MAX_POINTS) {
          metrics.current[i].data.splice(
            0,
            metrics.current[i].data.length - MAX_POINTS
          );
        }
      });
      setRevision((r) => r + 1);
    };
    serial.on("telemetry", handler);
    return () => {
      serial.off("telemetry", handler);
    };
  }, [serial]);

  const handleGraphUpdate = (update: Readonly<Figure>) => {
    let newZoom: typeof axisZooms = {
      xaxis: update.layout.xaxis?.autorange
        ? undefined
        : update.layout.xaxis?.range,
      yaxis: [],
    };

    let hasChanged = axisZooms.xaxis !== newZoom.xaxis;

    metrics.current.map((m, i) => {
      const yAxis = (update.layout as any)[
        `yaxis${i === 0 ? "" : i + 1}`
      ] as Partial<Axis>;

      const zoom = yAxis?.autorange ? undefined : yAxis?.range;
      newZoom.yaxis.push(zoom);
      if (zoom !== axisZooms.yaxis[i]) {
        hasChanged = true;
      }
    });

    if (hasChanged) {
      setAxisZooms(newZoom);
    }
  };

  const axisData = {
    xaxis: {
      autoRange: axisZooms.xaxis,
    },
  } as any;
  metrics.current.forEach((m, i) => {
    const range = axisZooms.yaxis[i];
    axisData[`yaxis${i === 0 ? "" : i + 1}`] = {
      autoRange: !range,
      range: range,
      tickfront: {
        color: COLORS[i],
      },
      titlefont: {
        color: COLORS[i],
      },
      // position: i * 0.1,
      side: i % 2 ? "left" : "right",
      // anchor: "free",
      // overlaying: "y",
          title: metrics.current[i]?.name || `Trace ${i}`,
        };
      });

  return (
    <div>
      {serial?.mode === "binary" && (
        <TextField
          label="Telemetry rate (Hz)"
          type="number"
          size="small"
          value={frequencyHz}
          onChange={(e) => setFrequencyHz(Number(e.target.value))}
          sx={{ marginBottom: 1 }}
        />
      )}
      <Plot
        revision={revision}
        data={metrics.current.map((metric, i) => ({
          x: X_SCALE,
          y: metric.data,
          type: "scattergl",
          mode: "lines",
          yaxis: `y${i === 0 ? "" : i + 1}`,
          line: {
            color: COLORS[i],
          },
        }))}
        layout={{
          autosize: true,
          height: 400,
          datarevision: revision,
          ...axisData,
        }}
        onUpdate={handleGraphUpdate}
        useResizeHandler
        style={{
          width: "100%",
        }}
      />
    </div>
  );
};
