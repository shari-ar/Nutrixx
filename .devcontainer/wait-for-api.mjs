const healthUrl = `http://127.0.0.1:${process.env.API_PORT ?? '3001'}/api/v1/health`;
const deadline = Date.now() + 60_000;
let lastError;

while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(2_000),
    });

    if (response.ok) {
      console.info(`API is healthy: ${healthUrl}`);
      process.exit(0);
    }

    lastError = new Error(`Health check returned HTTP ${response.status}.`);
  } catch (error) {
    lastError = error;
  }

  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

throw new Error(`API did not become healthy within 60 seconds: ${healthUrl}`, {
  cause: lastError,
});
