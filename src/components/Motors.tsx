import {
  Avatar,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Button,
  TextField,
  Stack,
  Typography,
  Tooltip,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from "./ParametersAccordion";
import { red, green } from "@mui/material/colors";
import { useEffect, useState } from "react";
import { useSerialIntervalSender } from "../lib/useSerialIntervalSender";
import { useSerialLineEvent } from "../lib/useSerialLineEvent";
import { FocBoolean } from "./Parameters/FocBoolean";
import { FocScalar } from "./Parameters/FocScalar";
import { MotorMonitorGraph } from "./MotorMonitorGraph";
import { useSerialPortOpenStatus } from "../lib/serialContext";
import { MotorControlTypeSwitch } from "./Parameters/MotorControlTypeSwitch";
import { useSerialPort, useSerialPortRef } from "../lib/serialContext";
import { REGISTER_BY_NAME } from "../lib/registerMap";
import Box from "@mui/material/Box";

const MOTOR_OUTPUT_REGEX = /^\?(\w):(.*)\r?$/;
const NUMBER_INPUT_REGEX = /^-?\d*(\.\d*)?$/;

const ParameterRegisterInput = ({
  motorKey,
  registerName,
  label,
}: {
  motorKey: string;
  registerName: keyof typeof REGISTER_BY_NAME;
  label: string;
}) => {
  const serial = useSerialPort();
  const serialRef = useSerialPortRef();
  const registerId = REGISTER_BY_NAME[registerName]?.id ?? null;
  const [value, setValue] = useState<number | null>(null);
  const [display, setDisplay] = useState<string>("0");
  const encoding = REGISTER_BY_NAME[registerName]?.encoding;
  const formatValue = (val: number) => {
    if (encoding === "u8" || encoding === "u32") {
      return Math.round(val).toString();
    }
    return val.toFixed(6);
  };

  useEffect(() => {
    if (!serial || serial.mode !== "binary" || registerId === null) return;
    let cancelled = false;
    let gotResponse = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    const fetchVal = async () => {
      await serial.setMotorAddress?.(Number(motorKey));
      const res = await serial.readRegister?.(registerId);
      if (cancelled) return;
      const rawVal = Array.isArray(res?.value) ? res?.value[0] : res?.value;
      if (typeof rawVal === "number") {
        gotResponse = true;
        setValue(rawVal);
        setDisplay(formatValue(rawVal));
      } else if (!gotResponse && !cancelled) {
        retryTimeout = setTimeout(fetchVal, 2000);
      }
    };
    fetchVal();
    const handler = (res: any) => {
      if (res.registerId === registerId) {
        const rawVal = Array.isArray(res.value) ? res.value[0] : res.value;
        if (typeof rawVal === "number") {
          gotResponse = true;
          if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
          }
          setValue(rawVal);
          setDisplay(formatValue(rawVal));
        }
      }
    };
    serial.on("response", handler);
    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      serial.off("response", handler);
    };
  }, [serial, registerId, motorKey]);

  useEffect(() => {
    if (typeof value === "number") {
      setDisplay(formatValue(value));
    }
  }, [value]);

  const commit = async () => {
    if (display === "" || display === "-" || display === "." || display === "-.") {
      setDisplay(value !== null ? formatValue(value) : "0");
      return;
    }
    const num = Number(display);
    if (isNaN(num)) return;
    setValue(num);
    if (serialRef.current?.mode === "binary" && registerId !== null) {
      await serialRef.current
        ?.setMotorAddress?.(Number(motorKey))
        .then(() =>
          serialRef.current?.writeRegister?.(registerId, num, {
            expectResponse: true,
          })
        );
    } else {
      serialRef.current?.send?.(`set ${registerName} ${num}`);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!NUMBER_INPUT_REGEX.test(val)) return;
    setDisplay(val);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Tooltip
        title={REGISTER_BY_NAME[registerName]?.tooltip || ""}
        disableHoverListener={!REGISTER_BY_NAME[registerName]?.tooltip}
      >
        <TextField
          size="small"
          type="text"
          value={display}
          onChange={onChange}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          inputProps={{ style: { textAlign: "right" } }}
        />
      </Tooltip>
    </Box>
  );
};

