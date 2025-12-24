# Motor Configuration Download/Upload Specification

## Overview
This feature allows users to download all motor settings to a text file and upload previously saved configurations to restore motor parameters.

## Download Functionality

### Button Placement
- Located next to the Save button in the CardHeader
- Visible only when `serial?.mode === "binary"`
- Small outlined button to match the Save button style

### File Format
- **Filename**: `motor_<motorKey>_config_<timestamp>.txt`
  - Example: `motor_0_config_20250624_143022.txt`
- **Format**: Plain text, key-value pairs
- **Structure**:
  ```
  # Motor Configuration Export
  # Motor: <motorKey>
  # Date: <ISO timestamp>
  #

  MOTOR_KEY=<motorKey>
  ENABLE=<0|1>

  # Control Parameters
  CONTROL_TYPE=<value>
  TARGET=<value>
  MOTION_DOWNSAMPLE=<value>

  # Velocity PID
  VELOCITY_P=<value>
  VELOCITY_I=<value>
  VELOCITY_D=<value>
  VELOCITY_RAMP=<value>
  VELOCITY_LIMIT=<value>
  VELOCITY_FILTER=<value>

  # Angle PID
  ANGLE_P=<value>
  ANGLE_I=<value>
  ANGLE_D=<value>
  ANGLE_RAMP=<value>
  ANGLE_LIMIT=<value>
  ANGLE_FILTER=<value>

  # Motor Parameters
  VOLTAGE_LIMIT=<value>
  CURRENT_LIMIT=<value>
  DRIVER_VOLTAGE_LIMIT=<value>
  PWM_FREQUENCY=<value>
  DRIVER_VOLTAGE_PSU=<value>
  POLE_PAIRS=<value>
  PHASE_RESISTANCE=<value>
  KV=<value>
  INDUCTANCE=<value>
  ```

### Download Process
1. User clicks Download button
2. System reads all current register values for the motor
3. Formats data into text file
4. Browser downloads file with generated filename
5. No server communication required (client-side only)

## Upload Functionality

### Button Placement
- Located next to the Download button in the CardHeader
- Visible only when `serial?.mode === "binary"`
- Small outlined button to match other buttons

### File Selection
- Opens browser file picker
- Accepts `.txt` files
- No file size restrictions (configs should be small)

### Upload Process
1. User clicks Upload button
2. File picker opens
3. User selects a config file
4. System parses the file:
   - Validates format
   - Extracts key-value pairs
   - Ignores comments (lines starting with #)
   - Ignores empty lines
5. For each valid parameter:
   - Maps parameter name to register ID
   - Writes value to the appropriate register
   - Uses `serial.writeRegister()` for binary mode
6. Shows success/error feedback

### Validation Rules
- File must be plain text
- Parameter names must match expected format
- Values must be valid numbers (except MOTOR_KEY, ENABLE)
- Unknown parameters are ignored (logged to console)
- Invalid values skip that parameter (logged to console)

### Error Handling
- Invalid file format: Alert user with error message
- Missing parameters: Continue with available parameters
- Invalid values: Skip parameter, log warning
- Serial communication errors: Alert user

## Register Mapping

Registers included in configuration export/import are defined in `src/lib/registerMap.ts` using the `includeInConfig: true` property.

Currently supported registers:
- **Control Parameters**: `MOTION_DOWNSAMPLE`
- **Velocity PID**: `VEL_PID_P`, `VEL_PID_I`, `VEL_PID_D`, `VEL_PID_LIM`, `VEL_PID_RAMP`, `VEL_LPF_T`
- **Angle PID**: `ANG_PID_P`, `ANG_PID_I`, `ANG_PID_D`, `ANG_PID_LIM`, `ANG_PID_RAMP`, `ANG_LPF_T`
- **Motor Parameters**: `VOLTAGE_LIMIT`, `CURRENT_LIMIT`, `VELOCITY_LIMIT`, `DRIVER_VOLTAGE_LIMIT`, `PWM_FREQUENCY`, `DRIVER_VOLTAGE_PSU`, `POLE_PAIRS`, `PHASE_RESISTANCE`, `KV`, `INDUCTANCE`

**Excluded from config** (runtime state, not persisted):
- `ENABLE` - Motor enable state
- `TARGET` - Current target value
- `CONTROL_MODE` - Control mode selector
- `TORQUE_MODE` - Torque mode selector

To add/remove registers from config export, modify the `includeInConfig` property in `REGISTER_DEFINITIONS`.

## User Experience

### Success Feedback
- Download: File downloads automatically
- Upload: Brief success message or toast notification

### Error Feedback
- File parse errors: Alert with specific error
- Communication errors: Alert with error details
- Console logs for debugging

## Security Considerations
- All file operations are client-side only
- No server upload/storage
- User has full control over file location
- File contents are plain text (human-readable and editable)

## Future Enhancements (Not in Initial Implementation)
- Export/import all motors at once
- JSON format option
- Configuration presets library
- Diff view before applying uploaded config
