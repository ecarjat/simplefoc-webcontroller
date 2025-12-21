import { RegisterName } from "./registerMap";

export const COMMAND_TO_REGISTER_NAME: Record<string, RegisterName> = {
  "": "TARGET",
  E: "ENABLE",
  C: "CONTROL_MODE",
  CD: "MOTION_DOWNSAMPLE",
  VP: "VEL_PID_P",
  VI: "VEL_PID_I",
  VD: "VEL_PID_D",
  VR: "VEL_PID_RAMP",
  VL: "VEL_PID_LIM",
  VF: "VEL_LPF_T",
  AP: "ANG_PID_P",
  AL: "ANG_PID_LIM",
};
