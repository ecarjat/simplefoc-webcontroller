import EventEmitter from "eventemitter3";
import { SerialLine } from "../simpleFoc/serial";

export type SerialMode = "ascii" | "binary";

export type PacketType =
  | "register"
  | "response"
  | "telemetry"
  | "telemetryHeader"
  | "log"
  | "calibrationResponse"
  | "saveResponse"
  | "sync"
  | "alert"
  | "debug"
  | "unknown";

export type BinaryPacket = {
  type: PacketType;
  rawType: number;
  payload: Uint8Array;
};

export type TelemetryHeader = {
  telemetryId: number;
  registers: { motor: number; register: number }[];
  raw: Uint8Array;
};

export type TelemetryData = {
  telemetryId: number;
  values: (number | number[])[];
  registers: { motor: number; register: number }[];
  raw: Uint8Array;
};

export type RegisterResponse = {
  registerId: number;
  value: number | number[];
  raw: Uint8Array;
};

export type SerialState = "closed" | "open";

export interface SerialConnection extends EventEmitter<{
  stateChange: () => void;
  line: (line: SerialLine) => void;
  packet: (packet: BinaryPacket) => void;
  response: (res: RegisterResponse) => void;
  telemetryHeader: (header: TelemetryHeader) => void;
  telemetry: (data: TelemetryData) => void;
}> {
  mode: SerialMode;
  port?: SerialPort;
  open(existingPort?: SerialPort): Promise<void>;
  close(): Promise<void>;
  send(command: string): Promise<void>;
  sendRawBytes?(bytes: Uint8Array): Promise<void>;
  writeRegister?(
    registerId: number,
    value: number | number[] | Uint8Array,
    opts?: { expectResponse?: boolean }
  ): Promise<void>;
  readRegister?(registerId: number): Promise<RegisterResponse | null>;
  setMotorAddress?(motor: number): Promise<void>;
  configureTelemetry?(
    registers: { motor: number; register: number }[],
    frequencyHz: number
  ): Promise<void>;
  restartTarget?(): Promise<void>;
  lines?: { index: number; content: string; type: "received" | "sent" }[];
}