export const Motors = () => {
  const [motors, setMotors] = useState<{ [key: string]: string }>({});
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>({});
  const portOpen = useSerialPortOpenStatus();
  const serial = useSerialPort();
  const serialRef = useSerialPortRef();

  useEffect(() => {
    setMotors({});
    setEnabledState({});
  }, [serial]);

  useSerialIntervalSender("?", 10000);
  useSerialLineEvent((line) => {
    if (serial?.mode === "binary") return;
    const match = line.content.match(MOTOR_OUTPUT_REGEX);
    if (match) {
      setMotors((m) => ({
        ...m,
        [match[1]]: match[2],
      }));
    }
    const enableMatch = line.content.match(/^(\w)E([01])/);
    if (enableMatch) {
      const motorKey = enableMatch[1];
      const val = enableMatch[2] === "1";
      setEnabledState((prev) => ({ ...prev, [motorKey]: val }));
    }
  });

  useEffect(() => {
    if (!serial || serial.mode !== "binary") return;
    let cancelled = false;
    const load = async () => {
    const res = await serial.readRegister?.(REGISTER_BY_NAME.NUM_MOTORS.id);
    const countRaw = res?.value as number | number[] | undefined;
    const count =
      typeof countRaw === "number"
        ? countRaw
          : Array.isArray(countRaw)
          ? countRaw[0]
          : 0;
    const next: { [key: string]: string } = {};
    const nextEnabled: Record<string, boolean> = {};
    for (let i = 0; i < (count || 0); i++) {
      next[i.toString()] = i.toString();
      await serial.setMotorAddress?.(i);
      const enabledRes = await serial.readRegister?.(REGISTER_BY_NAME.ENABLE.id);
      const enabledVal =
        typeof enabledRes?.value === "number"
          ? enabledRes.value
          : Array.isArray(enabledRes?.value)
          ? enabledRes?.value[0]
          : 0;
      nextEnabled[i.toString()] = !!enabledVal;
    }
    if (!cancelled) {
      setMotors(next);
      setEnabledState(nextEnabled);
    }
  };
    load();
    return () => {
      cancelled = true;
    };
  }, [serial]);

  if (!Object.keys(motors).length) {
    if (!portOpen) {
      return (
        <Stack gap={3} alignItems="center">
          <Typography variant="h4" sx={{ color: "grey.600" }}>
            Waiting for connection...
          </Typography>
        </Stack>
      );
    }
    return (
      <Stack gap={3} alignItems="center">
        <CircularProgress sx={{ color: "grey.600" }} />
        <Typography variant="h4" sx={{ color: "grey.600" }}>
          Waiting for motors list from controller...
        </Typography>
        <Typography sx={{ color: "grey.600" }}>
          Make sure to use "machine_readable" verbose mode
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack>
      {Object.entries(motors).map(([key, name]) => (
        <Card key={key}>
          <CardHeader
            title={
              <Typography variant="h5">
                {name === key ? "" : `${name}`}
              </Typography>
            }
            avatar={
              <Avatar
                sx={{
                  bgcolor: enabledState[key] ? green[500] : red[500],
                  transition: "background-color 0.2s ease",
                }}
              >
                {key}
              </Avatar>
            }
            action={
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 2 }}>
                {serial?.mode === "binary" && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => serialRef.current?.send?.("save")}
                  >
                    Save
                  </Button>
                )}
                <FocBoolean
                  command="E"
                  label="Enabled"
                  motorKey={key}
                  offLabel="Off"
                  onLabel="On"
                  offValue="0"
                  onValue="1"
                  onValueChange={(val) =>
                    setEnabledState((prev) => ({ ...prev, [key]: val }))
                  }
                />
              </Stack>
            }
          />
          <CardContent>
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Control</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack gap={1}>
                  <MotorControlTypeSwitch motorKey={key} />
                  <FocScalar
                    motorKey={key}
                    command=""
                    label="Target"
                    defaultMin={-20}
                    defaultMax={20}
                    step={0.01}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="CD"
                    label="Motion loop downsample"
                    defaultMin={0}
                    defaultMax={30}
                    step={1}
                    compact
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Velocity PID</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack gap={1}>
                  <FocScalar
                    motorKey={key}
                    command="VP"
                    label="Proportional"
                    defaultMin={0}
                    defaultMax={5}
                    step={0.01}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="VI"
                    label="Integral"
                    defaultMin={0}
                    defaultMax={40}
                    step={0.01}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="VD"
                    label="Derivative"
                    defaultMin={0}
                    defaultMax={1}
                    step={0.0001}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="VR"
                    label="Output Ramp"
                    defaultMin={0}
                    defaultMax={10000}
                    step={0.0001}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="VL"
                    label="Output Limit"
                    defaultMin={0}
                    defaultMax={24}
                    step={0.0001}
                    compact
                  />
                  <FocScalar
                    motorKey={key}
                    command="VF"
                    label="Filtering"
                    defaultMin={0}
                    defaultMax={0.2}
                    step={0.001}
                    compact
                  />
                </Stack>
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Angle PID</Typography>
            </AccordionSummary>
          <AccordionDetails>
            <Stack gap={1}>
              <FocScalar
                motorKey={key}
                command="AP"
                  label="Proportional"
                  defaultMin={0}
                  defaultMax={5}
                  step={0.01}
                  compact
                />
                <FocScalar
                  motorKey={key}
                  command="AI"
                  label="Integral"
                  defaultMin={0}
                  defaultMax={40}
                  step={0.01}
                  compact
                />
                <FocScalar
                  motorKey={key}
                  command="AD"
                  label="Derivative"
                  defaultMin={0}
                  defaultMax={1}
                  step={0.0001}
                  compact
                />
                <FocScalar
                  motorKey={key}
                  command="AR"
                  label="Output Ramp"
                  defaultMin={0}
                  defaultMax={10000}
                  step={0.0001}
                  compact
                />
                <FocScalar
                  motorKey={key}
                  command="AL"
                  label="Output Limit"
                  defaultMin={0}
                  defaultMax={24}
                  step={0.0001}
                  compact
                />
                <FocScalar
                  motorKey={key}
                  command="AF"
                  label="Filtering"
                  defaultMin={0}
                  defaultMax={0.2}
                  step={0.001}
                  compact
                />
              </Stack>
            </AccordionDetails>
          </Accordion>
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography>Parameters</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Stack spacing={2} sx={{ flex: 1 }}>
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="VOLTAGE_LIMIT"
                    label="Voltage Limit"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="CURRENT_LIMIT"
                    label="Current Limit"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="VELOCITY_LIMIT"
                    label="Velocity Limit"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="DRIVER_VOLTAGE_LIMIT"
                    label="Driver Voltage Limit"
                  />
                </Stack>
                <Stack spacing={2} sx={{ flex: 1 }}>
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="PWM_FREQUENCY"
                    label="PWM Frequency"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="DRIVER_VOLTAGE_PSU"
                    label="Driver Voltage PSU"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="POLE_PAIRS"
                    label="Pole Pairs"
                  />
                </Stack>
                <Stack spacing={2} sx={{ flex: 1 }}>
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="PHASE_RESISTANCE"
                    label="Phase Resistance"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="KV"
                    label="KV"
                  />
                  <ParameterRegisterInput
                    motorKey={key}
                    registerName="INDUCTANCE"
                    label="Inductance"
                  />
                </Stack>
              </Box>
            </AccordionDetails>
          </Accordion>
          <div style={{ height: 55 }} />
          <MotorMonitorGraph motorKey={key} />
        </CardContent>
      </Card>
      ))}
    </Stack>
  );
};
