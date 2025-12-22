import {
  Avatar,
  Card,
  CardContent,
  CardHeader,
  CircularProgress,
  Stack,
  Typography,
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
import { useSerialPort } from "../lib/serialContext";
import { REGISTER_BY_NAME } from "../lib/registerMap";

const MOTOR_OUTPUT_REGEX = /^\?(\w):(.*)\r?$/;

export const Motors = () => {
  const [motors, setMotors] = useState<{ [key: string]: string }>({});
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>({});
  const portOpen = useSerialPortOpenStatus();
  const serial = useSerialPort();

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
              <div style={{ marginRight: 15 }}>
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
              </div>
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
          <div style={{ height: 35 }} />
          <MotorMonitorGraph motorKey={key} />
        </CardContent>
      </Card>
      ))}
    </Stack>
  );
};
