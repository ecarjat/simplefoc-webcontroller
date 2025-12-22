import { Box } from "@mui/system";
import { Checkbox, FormControlLabel, Stack } from "@mui/material";
import { FixedSizeList } from "react-window";
import { useEffect, useRef, useState } from "react";
import { useSerialPort, useSerialPortLines } from "../lib/serialContext";
import { SerialLine } from "../simpleFoc/serial";
import { BinaryPacket } from "../lib/serialTypes";

const SerialLineDisplay = ({
  index,
  style,
  data,
  showDecoded,
}: {
  index: number;
  style: any;
  data: DisplayEntry[];
  showDecoded: boolean;
}) => (
  <div
    style={{
      ...style,
      lineHeight: "10px",
      fontSize: "13px",
      padding: "0 10px",
      fontFamily: "monospace",
    }}
  >
    {renderEntry(data[index], showDecoded)}
  </div>
);

const serialLinesToKey = (index: number, data: DisplayEntry[]) => {
  return data[index].key;
};

const SerialLinesList = FixedSizeList<DisplayEntry[]>;

type DisplayEntry =
  | { kind: "line"; key: number; line: SerialLine }
  | { kind: "packet"; key: number; packet: BinaryPacket };

const renderEntry = (entry: DisplayEntry, showDecoded: boolean) => {
  if (entry.kind === "line") {
    return (
      <>
        {entry.line.type === "received" ? "➡️" : "⬅️"}&nbsp;
        {entry.line.content}
      </>
    );
  }
  if (entry.packet.type === "log" && showDecoded) {
    const decoded = decodeLog(entry.packet.payload);
    return (
      <>
        📝 {decoded}
      </>
    );
  }
  if (entry.packet.type === "telemetry") {
    return <>📡 telemetry packet ({entry.packet.payload.length} bytes)</>;
  }
  const hex = Array.from(entry.packet.payload)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
  return (
    <>
      🧩 {entry.packet.type} (0x{entry.packet.rawType.toString(16)}): {hex}
    </>
  );
};

const decodeLog = (payload: Uint8Array) => {
  if (payload.length < 2) return "<log malformed>";
  const levelId = payload[0];
  const tagLen = payload[1];
  let idx = 2;
  if (idx + tagLen > payload.length) return "<log malformed>";
  const tag = new TextDecoder("ascii").decode(payload.slice(idx, idx + tagLen));
  idx += tagLen;
  if (idx >= payload.length) return `${levelName(levelId)}/${tag}`;
  const msgLen = payload[idx];
  idx += 1;
  const msg = new TextDecoder("ascii").decode(payload.slice(idx, idx + msgLen));
  return `${levelName(levelId)}/${tag}: ${msg}`;
};

const levelName = (level: number) => {
  switch (level) {
    case 0:
      return "DEBUG";
    case 1:
      return "INFO";
    case 2:
      return "WARN";
    case 3:
      return "ERROR";
    default:
      return `L${level}`;
  }
};

export const SerialOutputViewer = () => {
  const listRef = useRef<any>();
  const listOuterRef = useRef<any>();
  const serial = useSerialPort();
  const lines = useSerialPortLines();
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const lastLineIndexRef = useRef<number>(-1);
  const [showDecoded, setShowDecoded] = useState(true);
  const [showTelemetryPackets, setShowTelemetryPackets] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Append new ASCII lines without resetting existing entries
  useEffect(() => {
    if (!serial || !lines.length) return;
    const latestIndex = lines[lines.length - 1].index;
    if (latestIndex === lastLineIndexRef.current) return;
    const newLines = lines.filter((l) => l.index > lastLineIndexRef.current);
    if (!newLines.length) return;
    lastLineIndexRef.current = latestIndex;
    if (!frozen) {
      const mapped: DisplayEntry[] = newLines.map((line) => ({
        kind: "line",
        key: line.index,
        line,
      }));
      setEntries((prev: DisplayEntry[]) => [...prev, ...mapped]);
    }
  }, [lines, serial, frozen]);

  useEffect(() => {
    if (!serial) return;
    const packetHandler = (packet: BinaryPacket) => {
      if (frozen) return;
      if (!showTelemetryPackets && packet.type === "telemetry") return;
      const mapped: DisplayEntry = {
        kind: "packet",
        key: Date.now() + Math.random(),
        packet,
      };
      setEntries((prev: DisplayEntry[]) => [...prev, mapped]);
    };
    serial.on("packet", packetHandler);
    return () => {
      serial.off("packet", packetHandler);
    };
  }, [serial, frozen, showTelemetryPackets]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    if (!autoScroll) return;
    if (listOuterRef.current) {
      listRef.current.scrollToItem(entries.length ? entries.length - 1 : 0);
    }
  }, [entries, autoScroll]);

  return (
    <Stack direction="row" spacing={2} alignItems="flex-start">
      <Box
        sx={{
          bgcolor: "grey.200",
          border: "1px solid",
          borderColor: "grey.400",
          flex: 1,
          height: 300,
          contain: "content",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <FixedSizeList
          itemData={entries}
          itemCount={entries.length}
          height={300}
          itemSize={20}
          width="100%"
          itemKey={serialLinesToKey}
          ref={listRef}
          outerRef={listOuterRef}
        >
          {(props) => <SerialLineDisplay {...props} showDecoded={showDecoded} />}
        </FixedSizeList>
      </Box>
      <Stack
        sx={{
          minWidth: 180,
          alignSelf: "flex-start",
          paddingTop: "4px",
          pl: 3,
        }}
      >
        <FormControlLabel
          control={
            <Checkbox
              checked={showDecoded}
              onChange={(e) => setShowDecoded(e.target.checked)}
            />
          }
          label="Decode"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={showTelemetryPackets}
              onChange={(e) => setShowTelemetryPackets(e.target.checked)}
            />
          }
          label="Telemetry"
        />
        <FormControlLabel
          control={
            <Checkbox checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
          }
          label="Freeze"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
          }
          label="Auto scroll"
        />
      </Stack>
    </Stack>
  );
};
