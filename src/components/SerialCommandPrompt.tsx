import { Autocomplete, Chip, Stack, TextField } from "@mui/material";
import { Box } from "@mui/system";
import { KeyboardEventHandler, useMemo, useState } from "react";
import { useSerialPort } from "../lib/serialContext";
import { REGISTER_NAME_LIST } from "../lib/registerMap";

export const SerialCommandPrompt = () => {
  const serial = useSerialPort();
  const [promptValue, setPromptValue] = useState("");

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.code === "Enter" && serial) {
      e.preventDefault();
      e.stopPropagation();
      serial.send(promptValue);
      setPromptValue("");
    }
  };

  const handleStoredCommandClick = (command: string) => () => {
    serial?.send(command);
  };

  const handleRestart = () => {
    serial?.restartTarget?.();
  };

  const suggestionState = useMemo(() => {
    const COMMANDS = ["get", "set", "telemetry", "raw", "sync"];
    const FREQ = ["10Hz", "25Hz", "50Hz", "100Hz", "200Hz"];

    const hasTrailingSpace = /\s$/.test(promptValue);
    const tokens = promptValue.trim().length
      ? promptValue.trim().split(/\s+/)
      : [];
    const activeIndex = hasTrailingSpace
      ? tokens.length
      : Math.max(tokens.length - 1, 0);
    const activeTokenRaw =
      hasTrailingSpace || tokens.length === 0 ? "" : tokens[tokens.length - 1];
    const command = tokens[0]?.toLowerCase();

    // first token: only commands
    if (activeIndex === 0) {
      return { options: COMMANDS, activeToken: activeTokenRaw };
    }

    if (command === "get" || command === "read") {
      return { options: REGISTER_NAME_LIST, activeToken: activeTokenRaw };
    }

    if (command === "set" || command === "write") {
      if (activeIndex === 1) {
        return { options: REGISTER_NAME_LIST, activeToken: activeTokenRaw };
      }
      return { options: [], activeToken: activeTokenRaw };
    }

    if (command === "telemetry") {
      if (activeIndex === 1) {
        return { options: ["0", "1", "2", "3"], activeToken: activeTokenRaw };
      }
      const looksLikeFreq = /hz$/i.test(activeToken);
      return {
        options: looksLikeFreq ? FREQ : REGISTER_NAME_LIST,
        activeToken: activeTokenRaw,
      };
    }

    if (command === "raw") {
      return { options: [], activeToken: activeTokenRaw };
    }

    return { options: COMMANDS, activeToken: activeTokenRaw };
  }, [promptValue]);

  return (
    <Stack gap={2}>
      <Box flex={1} sx={{ display: "flex", width: "100%" }}>
        <Autocomplete
          fullWidth
          freeSolo
          options={suggestionState.options}
          filterOptions={(options) => {
            const active = suggestionState.activeToken.toLowerCase();
            if (!active) return options;
            return options.filter((opt) =>
              opt.toLowerCase().startsWith(active)
            );
          }}
          inputValue={promptValue}
          onInputChange={(_, value, reason) => {
            if (reason === "input" || reason === "clear") {
              setPromptValue(value);
            }
          }}
          onChange={(_, newValue, reason) => {
            if (reason !== "selectOption" || !newValue) return;
            const hasTrailingSpace = /\s$/.test(promptValue);
            const tokens = promptValue.trim().length
              ? promptValue.trim().split(/\s+/)
              : [];
            const activeIndex = hasTrailingSpace
              ? tokens.length
              : Math.max(tokens.length - 1, 0);
            const nextTokens = [...tokens];
            nextTokens[activeIndex] = newValue;
            const rebuilt = nextTokens.join(" ") + " ";
            setPromptValue(rebuilt);
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              disabled={!serial}
              variant="outlined"
              label="Command"
              onKeyDown={handleKeyDown}
              sx={{ flex: 1, width: "100%" }}
              fullWidth
            />
          )}
        />
      </Box>
      <Stack gap={3} direction={"row"}>
        <Chip clickable label="Restart" onClick={handleRestart} />
        {serial?.mode === "ascii" && (
          <>
            <Chip
              clickable
              label="Disable monitoring"
              onClick={handleStoredCommandClick("NMC")}
            />
            <Chip
              clickable
              label="Enable monitoring"
              onClick={handleStoredCommandClick("NMS01100011")}
            />
          </>
        )}
        {serial?.mode === "binary" && (
          <Chip
            clickable
            label="Telemetry (binary)"
            onClick={handleStoredCommandClick(
              "telemetry 0 TARGET POSITION SENSOR_ANGLE VELOCITY 50Hz"
            )}
          />
        )}
      </Stack>
    </Stack>
  );
};
