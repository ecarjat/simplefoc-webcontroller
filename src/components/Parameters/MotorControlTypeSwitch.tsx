import {
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useSerialPortRef } from "../../lib/serialContext";
import { useSerialIntervalSender } from "../../lib/useSerialIntervalSender";
import { useSerialLineEvent } from "../../lib/useSerialLineEvent";
import { COMMAND_TO_REGISTER_NAME } from "../../lib/commandRegisterMap";
import { REGISTER_BY_NAME } from "../../lib/registerMap";
import { useSerialPort } from "../../lib/serialContext";

const CONTROL_VALUES = ["torque", "vel", "angle", "vel open", "angle open"];

const CONTROL_VALUE_TO_INDEX = {
  torque: 0,
  vel: 1,
  angle: 2,
  "vel open": 3,
  "angle open": 4,
} as any;

export const MotorControlTypeSwitch = ({ motorKey }: { motorKey: string }) => {
  const fullCommandString = `${motorKey}C`;
  const [value, setValue] = useState<string | null>(null);
  const serialRef = useSerialPortRef();
  const serial = useSerialPort();
  const registerName = COMMAND_TO_REGISTER_NAME["C"];
  const registerId = registerName ? REGISTER_BY_NAME[registerName].id : null;

  const handleChange = (e: any, val: string) => {
    if ((serialRef.current as any)?.mode === "binary" && registerId !== null) {
      serialRef.current
        ?.setMotorAddress?.(Number(motorKey))
        .then(() =>
          serialRef.current?.writeRegister?.(
            registerId,
            CONTROL_VALUE_TO_INDEX[val],
            { expectResponse: true }
          )
        );
    } else {
      serialRef.current?.send(
        `${fullCommandString}${CONTROL_VALUE_TO_INDEX[val]}`
      );
    }
  };

  useSerialLineEvent((line) => {
    if ((serial as any)?.mode === "binary") return;
    if (
      line.content.startsWith(fullCommandString) &&
      // need to filter out the downsample command too which is "{motorKey}CD"
      CONTROL_VALUES.map((val) => fullCommandString + val).some(
        (val) => line.content === val
      )
    ) {
      const receivedValue = line.content.slice(fullCommandString.length);
      setValue(receivedValue);
      console.log(receivedValue);
    }
  });
  useSerialIntervalSender(fullCommandString, 5000);

  useEffect(() => {
    if (!serial || serial.mode !== "binary" || registerId === null) return;
    const motorIndex = Number(motorKey);
    const fetchVal = async () => {
      await serial.setMotorAddress?.(motorIndex);
      const res = await serial.readRegister?.(registerId);
      const rawVal = res?.value;
      const idx =
        typeof rawVal === "number"
          ? rawVal
          : Array.isArray(rawVal)
          ? rawVal[0]
          : null;
      if (typeof idx === "number" && CONTROL_VALUES[idx]) {
        setValue(CONTROL_VALUES[idx]);
      }
    };
    fetchVal();
    const handler = (res: any) => {
      if (res.registerId === registerId) {
        const rawVal = res.value;
        const idx =
          typeof rawVal === "number"
            ? rawVal
            : Array.isArray(rawVal)
            ? rawVal[0]
            : null;
        if (typeof idx === "number" && CONTROL_VALUES[idx]) {
          setValue(CONTROL_VALUES[idx]);
        }
      }
    };
    serial.on("response", handler);
    return () => {
      serial.off("response", handler);
    };
  }, [serial, registerId, motorKey]);

  return (
    <Stack alignItems="center" sx={{ marginBottom: 2 }}>
      <ToggleButtonGroup value={value} exclusive onChange={handleChange}>
        <ToggleButton value="torque">Torque</ToggleButton>
        <ToggleButton value="vel">Velocity</ToggleButton>
        <ToggleButton value="angle">Angle</ToggleButton>
        <ToggleButton value="vel open">Velocity open</ToggleButton>
        <ToggleButton value="angle open">Angle open</ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );
};
