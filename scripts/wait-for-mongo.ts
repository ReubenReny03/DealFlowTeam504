/**
 * Resolve a usable MongoDB for this machine.
 *
 * 1. If MONGO_URI is reachable (docker compose, or a local mongod), use it.
 * 2. Otherwise fall back to an ephemeral in-memory single-node replica set, so
 *    `npm run reset` and `npm run verify` still work on a machine with no Docker.
 *    The fallback is dev-only and is announced loudly.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { env } from '../apps/api/src/config/env.js';
import { log } from '../apps/api/src/utils/logger.js';

export interface ResolvedMongo {
  uri: string;
  source: 'configured' | 'memory';
  stop: () => Promise<unknown>;
}

async function reachable(uri: string, timeoutMs = 2500): Promise<boolean> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: timeoutMs });
  try {
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await client.close().catch(() => undefined);
  }
}

export async function waitForMongo(
  uri: string = env.mongoUri,
  attempts = 5,
  delayMs = 1000,
  allowMemoryFallback = true,
): Promise<ResolvedMongo> {
  for (let i = 1; i <= attempts; i++) {
    if (await reachable(uri)) {
      return { uri, source: 'configured', stop: async () => undefined };
    }
    if (i < attempts) {
      log.warn(`MongoDB not reachable yet (attempt ${i}/${attempts})…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (!allowMemoryFallback) {
    log.error('Could not reach MongoDB at', uri);
    log.error('Start it with:  docker compose up -d mongo');
    log.error('If Docker needs setup:  sudo systemctl start docker && sudo usermod -aG docker "$USER"  (then log out and back in)');
    throw new Error('MONGO_UNREACHABLE');
  }

  log.warn('MongoDB at the configured URI is unreachable.');
  log.warn('Falling back to an EPHEMERAL in-memory replica set for this run.');
  log.warn('Data will NOT persist. For the real demo run: docker compose up -d mongo');

  // Pin the binary cache to the repo so the fallback works offline once the
  // binary has been fetched even once, whatever the current working directory.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  process.env.MONGOMS_DOWNLOAD_DIR ??= resolve(repoRoot, 'node_modules/.cache/mongodb-memory-server');
  process.env.MONGOMS_VERSION ??= '7.0.24';

  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const memUri = replSet.getUri(env.dbName);
  return { uri: memUri, source: 'memory', stop: () => replSet.stop() };
}
