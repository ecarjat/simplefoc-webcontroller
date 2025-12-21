import { REGISTER_DEFINITIONS, REGISTER_BY_NAME } from "./registerMap";

export type BinaryDslAction =
  | { kind: "read"; registerId: number }
  | { kind: "write"; registerId: number; value: number }
  | { kind: "telemetry"; motor: number; registers: number[]; frequencyHz: number }
  | { kind: "raw"; bytes: Uint8Array }
  | { kind: "sync" };

const resolveRegister = (token: string) => {
  const upper = token.toUpperCase();
  if (REGISTER_BY_NAME[upper]) return REGISTER_BY_NAME[upper].id;
  const found = REGISTER_DEFINITIONS.find((def) => def.name.startsWith(upper));
  return found?.id;
};

const parseHexBytes = (tokens: string[]): Uint8Array => {
  const bytes: number[] = [];
  tokens.join(" ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .forEach((t) => {
      const cleaned = t.replace(/^0x/i, "");
      const val = parseInt(cleaned, 16);
      if (!isNaN(val)) {
        bytes.push(val & 0xff);
      }
    });
  return new Uint8Array(bytes);
};

export const parseBinaryDsl = (input: string): BinaryDslAction | null => {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  const cmd = tokens[0].toLowerCase();
  if (cmd === "raw") {
    return { kind: "raw", bytes: parseHexBytes(tokens.slice(1)) };
  }
  if (cmd === "sync") {
    return { kind: "sync" };
  }
  if (cmd === "get" || cmd === "read") {
    const regToken = tokens[1];
    if (!regToken) return null;
    const regId = resolveRegister(regToken);
    if (regId === undefined) return null;
    return { kind: "read", registerId: regId };
  }
  if (cmd === "set" || cmd === "write") {
    const regToken = tokens[1];
    const valToken = tokens[2];
    if (!regToken || !valToken) return null;
    const regId = resolveRegister(regToken);
    if (regId === undefined) return null;
    const value = Number(valToken);
    if (Number.isNaN(value)) return null;
    return { kind: "write", registerId: regId, value };
  }
  if (cmd === "telemetry") {
    const motorToken = tokens[1];
    if (!motorToken) return null;
    const motor = Number(motorToken);
    if (Number.isNaN(motor)) return null;
    const rest = tokens.slice(2);
    if (rest.length < 2) return null;
    const freqToken = rest[rest.length - 1];
    const freqMatch = freqToken.match(/([\d.]+)\s*hz/i);
    if (!freqMatch) return null;
    const frequencyHz = Number(freqMatch[1]);
    const regTokens = rest.slice(0, -1);
    const registers: number[] = [];
    regTokens.forEach((rt) => {
      const id = resolveRegister(rt);
      if (id !== undefined) registers.push(id);
    });
    if (!registers.length) return null;
    return { kind: "telemetry", motor, registers, frequencyHz };
  }
  return null;
};
