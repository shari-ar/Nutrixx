import type { JsonValue } from './primitives.js';

function assertValidUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        throw new TypeError('Canonical JSON cannot contain a lone surrogate.');
      }
      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError('Canonical JSON cannot contain a lone surrogate.');
    }
  }
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(
        'Canonical JSON numbers must be finite and cannot be negative zero.',
      );
    }
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON objects must be plain objects.');
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      assertValidUnicode(key);
      return `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`;
    })
    .join(',')}}`;
}

export function canonicalizeJson(value: JsonValue): string {
  return canonicalize(value);
}
