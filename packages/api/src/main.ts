/**
 * Server bootstrap: read configuration, build the app, start listening,
 * and shut down cleanly on SIGINT/SIGTERM.
 */

import { buildServer } from './server';

export async function start(): Promise<void> {
  const host = process.env.API_HOST ?? '0.0.0.0';
  const port = Number(process.env.API_PORT ?? 4000);

  const app = await buildServer({
    logger: process.env.NODE_ENV !== 'test',
    corsOrigin: process.env.API_CORS_ORIGIN?.split(','),
  });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host, port });
  app.log.info(`CompliSME API listening on http://${host}:${port}`);
}

if (require.main === module) {
  start().catch((error) => {
    console.error(`failed to start: ${error.message}`);
    process.exit(1);
  });
}