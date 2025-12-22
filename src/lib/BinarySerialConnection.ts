import EventEmitter from "eventemitter3";
import {
  BinaryPacket,
  RegisterResponse,
  SerialConnection,
  TelemetryData,
  TelemetryHeader,
} from "./serialTypes";
import { REGISTER_BY_ID, REGISTER_BY_NAME, REGISTER_DEFINITIONS } from "./registerMap";
import { concat, decodeRegisterValue, encodeRegisterValue } from "./binaryCodec";
import { parseBinaryDsl } from "./binaryDsl";

const MARKER_BYTE = 0xa5;
const TYPE_REGISTER = "R".charCodeAt(0);
const TYPE_RESPONSE = "r".charCodeAt(0);
const TYPE_TELEMETRY_HEADER = "H".charCodeAt(0);
const TYPE_TELEMETRY = "T".charCodeAt(0);
const TYPE_SYNC = "S".charCodeAt(0);
const TYPE_ALERT = "A".charCodeAt(0);
const TYPE_DEBUG = "D".charCodeAt(0);
const TYPE_LOG = "L".charCodeAt(0);

const TYPE_MAP: Record<number, BinaryPacket["type"]> = {
  [TYPE_REGISTER]: "register",
  [TYPE_RESPONSE]: "response",
  [TYPE_TELEMETRY_HEADER]: "telemetryHeader",
  [TYPE_TELEMETRY]: "telemetry",
  [TYPE_SYNC]: "sync",
  [TYPE_ALERT]: "alert",
  [TYPE_DEBUG]: "debug",
  [TYPE_LOG]: "log",
};

type PendingRequest = {
  registerId: number;
  resolve: (value: RegisterResponse | null) => void;
  reject: (err: any) => void;
  timeout: any;
};

export class BinarySerialConnection extends EventEmitter<any> implements SerialConnection {
  mode: SerialConnection["mode"] = "binary";
  port: SerialPort | undefined;
  private baudRate: number;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private closeReader: undefined | (() => Promise<void>);
  private buffer = new Uint8Array(0);
  private telemetryHeaders = new Map<number, TelemetryHeader>();
  private pending: PendingRequest[] = [];
  private currentMotor = 0;

  constructor(baudRate: number) {
    super();
    this.baudRate = baudRate;
  }

  private ensureOpen() {
    if (!this.port) {
      throw new Error("Port not open");
    }
  }

  async open(existingPort?: SerialPort) {
    if (this.port) {
      throw new Error("Port is already open");
    }
    const port =
      existingPort ||
      (await navigator.serial.requestPort({
        filters: [],
      }));
    await port.open({
      baudRate: this.baudRate,
      bufferSize: 1024,
    });
    this.port = port;
    if (port.writable) {
      this.writer = port.writable.getWriter();
    }
    this.startReadLoop();
    this.emit("stateChange");
  }

