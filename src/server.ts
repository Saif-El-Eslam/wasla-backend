import { app } from './app';
import { env } from './config/env';
import { translate } from './common/i18n/i18n';
import { connectDatabase, disconnectDatabase } from './database/prisma';
import { startExtractionJobMaintenance } from './modules/extraction/extraction.service';

async function bootstrap() {
  await connectDatabase();
  const stopExtractionJobMaintenance = startExtractionJobMaintenance();

  const server = app.listen(env.PORT, () => {
    console.log(translate('en', 'logs.serverStarted', { port: env.PORT, prefix: env.API_PREFIX }));
  });

  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`${signal} received, shutting down`);
    stopExtractionJobMaintenance();
    const forcedShutdown = setTimeout(() => {
      console.error('Graceful shutdown timed out');
      process.exit(1);
    }, 10_000);
    forcedShutdown.unref();

    server.close(async (error) => {
      clearTimeout(forcedShutdown);
      await disconnectDatabase();
      process.exit(error ? 1 : 0);
    });
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
