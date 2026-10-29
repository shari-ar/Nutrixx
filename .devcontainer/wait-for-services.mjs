import {
  API_HEALTH_PATH,
  DEFAULT_API_PORT,
  DEFAULT_RADAR_PORT,
  DEFAULT_WEB_PORT,
} from '@nutrixx/config/application';

const services = [
  {
    name: 'API',
    url: `http://127.0.0.1:${process.env.API_PORT ?? String(DEFAULT_API_PORT)}${API_HEALTH_PATH}`,
  },
  { name: 'Web', url: `http://web:${String(DEFAULT_WEB_PORT)}` },
  {
    name: 'Data Quality Radar',
    url: `http://radar:${String(DEFAULT_RADAR_PORT)}/_health`,
  },
];

const deadline = Date.now() + 10 * 60_000;
const pending = new Map(services.map((service) => [service.name, service]));
const lastErrors = new Map();

while (pending.size > 0 && Date.now() < deadline) {
  await Promise.all(
    [...pending.values()].map(async (service) => {
      try {
        const response = await fetch(service.url, {
          signal: AbortSignal.timeout(2_000),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        pending.delete(service.name);
        lastErrors.delete(service.name);
        console.info(`${service.name} is ready: ${service.url}`);
      } catch (error) {
        lastErrors.set(service.name, error);
      }
    }),
  );

  if (pending.size > 0) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

if (pending.size > 0) {
  const details = [...pending.values()]
    .map((service) => {
      const error = lastErrors.get(service.name);
      return `${service.name} (${service.url}): ${error instanceof Error ? error.message : 'not ready'}`;
    })
    .join('; ');

  throw new Error(
    `Development services did not become ready within 10 minutes: ${details}`,
  );
}
