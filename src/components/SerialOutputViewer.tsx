import { Box } from "@mui/system";
import { FixedSizeList } from "react-window";
import { useEffect, useRef, useState } from "react";
import { useSerialPort, useSerialPortLines } from "../lib/serialContext";
import { SerialLine } from "../simpleFoc/serial";
import { BinaryPacket } from "../lib/serialTypes";

const SerialLineDisplay = ({
  index,
  style,
  data,
}: {
  index: number;
  style: any;
  data: DisplayEntry[];
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
    {renderEntry(data[index])}
  </div>
);

const serialLinesToKey = (index: number, data: DisplayEntry[]) => {
  return data[index].key;
};

const SerialLinesList = FixedSizeList<DisplayEntry[]>;

type DisplayEntry =
  | { kind: "line"; key: number; line: SerialLine }
  | { kind: "packet"; key: number; packet: BinaryPacket };

const renderEntry = (entry: DisplayEntry) => {
  if (entry.kind === "line") {
    return (
      <>
        {entry.line.type === "received" ? "➡️" : "⬅️"}&nbsp;
        {entry.line.content}
      </>
    );
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

export const SerialOutputViewer = () => {
  const listRef = useRef<any>();
  const listOuterRef = useRef<any>();
  const serial = useSerialPort();
  const lines = useSerialPortLines();
  const [entries, setEntries] = useState<DisplayEntry[]>([]);

  useEffect(() => {
    // feed ascii lines
    if (!serial) return;
    setEntries(
      lines.map((line) => ({ kind: "line", key: line.index, line }))
    );
  }, [lines, serial]);

  useEffect(() => {
    if (!serial) return;
    const packetHandler = (packet: BinaryPacket) => {
      setEntries((prev) => [
        ...prev,
        { kind: "packet", key: Date.now() + Math.random(), packet },
      ]);
    };
    serial.on("packet", packetHandler);
    return () => {
      serial.off("packet", packetHandler);
    };
  }, [serial]);

  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    if (
      listOuterRef.current &&
      listOuterRef.current?.scrollHeight -
        (listOuterRef.current?.scrollTop + listOuterRef.current?.clientHeight) <
        300
    ) {
      listRef.current.scrollToItem(entries.length ? entries.length - 1 : 0);
    }
  }, [entries]);

  return (
    <Box
      sx={{
        borderRadius: 1,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          bgcolor: "grey.200",
          border: "1px solid",
          borderColor: "grey.400",
          flex: 1,
          height: 300,
          contain: "content",
        }}
      >
        <SerialLinesList
          itemData={entries}
          itemCount={entries.length}
          height={300}
          itemSize={20}
          width="100%"
          itemKey={serialLinesToKey}
          ref={listRef}
          outerRef={listOuterRef}
        >
          {SerialLineDisplay}
        </SerialLinesList>
      </Box>
    </Box>
  );
};
