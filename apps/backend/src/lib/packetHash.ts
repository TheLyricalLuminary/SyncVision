import { createHash } from 'crypto';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue     = JsonPrimitive | JsonObject | JsonArray;
export interface JsonObject { [key: string]: JsonValue }
export type JsonArray = JsonValue[];

function sortKeys(val: JsonValue): JsonValue {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return (val as JsonArray).map(sortKeys);
  const out: JsonObject = {};
  for (const k of Object.keys(val as JsonObject).sort()) {
    out[k] = sortKeys((val as JsonObject)[k]);
  }
  return out;
}

export function canonicalize(obj: JsonValue): string {
  return JSON.stringify(sortKeys(obj));
}

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// Pre-format a number to a fixed number of decimal places,
// returning a JS number (not a string) so JSON.stringify keeps it numeric.
export function fixedNum(n: number, decimals: number): number {
  return parseFloat(n.toFixed(decimals));
}
