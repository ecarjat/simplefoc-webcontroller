export type RegisterPrimitive = "u8" | "u32" | "f32";

export type RegisterEncoding =
  | RegisterPrimitive
  | {
      kind: "composite";
      parts: RegisterPrimitive[];
    };

export type RegisterDefinition = {
  id: number;
  name: string;
  encoding: RegisterEncoding;
};

// Minimal subset of registers used by the UI.
export const REGISTER_DEFINITIONS: RegisterDefinition[] = [
  { id: 0x01, name: "TARGET", encoding: "f32" },
  { id: 0x04, name: "ENABLE", encoding: "u8" },
  { id: 0x05, name: "CONTROL_MODE", encoding: "u8" },
  { id: 0x06, name: "TORQUE_MODE", encoding: "u8" },
  { id: 0x1a, name: "TELEMETRY_REG", encoding: "u8" }, // variable payload on write
  { id: 0x1b, name: "TELEMETRY_CTRL", encoding: "u8" },
  { id: 0x1c, name: "TELEMETRY_DOWNSAMPLE", encoding: "u32" },
  { id: 0x1e, name: "TELEMETRY_MIN_ELAPSED", encoding: "u32" },
  { id: 0x30, name: "VEL_PID_P", encoding: "f32" },
  { id: 0x31, name: "VEL_PID_I", encoding: "f32" },
  { id: 0x32, name: "VEL_PID_D", encoding: "f32" },
  { id: 0x33, name: "VEL_PID_LIM", encoding: "f32" },
  { id: 0x34, name: "VEL_PID_RAMP", encoding: "f32" },
  { id: 0x35, name: "VEL_LPF_T", encoding: "f32" },
  { id: 0x36, name: "ANG_PID_P", encoding: "f32" },
  { id: 0x39, name: "ANG_PID_LIM", encoding: "f32" },
  { id: 0x5f, name: "MOTION_DOWNSAMPLE", encoding: "u8" },
  { id: 0x70, name: "NUM_MOTORS", encoding: "u8" },
  { id: 0x7f, name: "MOTOR_ADDRESS", encoding: "u8" },
  { id: 0x10, name: "POSITION", encoding: { kind: "composite", parts: ["u32", "f32"] } },
  { id: 0x12, name: "SENSOR_ANGLE", encoding: "f32" },
  { id: 0x11, name: "VELOCITY", encoding: "f32" },
];

export const REGISTER_BY_ID = Object.fromEntries(
  REGISTER_DEFINITIONS.map((def) => [def.id, def])
);

export const REGISTER_BY_NAME = Object.fromEntries(
  REGISTER_DEFINITIONS.map((def) => [def.name, def])
);

export type RegisterName = keyof typeof REGISTER_BY_NAME;

export const REGISTER_NAME_LIST = REGISTER_DEFINITIONS.map((def) => def.name);
