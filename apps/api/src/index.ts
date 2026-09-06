import { createServer } from 'node:http';
import { SOCKET_PATH } from '@dealflow/shared';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectMongo } from './db/connection.js';
import { syncAllIndexes } from './db/models.js';
import { initRealtime } from './realtime/server.js';
import { log } from './utils/logger.js';
import { waitForMongo } from '../../../scripts/wait-for-mongo.js';

async function bootstrap(): Promise<void> {
  log.banner(`DealFlow360 API — ${env.nodeEnv}`);
  try {
    // In development this falls back to an ephemeral in-memory replica set when
    // Docker is not running, so nobody is blocked on infrastructure. In
    // production the fallback is off and an unreachable Mongo is fatal.
    const mongo = await waitForMongo(env.mongoUri, 5, 1000, !env.isProd);
    await connectMongo(mongo.uri);
    log.ok(`MongoDB connected${mongo.source === 'memory' ? ' (EPHEMERAL in-memory — data will not persist)' : ''}`);
    await syncAllIndexes();
    log.ok('indexes in sync');
    if (mongo.source === 'memory') {
      log.warn('Run `docker compose up -d mongo && npm run reset` for a persistent demo environment.');
      log.warn('This process holds the only copy of the data; stopping it discards everything.');
      // An in-memory database starts empty, so seed it or every screen is blank.
      const { runSeed } = await import('./seed/seed.js');
      await runSeed({ quiet: true });
      log.ok('in-memory database seeded');
    }
  } catch (err) {
    log.error('Could not reach MongoDB at', env.mongoUri);
    log.error('Start it with:  docker compose up -d mongo');
    log.error('Then rebuild the demo data with:  npm run reset');
    log.error(String((err as Error).message));
    process.exit(1);
  }

  // The Express app stays frozen; realtime rides on the same HTTP server rather
  // than opening a second port, so one origin and one CORS rule cover both.
  const server = createServer(createApp());
  initRealtime(server);

  server.listen(env.port, () => {
    log.ok(`API listening on http://localhost:${env.port}${env.apiBasePath}`);
    log.ok(`Health:  http://localhost:${env.port}${env.apiBasePath}/health`);
    log.ok(`Routes:  http://localhost:${env.port}${env.apiBasePath}/_routes`);
    log.ok(`Realtime: ws://localhost:${env.port}${SOCKET_PATH}`);
  });
}

bootstrap();
