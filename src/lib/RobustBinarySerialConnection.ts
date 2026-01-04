import EventEmitter from "eventemitter3";
import {
  BinaryPacket,
  RegisterResponse,
  SerialConnection,
  TelemetryData,
  TelemetryHeader,
} from "./serialTypes";
import { REGISTER_BY_ID } from "./registerMap";
import { concat, decodeRegisterValue, encodeRegisterValue } from "./binaryCodec";
import { parseBinaryDsl } from "./binaryDsl";

const MARKER_BYTE = 0xa5;
const FRAME_ESC = 0xdb;
const FRAME_ESC_MARKER = 0xdc;
const FRAME_ESC_ESC = 0xdd;

const TYPE_REGISTER = "R".charCodeAt(0);
const TYPE_RESPONSE = "r".charCodeAt(0);
const TYPE_TELEMETRY_HEADER = "H".charCodeAt(0);
const TYPE_TELEMETRY = "T".charCodeAt(0);
const TYPE_ALERT = "A".charCodeAt(0);
const TYPE_DEBUG = "D".charCodeAt(0);
const TYPE_LOG = "L".charCodeAt(0);
const TYPE_COMMAND = "C".charCodeAt(0);
const TYPE_COMMAND_RESPONSE = "c".charCodeAt(0);

const CMD_WRITE = 0x01;
const CMD_CALIBRATE = 0x02;
const CMD_BOOTLOADER = 0x03;

const TYPE_MAP: Record<number, BinaryPacket["type"]> = {
  [TYPE_REGISTER]: "register",
  [TYPE_RESPONSE]: "response",
  [TYPE_TELEMETRY_HEADER]: "telemetryHeader",
  [TYPE_TELEMETRY]: "telemetry",
  [TYPE_ALERT]: "alert",
  [TYPE_DEBUG]: "debug",
  [TYPE_LOG]: "log",
  [TYPE_COMMAND_RESPONSE]: "commandResponse",
};

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) : (crc << 1);
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const crc32Mpeg2 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  const pad = (4 - (data.length % 4)) % 4;
  for (let i = 0; i < data.length + pad; i += 1) {
    const byte = i < data.length ? data[i] : 0;
    const idx = ((crc >>> 24) ^ byte) & 0xff;
    crc = ((crc << 8) ^ CRC32_TABLE[idx]) >>> 0;
  }
  return crc >>> 0;
};

const escapeFrameBytes = (bytes: Uint8Array) => {
  const escaped: number[] = [];
  bytes.forEach((byte) => {
    if (byte === MARKER_BYTE) {
      escaped.push(FRAME_ESC, FRAME_ESC_MARKER);
    } else if (byte === FRAME_ESC) {
      escaped.push(FRAME_ESC, FRAME_ESC_ESC);
    } else {
      escaped.push(byte);
    }
  });
  return new Uint8Array(escaped);
};

type PendingRequest = {
  registerId: number;
  resolve: (value: RegisterResponse | null) => void;
  reject: (err: any) => void;
  timeout: any;
};