  private async startReadLoop() {
    if (!this.port?.readable) return;
    const reader = this.port.readable.getReader();
    this.closeReader = async () => {
      await reader.cancel();
      reader.releaseLock();
      this.closeReader = undefined;
    };
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          this.feed(value);
        }
      }
    } catch (err) {
      console.error("Binary read loop error", err);
    }
  }

  private feed(chunk: Uint8Array) {
    this.buffer = concat([this.buffer, chunk]);
    this.parseBuffer();
  }

  private parseBuffer() {
    while (this.buffer.length >= 3) {
      const markerIndex = this.buffer.indexOf(MARKER_BYTE);
      if (markerIndex < 0) {
        this.buffer = new Uint8Array(0);
        return;
      }
      if (markerIndex > 0) {
        this.buffer = this.buffer.slice(markerIndex);
      }
      if (this.buffer.length < 3) {
        return;
      }
      const size = this.buffer[1];
      const frameLength = size + 2; // marker + size + payload including type
      if (this.buffer.length < frameLength) {
        return;
      }
      const frame = this.buffer.slice(0, frameLength);
      this.buffer = this.buffer.slice(frameLength);
      this.handleFrame(frame);
    }
  }

  private handleFrame(frame: Uint8Array) {
    const rawType = frame[2];
    const payload = frame.slice(3);
    const packet: BinaryPacket = {
      type: TYPE_MAP[rawType] || "unknown",
      rawType,
      payload,
    };
    this.emit("packet", packet);

    if (packet.type === "response") {
      const res = this.decodeResponse(payload);
      if (res) {
        this.emit("response", res);
        this.resolvePending(res);
      }
    } else if (packet.type === "telemetryHeader") {
      const header = this.decodeTelemetryHeader(payload);
      if (header) {
        this.telemetryHeaders.set(header.telemetryId, header);
        this.emit("telemetryHeader", header);
      }
    } else if (packet.type === "telemetry") {
      const data = this.decodeTelemetry(payload);
      if (data) {
        this.emit("telemetry", data);
      }
    }
  }

  private decodeResponse(payload: Uint8Array): RegisterResponse | null {
    if (!payload.length) return null;
    const registerId = payload[0];
    const def = REGISTER_BY_ID[registerId];
    if (!def) {
      return { registerId, value: [], raw: payload };
    }
    const { value } = decodeRegisterValue(def.encoding, payload.slice(1));
    return { registerId, value, raw: payload };
  }

  private decodeTelemetryHeader(payload: Uint8Array): TelemetryHeader | null {
    if (!payload.length) return null;
    const telemetryId = payload[0];
    const registers: { motor: number; register: number }[] = [];
    for (let i = 1; i < payload.length; i += 2) {
      registers.push({ motor: payload[i], register: payload[i + 1] });
    }
    return {
      telemetryId,
      registers,
      raw: payload,
    };
  }

  private decodeTelemetry(payload: Uint8Array): TelemetryData | null {
    if (!payload.length) return null;
    const telemetryId = payload[0];
    const header = this.telemetryHeaders.get(telemetryId);
    if (!header) {
      return null;
    }
    const values: (number | number[])[] = [];
    let cursor = 1;
    header.registers.forEach((reg) => {
      const def = REGISTER_BY_ID[reg.register];
      if (!def) {
        values.push(0);
        return;
      }
      const { value, size } = decodeRegisterValue(def.encoding, payload, cursor);
      values.push(value);
      cursor += size;
    });
    return {
      telemetryId,
      registers: header.registers,
      values,
      raw: payload,
    };
  }

  private resolvePending(res: RegisterResponse) {
    const pending = this.pending.find((p) => p.registerId === res.registerId);
    if (pending) {
      clearTimeout(pending.timeout);
      pending.resolve(res);
      this.pending = this.pending.filter((p) => p !== pending);
    }
  }

  private async writeFrame(type: number, payload: Uint8Array) {
    this.ensureOpen();
    if (!this.writer) return;
    const frame = new Uint8Array(payload.length + 3);
    frame[0] = MARKER_BYTE;
    frame[1] = payload.length + 1; // includes type
    frame[2] = type;
    frame.set(payload, 3);
    await this.writer.write(frame);
  }

  async send(command: string) {
    const action = parseBinaryDsl(command);
    if (!action) return;
    if (action.kind === "raw") {
      if (action.bytes[0] === MARKER_BYTE) {
        await this.sendRawBytes?.(action.bytes);
      } else {
        await this.writeFrame(TYPE_REGISTER, action.bytes);
      }
    } else if (action.kind === "read") {
      await this.readRegister(action.registerId);
    } else if (action.kind === "write") {
      await this.writeRegister(action.registerId, action.value);
    } else if (action.kind === "telemetry") {
      await this.configureTelemetry(
        action.registers.map((reg) => ({ motor: action.motor, register: reg })),
        action.frequencyHz
      );
    } else if (action.kind === "sync") {
      await this.writeFrame(TYPE_SYNC, Uint8Array.from([0x01]));
    }
  }

  async sendRawBytes(bytes: Uint8Array) {
    this.ensureOpen();
    if (!this.writer) return;
    await this.writer.write(bytes);
  }

  async close() {
    if (!this.port) {
      throw new Error("Already closed");
    }
    const port = this.port;
    this.port = undefined;
    await this.closeReader?.();
    await this.writer?.close();
    await port.close();
    this.emit("stateChange");
  }

  async readRegister(registerId: number): Promise<RegisterResponse | null> {
    await this.writeFrame(TYPE_REGISTER, Uint8Array.from([registerId]));
    return await new Promise<RegisterResponse | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = this.pending.filter((p) => p.registerId !== registerId);
        resolve(null);
      }, 1000);
      this.pending.push({ registerId, resolve, reject, timeout });
    });
  }

  async writeRegister(
    registerId: number,
    value: number | number[] | Uint8Array,
    opts?: { expectResponse?: boolean }
  ) {
    const def = REGISTER_BY_ID[registerId];
    let payloadValue: Uint8Array;
    if (def) {
      payloadValue = encodeRegisterValue(def, value);
    } else if (value instanceof Uint8Array) {
      payloadValue = value;
    } else if (Array.isArray(value)) {
      payloadValue = Uint8Array.from(value);
    } else {
      payloadValue = Uint8Array.from([value]);
    }
    const payload = concat([Uint8Array.from([registerId]), payloadValue]);
    await this.writeFrame(TYPE_REGISTER, payload);
    if (opts?.expectResponse) {
      await this.readRegister(registerId);
    }
  }

  async setMotorAddress(motor: number) {
    if (motor === this.currentMotor) return;
    await this.writeRegister(0x7f, motor);
    this.currentMotor = motor;
  }

  async configureTelemetry(
    registers: { motor: number; register: number }[],
    frequencyHz: number
  ) {
    const telemetryId = 0;
    const numRegs = registers.length;
    const payload = new Uint8Array(1 + 2 * numRegs);
    payload[0] = numRegs;
    registers.forEach((r, idx) => {
      payload[1 + idx * 2] = r.motor;
      payload[1 + idx * 2 + 1] = r.register;
    });
    await this.writeRegister(0x1b, telemetryId);
    await this.writeRegister(0x1a, payload);
    const minElapsed = Math.max(1, Math.floor(1_000_000 / frequencyHz));
    await this.writeRegister(0x1e, minElapsed);
    await this.readRegister(0x1a); // trigger header resend
  }
}
