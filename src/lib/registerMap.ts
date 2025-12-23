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
  tooltip?: string;
};

// Minimal subset of registers used by the UI.
export const REGISTER_DEFINITIONS: RegisterDefinition[] = [
  { id: 0x01, name: "TARGET", encoding: "f32", tooltip: "Commanded target (units depend on mode)" },
  { id: 0x04, name: "ENABLE", encoding: "u8", tooltip: "Enable/disable motor" },
  { id: 0x05, name: "CONTROL_MODE", encoding: "u8", tooltip: "Control mode selector" },
  { id: 0x06, name: "TORQUE_MODE", encoding: "u8", tooltip: "Torque mode selector" },
  { id: 0x1a, name: "TELEMETRY_REG", encoding: "u8", tooltip: "Telemetry register list (write variable payload)" }, // variable payload on write
  { id: 0x1b, name: "TELEMETRY_CTRL", encoding: "u8", tooltip: "Telemetry control" },
  { id: 0x1c, name: "TELEMETRY_DOWNSAMPLE", encoding: "u32", tooltip: "Telemetry downsample factor" },
  { id: 0x1e, name: "TELEMETRY_MIN_ELAPSED", encoding: "u32", tooltip: "Minimum elapsed time between telemetry frames (µs)" },
  { id: 0x30, name: "VEL_PID_P", encoding: "f32", tooltip: "Velocity PID P term" },
  { id: 0x31, name: "VEL_PID_I", encoding: "f32", tooltip: "Velocity PID I term" },
  { id: 0x32, name: "VEL_PID_D", encoding: "f32", tooltip: "Velocity PID D term" },
  { id: 0x33, name: "VEL_PID_LIM", encoding: "f32", tooltip: "Velocity PID output limit (motor.PID_velocity.limit)" },
  { id: 0x34, name: "VEL_PID_RAMP", encoding: "f32", tooltip: "Velocity PID ramp (motor.PID_velocity.output_ramp)" },
  { id: 0x35, name: "VEL_LPF_T", encoding: "f32", tooltip: "Velocity low-pass filter time constant (motor.LPF_velocity.Tf)" },
  { id: 0x36, name: "ANG_PID_P", encoding: "f32", tooltip: "Angle PID P term" },
  { id: 0x37, name: "ANG_PID_I", encoding: "f32", tooltip: "Angle PID I term" },
  { id: 0x38, name: "ANG_PID_D", encoding: "f32", tooltip: "Angle PID D term" },
  { id: 0x39, name: "ANG_PID_LIM", encoding: "f32", tooltip: "Angle PID output limit" },
  { id: 0x3a, name: "ANG_PID_RAMP", encoding: "f32", tooltip: "Angle PID ramp" },
  { id: 0x3b, name: "ANG_LPF_T", encoding: "f32", tooltip: "Angle low-pass filter time constant" },
  { id: 0x50, name: "VOLTAGE_LIMIT", encoding: "f32", tooltip: "Maximum motor voltage" },
  { id: 0x51, name: "CURRENT_LIMIT", encoding: "f32", tooltip: "Maximum motor current" },
  { id: 0x52, name: "VELOCITY_LIMIT", encoding: "f32", tooltip: "Maximum target velocity" },
  { id: 0x53, name: "DRIVER_VOLTAGE_LIMIT", encoding: "f32", tooltip: "Driver voltage limit (motor.driver.voltage_limit)" },
  { id: 0x54, name: "PWM_FREQUENCY", encoding: "u32", tooltip: "PWM frequency (Hz) (motor.driver.pwm_frequency)" },
  { id: 0x55, name: "DRIVER_VOLTAGE_PSU", encoding: "f32", tooltip: "PSU voltage for driver (motor.driver.voltage_power_supply)" },
  { id: 0x63, name: "POLE_PAIRS", encoding: "u8", tooltip: "Motor pole pairs (read-only)" },
  { id: 0x64, name: "PHASE_RESISTANCE", encoding: "f32", tooltip: "Phase resistance (ohms)" },
  { id: 0x65, name: "KV", encoding: "f32", tooltip: "Motor KV" },
  { id: 0x66, name: "INDUCTANCE", encoding: "f32", tooltip: "Phase inductance (H)" },
  { id: 0x5f, name: "MOTION_DOWNSAMPLE", encoding: "u8", tooltip: "ASCII motion downsample factor" },
  { id: 0x70, name: "NUM_MOTORS", encoding: "u8", tooltip: "Number of motors detected" },
  { id: 0x7f, name: "MOTOR_ADDRESS", encoding: "u8", tooltip: "Selected motor address" },
  { id: 0x10, name: "POSITION", encoding: { kind: "composite", parts: ["u32", "f32"] }, tooltip: "Motor position" },
  { id: 0x12, name: "SENSOR_ANGLE", encoding: "f32", tooltip: "Sensor angle" },
  { id: 0x11, name: "VELOCITY", encoding: "f32", tooltip: "Motor velocity (motor.shaft_velocity)" },
];

export const REGISTER_BY_ID = Object.fromEntries(
  REGISTER_DEFINITIONS.map((def) => [def.id, def])
);

export const REGISTER_BY_NAME = Object.fromEntries(
  REGISTER_DEFINITIONS.map((def) => [def.name, def])
);

export type RegisterName = keyof typeof REGISTER_BY_NAME;

export const REGISTER_NAME_LIST = REGISTER_DEFINITIONS.map((def) => def.name);
