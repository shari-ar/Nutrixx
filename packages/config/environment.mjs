import { z } from 'zod';

const nodeEnvironmentSchema = z
  .enum(['development', 'test', 'production'])
  .default('development');

export const apiEnvironmentSchema = z.object({
  API_HOST: z.string().trim().min(1).default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  NODE_ENV: nodeEnvironmentSchema,
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
});

export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001/api/v1'),
  NODE_ENV: nodeEnvironmentSchema,
});

export function parseApiEnvironment(environment) {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWebEnvironment(environment) {
  return webEnvironmentSchema.parse(environment);
}
