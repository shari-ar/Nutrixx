export const PRODUCT_NAME = 'Nutrixx';
export const PRODUCT_DESCRIPTION =
  'Personalized nutrition guidance built from food, activity, and optional health data.';

export const API_SERVICE_NAME = `${PRODUCT_NAME} API`;
export const API_CONTRACT_VERSION = '0.1.0';
export const API_PREFIX = 'api/v1';
export const API_BASE_PATH = `/${API_PREFIX}`;
export const API_HEALTH_PATH = `${API_BASE_PATH}/health`;
export const AGENT_CURATION_RUNS_ROUTE = 'internal/curation/runs';
export const AGENT_CURATION_RUNS_PATH = `${API_BASE_PATH}/${AGENT_CURATION_RUNS_ROUTE}`;

export const DEFAULT_API_HOST = '0.0.0.0';
export const DEFAULT_API_PORT = 3001;
export const DEFAULT_WEB_PORT = 3000;
export const DEFAULT_RADAR_PORT = 3002;
export const DEFAULT_WEB_ORIGIN = `http://localhost:${String(DEFAULT_WEB_PORT)}`;
export const DEFAULT_PUBLIC_API_URL = `http://localhost:${String(DEFAULT_API_PORT)}${API_BASE_PATH}`;
export const DEFAULT_GITHUB_REPOSITORY = 'shari-ar/Nutrixx';
export const DEFAULT_GITHUB_REPOSITORY_URL = `https://github.com/${DEFAULT_GITHUB_REPOSITORY}`;
export const DEFAULT_CATALOG_DELIVERY_URL =
  'https://shari-ar.github.io/Nutrixx/catalog';

export function agentCurationRunPath(runId) {
  return `${AGENT_CURATION_RUNS_PATH}/${runId}`;
}