export class RobustBinarySerialConnection
  extends EventEmitter<any>
  implements SerialConnection
{
  mode: SerialConnection["mode"] = "robustBinary";
  port: SerialPort | undefined;
  private baudRate: number;
  private writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  private closeReader: undefined | (() => Promise<void>);
  private telemetryHeaders = new Map<number, TelemetryHeader>();
  private pending: PendingRequest[] = [];
  private currentMotor = 0;
  private inFrame = false;
  private escapeNext = false;
  private frameBuffer: number[] = [];
  private expectedLength: number | null = null;

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
      console.error("Robust binary read loop error", err);
    }
  }

  private feed(chunk: Uint8Array) {
    for (const byte of chunk) {
      this.consumeByte(byte);
    }
  }

  private resetParser() {
    this.inFrame = false;
    this.escapeNext = false;
    this.frameBuffer = [];
    this.expectedLength = null;
  }

  private startFrame() {
    this.inFrame = true;
    this.escapeNext = false;
    this.frameBuffer = [];
    this.expectedLength = null;
  }

  private consumeByte(byte: number) {
    if (byte === MARKER_BYTE) {
      this.startFrame();
      return;
    }
    if (!this.inFrame) {
      return;
    }
    if (this.escapeNext) {
      if (byte === FRAME_ESC_MARKER) {
        this.appendByte(MARKER_BYTE);
      } else if (byte === FRAME_ESC_ESC) {
        this.appendByte(FRAME_ESC);
      } else {
        this.resetParser();
      }
      this.escapeNext = false;
      return;
    }
    if (byte === FRAME_ESC) {
      this.escapeNext = true;
      return;
    }
    this.appendByte(byte);
  }

  private appendByte(byte: number) {
    this.frameBuffer.push(byte);
    if (this.frameBuffer.length === 1) {
      const len = this.frameBuffer[0];
      if (len < 5) {
        this.resetParser();
        return;
      }
      this.expectedLength = 1 + len;
    }
    if (this.expectedLength && this.frameBuffer.length === this.expectedLength) {
      const frame = Uint8Array.from(this.frameBuffer);
      this.resetParser();
      this.handleFrame(frame);
    }
    if (this.expectedLength && this.frameBuffer.length > this.expectedLength) {
      this.resetParser();
    }
  }

  private handleFrame(frame: Uint8Array) {
    if (frame.length < 6) return;
    const len = frame[0];
    if (len !== frame.length - 1) return;
    const payloadLength = len - 1 - 4;
    if (payloadLength < 0) return;
    const type = frame[1];
    const payloadEnd = 2 + payloadLength;
    const payload = frame.slice(2, payloadEnd);
    const crcBytes = frame.slice(payloadEnd, payloadEnd + 4);
    const computed = crc32Mpeg2(frame.slice(0, payloadEnd));
    const received =
      (crcBytes[0] ?? 0) |
      ((crcBytes[1] ?? 0) << 8) |
      ((crcBytes[2] ?? 0) << 16) |
      ((crcBytes[3] ?? 0) << 24);
    if ((computed >>> 0) !== (received >>> 0)) {
      return;
    }

    const packet: BinaryPacket = {
      type: TYPE_MAP[type] || "unknown",
      rawType: type,
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
    for (let i = 1; i + 1 < payload.length; i += 2) {
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
    const len = payload.length + 1 + 4;
    if (len > 255) {
      throw new Error("Frame too large");
    }
    const frame = new Uint8Array(1 + len);
    frame[0] = len;
    frame[1] = type;
    frame.set(payload, 2);
    const crc = crc32Mpeg2(frame.slice(0, 2 + payload.length));
    const crcOffset = 2 + payload.length;
    frame[crcOffset] = crc & 0xff;
    frame[crcOffset + 1] = (crc >>> 8) & 0xff;
    frame[crcOffset + 2] = (crc >>> 16) & 0xff;
    frame[crcOffset + 3] = (crc >>> 24) & 0xff;
    const escaped = escapeFrameBytes(frame);
    const out = new Uint8Array(1 + escaped.length);
    out[0] = MARKER_BYTE;
    out.set(escaped, 1);
    await this.writer.write(out);
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
    } else if (action.kind === "calibration") {
      await this.writeFrame(TYPE_COMMAND, Uint8Array.from([CMD_CALIBRATE]));
    } else if (action.kind === "read") {
      await this.readRegister(action.registerId);
    } else if (action.kind === "write") {
      await this.writeRegister(action.registerId, action.value);
    } else if (action.kind === "save") {
      await this.writeFrame(TYPE_COMMAND, Uint8Array.from([CMD_WRITE]));
    } else if (action.kind === "telemetry") {
      await this.configureTelemetry(
        action.registers.map((reg) => ({ motor: action.motor, register: reg })),
        action.frequencyHz
      );
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
    await this.readRegister(0x1a);
  }
}
