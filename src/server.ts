import { app } from './app';
import { env } from './config/env';
import { translate } from './common/i18n/i18n';
import { connectDatabase, disconnectDatabase } from './database/prisma';

async function bootstrap() {
  await connectDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(translate('en', 'logs.serverStarted', { port: env.PORT, prefix: env.API_PREFIX }));
  });

  async function shutdown(signal: string) {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
