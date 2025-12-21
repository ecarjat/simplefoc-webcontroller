import { RegisterDefinition, RegisterEncoding, RegisterPrimitive } from "./registerMap";

const floatView = new DataView(new ArrayBuffer(4));
const u32View = new DataView(new ArrayBuffer(4));

const encodePrimitive = (type: RegisterPrimitive, value: number): Uint8Array => {
  switch (type) {
    case "u8":
      return Uint8Array.from([value & 0xff]);
    case "u32":
      u32View.setUint32(0, value >>> 0, true);
      return new Uint8Array(u32View.buffer.slice(0));
    case "f32":
      floatView.setFloat32(0, value, true);
      return new Uint8Array(floatView.buffer.slice(0));
  }
};

export const encodeRegisterValue = (
  definition: RegisterDefinition,
  value: number | number[] | Uint8Array
): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  const encoding = definition.encoding;
  if (typeof encoding === "string") {
    return encodePrimitive(encoding, value as number);
  }
  if (encoding.kind === "composite") {
    const arr = encoding.parts.map((part, idx) =>
      encodePrimitive(part, Array.isArray(value) ? (value as number[])[idx] : 0)
    );
    return concat(arr);
  }
  return Uint8Array.from([]);
};

const decodePrimitive = (type: RegisterPrimitive, payload: DataView, offset: number) => {
  switch (type) {
    case "u8":
      return { value: payload.getUint8(offset), size: 1 };
    case "u32":
      return { value: payload.getUint32(offset, true), size: 4 };
    case "f32":
      return { value: payload.getFloat32(offset, true), size: 4 };
  }
};

export const decodeRegisterValue = (
  encoding: RegisterEncoding,
  payload: Uint8Array,
  offset = 0
): { value: number | number[]; size: number } => {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  if (typeof encoding === "string") {
    return decodePrimitive(encoding, view, offset);
  }
  if (encoding.kind === "composite") {
    const values: number[] = [];
    let cursor = offset;
    encoding.parts.forEach((part) => {
      const decoded = decodePrimitive(part, view, cursor);
      values.push(decoded.value);
      cursor += decoded.size;
    });
    return { value: values, size: cursor - offset };
  }
  return { value: 0, size: 0 };
};

export const concat = (arrays: Uint8Array[]) => {
  const total = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((arr) => {
    result.set(arr, offset);
    offset += arr.length;
  });
  return result;
};
