import * as z from 'zod';

export const CANONICAL_SCHEMA_VERSION = 1 as const;

export const CanonicalIdSchema = z
  .uuid()
  .meta({ description: 'Opaque, provider-neutral canonical identifier.' });

export const CanonicalCodeSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/)
  .meta({
    description:
      'Stable lowercase code composed of dot- or hyphen-delimited segments.',
  });

export const CanonicalDecimalSchema = z
  .string()
  .regex(
    /^(?:0(?:\.\d*[1-9])?|[1-9]\d*(?:\.\d*[1-9])?|-(?:0\.\d*[1-9]|[1-9]\d*(?:\.\d*[1-9])?))$/,
  )
  .meta({
    description:
      'Canonical base-10 decimal without exponent, leading plus, trailing fractional zero, or negative zero.',
    examples: ['0', '0.125', '-0.5', '1200.01'],
  });

export const NonnegativeCanonicalDecimalSchema = z
  .string()
  .regex(/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/)
  .meta({
    description: 'Nonnegative canonical base-10 decimal.',
    examples: ['0', '0.125', '1200.01'],
  });

export const CanonicalFractionSchema = z
  .string()
  .regex(/^(?:0(?:\.\d*[1-9])?|1)$/)
  .meta({
    description:
      'Canonical decimal fraction in the inclusive range zero to one.',
    examples: ['0', '0.95', '1'],
  });

export const UtcInstantSchema = z.iso.datetime({ precision: 3 }).meta({
  description: 'UTC RFC 3339 instant with exactly millisecond precision.',
  examples: ['2026-09-29T10:15:30.000Z'],
});

export const IanaTimeZoneSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^(?:UTC|[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)+)$/)
  .meta({
    description:
      'IANA time zone identifier used to interpret local civil time.',
    examples: ['Asia/Tehran'],
  });

export const JsonValueSchema = z.json().meta({
  description: 'An I-JSON-compatible value; exact domain decimals use strings.',
});

export type CanonicalId = z.infer<typeof CanonicalIdSchema>;
export type CanonicalDecimal = z.infer<typeof CanonicalDecimalSchema>;
export type CanonicalFraction = z.infer<typeof CanonicalFractionSchema>;
export type JsonValue = z.infer<typeof JsonValueSchema>;
