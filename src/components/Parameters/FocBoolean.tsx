import { Stack, Switch, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useSerialPort } from "../../lib/serialContext";
import { useSerialIntervalSender } from "../../lib/useSerialIntervalSender";
import { useSerialLineEvent } from "../../lib/useSerialLineEvent";
import { COMMAND_TO_REGISTER_NAME } from "../../lib/commandRegisterMap";
import { REGISTER_BY_NAME } from "../../lib/registerMap";

export const FocBoolean = (props: {
  label: string;
  motorKey: string;
  onLabel: string;
  offLabel: string;
  command: string;
  onValue: string;
  offValue: string;
  onValueChange?: (value: boolean) => void;
}) => {
  const fullCommandString = `${props.motorKey}${props.command}`;
  const registerName = COMMAND_TO_REGISTER_NAME[props.command];
  const registerId = registerName ? REGISTER_BY_NAME[registerName].id : null;

  const [value, setValue] = useState(false);
  const serialPort = useSerialPort();
  const motorIndex = Number(props.motorKey);
  useSerialLineEvent((line) => {
    if (serialPort?.mode === "binary") return;
    if (line.content.startsWith(fullCommandString)) {
      const receivedValue = line.content.slice(fullCommandString.length);
      if (receivedValue !== props.onValue && receivedValue !== props.offValue) {
        console.warn(
          `Received value for motor ${props.motorKey} and command ${props.command} which doesn't match on or off value: ${line.content}`,
          { onValue: props.onValue, offValue: props.offValue }
        );
        return;
      }
      setValue(receivedValue === props.onValue ? true : false);
      props.onValueChange?.(receivedValue === props.onValue);
    }
  });

  useEffect(() => {
    if (!serialPort || serialPort.mode !== "binary" || registerId === null)
      return;
    const fetchVal = async () => {
      await serialPort.setMotorAddress?.(motorIndex);
      const res = await serialPort.readRegister?.(registerId);
      if (res && typeof res.value === "number") {
        setValue(res.value === Number(props.onValue));
        props.onValueChange?.(res.value === Number(props.onValue));
      }
    };
    fetchVal();
  }, [serialPort, registerId, motorIndex]);

  useEffect(() => {
    if (!serialPort || serialPort.mode !== "binary" || registerId === null)
      return;
    const handler = (res: any) => {
      if (res.registerId === registerId && typeof res.value === "number") {
        setValue(res.value === Number(props.onValue));
        props.onValueChange?.(res.value === Number(props.onValue));
      }
    };
    serialPort.on("response", handler);
    return () => {
      serialPort.off("response", handler);
    };
  }, [serialPort, registerId]);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (serialPort?.mode === "binary" && registerId !== null) {
      serialPort
        .setMotorAddress?.(motorIndex)
        .then(() =>
          serialPort.writeRegister?.(
            registerId,
            event.target.checked ? Number(props.onValue) : Number(props.offValue)
          )
        );
      setValue(event.target.checked);
      props.onValueChange?.(event.target.checked);
    } else {
      serialPort?.send(
        `${fullCommandString}${
          event.target.checked ? props.onValue : props.offValue
        }`
      );
      setValue(event.target.checked);
      props.onValueChange?.(event.target.checked);
    }
  };

  useSerialIntervalSender(fullCommandString, 5000);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography>{props.offLabel}</Typography>
      <Switch checked={value} onChange={onChange} />
      <Typography>{props.onLabel}</Typography>
    </Stack>
  );
};
