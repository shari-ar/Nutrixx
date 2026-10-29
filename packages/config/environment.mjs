import { z } from 'zod';

import {
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  DEFAULT_PUBLIC_API_URL,
  DEFAULT_WEB_ORIGIN,
} from './application.mjs';

const nodeEnvironmentSchema = z
  .enum(['development', 'test', 'production'])
  .default('development');

export const apiEnvironmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default(DEFAULT_API_HOST),
  API_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(DEFAULT_API_PORT),
  NODE_ENV: nodeEnvironmentSchema,
  WEB_ORIGIN: z.url().default(DEFAULT_WEB_ORIGIN),
});

export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default(DEFAULT_PUBLIC_API_URL),
  NODE_ENV: nodeEnvironmentSchema,
});

export function parseApiEnvironment(environment) {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWebEnvironment(environment) {
  return webEnvironmentSchema.parse(environment);
}
