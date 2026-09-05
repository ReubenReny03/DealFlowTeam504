import mongoose from 'mongoose';
import { env } from '../config/env.js';

mongoose.set('strictQuery', true);

export async function connectMongo(uri: string = env.mongoUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  await mongoose.connect(uri, { dbName: env.dbName, serverSelectionTimeoutMS: 5000 });
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** Retry loop used by the reset script and by `npm run dev:api` on a cold Docker. */
export async function waitForMongo(uri: string = env.mongoUri, attempts = 20, delayMs = 1000): Promise<void> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      await mongoose.connect(uri, { dbName: env.dbName, serverSelectionTimeoutMS: 2000 });
      await mongoose.connection.db?.admin().command({ ping: 1 });
      return;
    } catch (err) {
      lastError = err;
      await mongoose.disconnect().catch(() => undefined);
      if (i < attempts) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

/**
 * Run `fn` inside a transaction when the deployment supports them (replica set),
 * otherwise run it directly. Keeps the code identical on a standalone mongo —
 * see docs/DECISIONS.md D-003.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession | undefined) => Promise<T>): Promise<T> {
  let session: mongoose.ClientSession | undefined;
  try {
    session = await mongoose.startSession();
  } catch {
    return fn(undefined);
  }
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (err) {
    const msg = String((err as Error)?.message ?? '');
    if (/Transaction numbers are only allowed|replica set|not supported/i.test(msg)) {
      // Standalone mongo: fall back to non-transactional writes.
      return fn(undefined);
    }
    throw err;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
