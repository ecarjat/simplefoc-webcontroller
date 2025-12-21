## Goal
- Add BinaryIO/PacketCommander support alongside the existing ASCII path, selectable at connection time (same screen as baud rate).
- Keep the UI/UX framework intact while swapping the transport, parsing, and command-generation layers behind a serial abstraction with two implementations (Binary + current ASCII).

## Protocol recap (BinaryIO + PacketCommander)
- Frame format: `0xA5 | size | type | payload` where `size = payload_bytes + 1` (includes the `type` byte). Little-endian for floats/uint32 values.
- Packet types (from `RegisterIO.h`): `REGISTER ('R')` for reads/writes, `RESPONSE ('r')` echoed responses, `TELEMETRY_HEADER ('H')`, `TELEMETRY ('T')`, `ALERT ('A')`, `DEBUG ('D')`, `SYNC ('S')`.
- Register read: send `A5 02 52 regId` → expect `r` packet echoing `regId` + value(s).
- Register write: send `A5 (len) 52 regId <data>`; response is still `r regId <data>` if echo enabled.
- Telemetry header: `A5 (2*n+2) 48 telemetryId <motorIdx><regId>...` (separator bytes are omitted in binary).
- Telemetry data: `A5 (1+sum(value sizes)+1) 54 telemetryId <serialized register values>`.
- SYNC: send `S` packet to confirm protocol; controller replies with `S 0x01`.

## Current UI behaviors to migrate
- Serial transport uses text streams (`TextEncoderStream`/`TextDecoderStream` + `LineBreakTransformer`) with line events.
- Discovery: `?` command → `?<motorKey>:<name>` lines populate motor list.
- Control: writes textual motor commands (`E`, `C`, `VP`, `VI`, `VD`, `VR`, `VL`, `VF`, `AP`, `AL`, `CD`, target, etc.).
- Monitoring: listens for `M...` tab-separated lines for graph data; downsample/enable controlled via text commands (`NMC`, `NMS...`).
- Manual prompt sends raw text.

## Register mapping for existing controls (BinaryIO)
- Enable/disable → `REG_ENABLE (0x04)` (uint8: 0/1).
- Control mode (torque/vel/angle/open variants) → `REG_CONTROL_MODE (0x05)`; torque/open flavor may need `REG_TORQUE_MODE (0x06)` depending on firmware mapping.
- Target setpoint → `REG_TARGET (0x01)` (float).
- Motion downsample → `REG_MOTION_DOWNSAMPLE (0x5F)` (uint8).
- Velocity PID: `VP/VI/VD/VR/VL/VF` → `REG_VEL_PID_P (0x30)`, `REG_VEL_PID_I (0x31)`, `REG_VEL_PID_D (0x32)`, `REG_VEL_PID_RAMP (0x34)`, `REG_VEL_PID_LIM (0x33)`, `REG_VEL_LPF_T (0x35)`.
- Angle PID: `AP`, `AL` → `REG_ANG_PID_P (0x36)`, `REG_ANG_PID_LIM (0x39)` (plus others if needed).
- Telemetry: configure via registers `REG_TELEMETRY_REG (0x1A)`, `REG_TELEMETRY_CTRL (0x1B)`, `REG_TELEMETRY_DOWNSAMPLE (0x1C)`, `REG_TELEMETRY_MIN_ELAPSED (0x1E)`.
- Motor count/address: `REG_NUM_MOTORS (0x70)`, `REG_MOTOR_ADDRESS (0x7F)` to switch target motor.
- Iteration rate for debug graphs: `REG_ITERATIONS_SEC (0x1D)` (optional).
- Telemetry registers for graph: `[REG_TARGET, REG_POSITION, REG_SENSOR_ANGLE, REG_VELOCITY]`; motor indices mirror graph selection; motor names are numeric `0, 1, ...`.

