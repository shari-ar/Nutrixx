import type { ZodType } from 'zod';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface ApiEnvironment {
  API_HOST: string;
  API_PORT: number;
  NODE_ENV: NodeEnvironment;
  WEB_ORIGIN: string;
}

export interface WebEnvironment {
  NEXT_PUBLIC_API_URL: string;
  NODE_ENV: NodeEnvironment;
}

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export const apiEnvironmentSchema: ZodType<ApiEnvironment>;
export const webEnvironmentSchema: ZodType<WebEnvironment>;

export function parseApiEnvironment(
  environment: EnvironmentInput,
): ApiEnvironment;

export function parseWebEnvironment(
  environment: EnvironmentInput,
): WebEnvironment;
