import {
  Grid,
  Slider,
  TextField,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
} from "@mui/material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
} from "../ParametersAccordion";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { throttle } from "lodash-es";
import { useEffect, useMemo, useState } from "react";
import { useSerialPortRef } from "../../lib/serialContext";
import { useSerialIntervalSender } from "../../lib/useSerialIntervalSender";
import { useSerialLineEvent } from "../../lib/useSerialLineEvent";
import { useParameterSettings } from "../../lib/useParameterSettings";
import { COMMAND_TO_REGISTER_NAME } from "../../lib/commandRegisterMap";
import { REGISTER_BY_NAME } from "../../lib/registerMap";
import { useSerialPort } from "../../lib/serialContext";
import { isBinaryMode } from "../../lib/serialTypes";
import SettingsIcon from "@mui/icons-material/Settings";
import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";

const NUMBER_INPUT_REGEX = /^-?\d*(\.\d*)?$/;

export const FocScalar = (props: {
  motorKey: string;
  command: string;
  label: string;
  defaultMin: number;
  defaultMax: number;
  step: number;
  compact?: boolean;
}) => {
  const fullCommandString = `${props.motorKey}${props.command}`;
  const { expanded, setExpanded, min, setMin, max, setMax } =
    useParameterSettings(fullCommandString, props.defaultMin, props.defaultMax);
  const registerName = COMMAND_TO_REGISTER_NAME[props.command];
  const registerId = registerName ? REGISTER_BY_NAME[registerName].id : null;
  const registerTooltip = registerName ? REGISTER_BY_NAME[registerName]?.tooltip : undefined;
  const registerEncoding = registerName
    ? REGISTER_BY_NAME[registerName]?.encoding
    : undefined;
  const serial = useSerialPort();
  const [boundsOpen, setBoundsOpen] = useState(false);

  const [targetValue, setTargetValue] = useState<number | null>(null); // value sent to controller
  const [value, setValue] = useState<number | null>(null); // value acknowledged by controller, for now not used
  const [displayValue, setDisplayValue] = useState<string>("0");
  const serialRef = useSerialPortRef();

  const formatValue = (val: number) => {
    if (registerEncoding === "u8" || registerEncoding === "u32") {
      return Math.round(val).toString();
    }
    return val.toFixed(6);
  };

  useSerialLineEvent((line) => {
    if (isBinaryMode((serial as any)?.mode)) return;
    if (line.content.startsWith(fullCommandString)) {
      const receivedValue = Number(
        line.content.slice(fullCommandString.length)
      );
      if (!isNaN(receivedValue)) {
        setValue(receivedValue);
        if (targetValue === null) {
          setTargetValue(receivedValue);
        }
      }
    }
  });
  useSerialIntervalSender(fullCommandString, 3000);

  useEffect(() => {
    if (!serial || !isBinaryMode(serial.mode) || registerId === null) return;
    const motorIndex = Number(props.motorKey);
    const fetchVal = async () => {
      await serial.setMotorAddress?.(motorIndex);
      const res = await serial.readRegister?.(registerId);
      if (res) {
        const rawVal = Array.isArray(res.value) ? res.value[0] : res.value;
        if (typeof rawVal === "number") {
          setValue(rawVal);
          setTargetValue((prev) => (prev === null ? rawVal : prev));
          setDisplayValue(formatValue(rawVal));
        }
      }
    };
    fetchVal();
    const handler = (res: any) => {
      if (res.registerId === registerId) {
        const rawVal = Array.isArray(res.value) ? res.value[0] : res.value;
        if (typeof rawVal === "number") {
          setValue(rawVal);
          setTargetValue((prev) => (prev === null ? rawVal : prev));
          setDisplayValue(formatValue(rawVal));
        }
      }
    };
    serial.on("response", handler);
    return () => {
      serial.off("response", handler);
    };
  }, [serial, registerId, props.motorKey]);

  const changeValue = useMemo(
    () =>
      throttle((value: number) => {
        if (isBinaryMode((serialRef.current as any)?.mode) && registerId !== null) {
          serialRef.current
            ?.setMotorAddress?.(Number(props.motorKey))
            .then(() =>
              serialRef.current?.writeRegister?.(registerId, value, {
                expectResponse: true,
              })
            );
        } else {
          serialRef.current?.send(`${fullCommandString}${value}`);
        }
      }, 200),
    [registerId, props.motorKey, serialRef]
  );

  const handleSliderChange = (e: any) => {
    if (e.target.value === 0 && targetValue === null) {
      return;
    }
    setTargetValue(e.target.value);
    setDisplayValue(formatValue(Number(e.target.value)));
    changeValue(e.target.value);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!NUMBER_INPUT_REGEX.test(val)) return;
    setDisplayValue(val);
  };

  useEffect(() => {
    if (typeof targetValue === "number") {
      setDisplayValue(formatValue(targetValue));
    }
  }, [targetValue]);

  const commitDisplayValue = () => {
    if (displayValue === "" || displayValue === "-" || displayValue === "." || displayValue === "-.") {
      setDisplayValue(
        typeof targetValue === "number" ? formatValue(targetValue) : "0"
      );
      return;
    }
    const num = Number(displayValue);
    if (!isNaN(num)) {
      setTargetValue(num);
      changeValue(num);
      setDisplayValue(formatValue(num));
    }
  };

  if (props.compact) {
    return (
      <>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
          <Tooltip title={registerTooltip || ""} disableHoverListener={!registerTooltip}>
            <Typography sx={{ minWidth: 110 }}>{props.label}</Typography>
          </Tooltip>
          <Slider
            value={typeof targetValue === "number" ? targetValue : 0}
            onChange={handleSliderChange}
            min={min}
            max={max}
            step={props.step}
            sx={{ flex: 1 }}
          />
          <TextField
            value={displayValue}
            onChange={handleTextChange}
            variant="standard"
            size="small"
            type="text"
            onBlur={commitDisplayValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDisplayValue();
            }}
            sx={{ width: 90 }}
          />
          <IconButton onClick={() => setBoundsOpen(true)} size="small">
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Box>
        <Dialog open={boundsOpen} onClose={() => setBoundsOpen(false)}>
          <DialogTitle>Bounds for {props.label}</DialogTitle>
          <DialogContent sx={{ display: "flex", gap: 2, mt: 1 }}>
            <TextField
              label="Min"
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              type="number"
              variant="standard"
            />
            <TextField
              label="Max"
              value={max}
              onChange={(e) => setMax(Number(e.target.value))}
              type="number"
              variant="standard"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBoundsOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      sx={{ backgroundColor: "grey.50" }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ alignItems: "center" }}
      >
        <Tooltip title={registerTooltip || ""} disableHoverListener={!registerTooltip}>
          <Typography>{props.label}</Typography>
        </Tooltip>
        <div style={{ flex: 1 }} />
        <Tooltip title={registerTooltip || ""} disableHoverListener={!registerTooltip}>
          <TextField
            value={displayValue}
            onChange={handleTextChange}
            variant="standard"
            sx={{ marginRight: 2 }}
            type="text"
            onBlur={commitDisplayValue}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDisplayValue();
            }}
          />
        </Tooltip>
      </AccordionSummary>
      <AccordionDetails>
        <Grid container spacing={2} alignItems="center">
          <Grid item>
            <TextField
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              size="small"
              type="number"
              variant="standard"
              inputProps={{ style: { textAlign: "center" } }}
              sx={{ width: 70 }}
            />
          </Grid>
          <Grid item xs>
            <Slider
              value={typeof targetValue === "number" ? targetValue : 0}
              track={false}
              onChange={handleSliderChange}
              valueLabelDisplay="on"
              min={min}
              max={max}
              step={props.step}
            />
          </Grid>
          <Grid item>
            <TextField
              value={Number(max.toFixed(6))}
              onChange={(e) => setMax(Number(e.target.value))}
              size="small"
              type="number"
              variant="standard"
              inputProps={{ style: { textAlign: "center" } }}
              sx={{ width: 70 }}
            />
          </Grid>
        </Grid>
      </AccordionDetails>
    </Accordion>
  );
};
