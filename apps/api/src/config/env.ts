import 'dotenv/config';

function str(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}
function num(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}
function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  port: num('PORT', 3000),
  apiBasePath: str('API_BASE_PATH', '/api/v1'),
  mongoUri: str('MONGO_URI', 'mongodb://127.0.0.1:27017/dealflow360?replicaSet=rs0&directConnection=true'),
  dbName: str('MONGO_DB_NAME', 'dealflow360'),
  jwtSecret: str('JWT_SECRET', 'dealflow360-dev-secret-change-me'),
  jwtExpiresIn: str('JWT_EXPIRES_IN', '12h'),
  portalTokenTtlDays: num('PORTAL_TOKEN_TTL_DAYS', 3650),
  webOrigin: str('WEB_ORIGIN', 'http://localhost:4200'),
  webBaseUrl: str('WEB_BASE_URL', 'http://localhost:4200'),
  showDemoLogins: bool('SHOW_DEMO_LOGINS', true),
  /** Blank => "now" at seed time. Set to freeze the seed for reproducible screenshots. */
  seedNow: str('SEED_NOW', ''),
  demoPassword: str('DEMO_PASSWORD', 'Demo@123'),
  /** Deliberately low: hashing 7 demo users must not blow the 30s reset budget. */
  bcryptRounds: num('BCRYPT_ROUNDS', 8),
  isProd: str('NODE_ENV', 'development') === 'production',
} as const;

/** A URI is "safe to wipe" only if it clearly points at a local/dev database. */
export function isLocalMongoUri(uri: string): boolean {
  const host = uri.replace(/^mongodb(\+srv)?:\/\//, '').split('/')[0].toLowerCase();
  const localHost = /(^|[@,])(127\.0\.0\.1|localhost|0\.0\.0\.0|host\.docker\.internal|mongo)(:\d+)?($|,)/.test(host);
  const devName = /(dealflow360|_dev|_test|localdev)/i.test(uri);
  return localHost && devName;
}
