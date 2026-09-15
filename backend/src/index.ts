import { getEnv } from './configuration_container';
import { createApp } from './app';

const env = getEnv();

async function start() {
  const app = await createApp(env);

  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT
    });

    app.log.info(`Backend listening on http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start();