## Plan
1) **Align firmware expectations**
   - Ensure target firmware runs `PacketCommander` with `BinaryIO` enabled; ASCII remains supported for legacy mode.
   - Motor labels in UI will just be motor indices (`0`, `1`, ...); no extra metadata required.

2) **Introduce serial abstraction layer**
   - Define a mode-agnostic interface (open/close/send command, subscribe to responses/telemetry, register read/write helpers).
   - Implement two backends: existing ASCII (current behavior) and new BinaryIO/PacketCommander.
   - Update connection UI to pick mode (ASCII/Binary) alongside baud rate; wire selection to the abstraction factory.

3) **Design binary transport layer**
   - Replace `LineBreakTransformer` with a byte-oriented reader on `SerialPort.readable` (e.g., `ReadableStream<Uint8Array>`).
   - Implement a BinaryIO-compatible parser (state machine): seek `0xA5`, read `size`, `type`, accumulate `payload`, expose parsed packets/events.
   - Provide encoder helpers to build frames: register read/write, telemetry config, SYNC; enforce little-endian encoding.
   - Expose higher-level events (`packet`, `telemetry`, `response`, `alert`, `debug`) instead of `line`.

4) **Add register-level client API**
   - Create a service wrapping the transport to send register reads/writes and await responses (with optional timeouts/retries and resync if `in_sync` lost).
   - Implement SYNC handshake on connect; fall back/alert if no binary ack.
   - Provide helpers for multi-register telemetry setup and for switching current motor (`REG_MOTOR_ADDRESS`).

5) **Migrate feature flows to register calls (binary) behind the abstraction**
   - Motor discovery: read `REG_NUM_MOTORS`; iterate addresses via `REG_MOTOR_ADDRESS` to query essentials (status, control mode, target) and populate UI with numeric names.
   - Control widgets (`FocBoolean`, `FocScalar`, `MotorControlTypeSwitch`) call register writes/reads per mapping above instead of string concatenation.
   - Serial prompt: add a binary register DSL using register names (e.g., `get TARGET`, `set ENABLE 1`, `telemetry 0 TARGET POSITION SENSOR_ANGLE VELOCITY 200Hz`) plus a raw-bytes escape; keep ASCII path in legacy mode.

6) **Telemetry/graphing overhaul**
   - On connect, program telemetry registers (via `REG_TELEMETRY_*`) to emit `[REG_TARGET, REG_POSITION, REG_SENSOR_ANGLE, REG_VELOCITY]` for the selected motor(s), respecting `TELEMETRY_MAX_REGISTERS` and motor indices.
   - Telemetry rate: UI shows frequency in Hz and converts to `REG_TELEMETRY_MIN_ELAPSED` microseconds (use min-elapsed as primary rate control; downsample can stay at default unless explicitly exposed).
   - Parse `H` packets to build trace metadata; parse `T` packets to update graph data arrays (little-endian decode per register type).
   - Replace `useSerialLineEvent` consumers with telemetry/response subscriptions and adjust buffer sizes/backpressure handling.

7) **UI plumbing and state updates**
   - Update contexts/hooks: `serialContext` should expose packet stream, register client, telemetry data; update `useSerialIntervalSender` to a scheduler that issues register reads/writes.
   - Revise `SerialOutputViewer` to display parsed packets (type + fields) and optionally raw hex for debugging; keep ASCII view when in legacy mode.
   - Gate ASCII-only helpers (`LineBreakTransformer`, text commands) behind the legacy implementation; binary mode uses the new parser.
   - Add prompt autocomplete: prefix-based suggestions for DSL keywords and register names; tab/enter to accept; fallback to free text.

8) **Testing & validation**
   - Unit-test packet parser against captured frames (responses, telemetry headers/data, partial frames, resync cases).
   - Simulate register read/write round-trips with a mock SerialPort to verify encoding/decoding.
   - End-to-end manual test with hardware: connect, SYNC, enumerate motors, toggle enable, change control mode/target, verify telemetry plots update at expected rates.

## Open questions/decisions
- None pending.
