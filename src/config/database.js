import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

// Keep DATE columns (e.g. weddings.wedding_date) as 'YYYY-MM-DD' instead of timezone-shifted Date objects
types.setTypeParser(types.builtins.DATE, (value) => value);

const rawConnectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

// Prefer discrete PG* vars from the Vercel Supabase integration when present
const hasDiscrete = process.env.POSTGRES_HOST && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD;

const sanitizeConnectionString = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('sslrootcert');
    url.searchParams.set('sslmode', 'require');
    return url.toString();
  } catch {
    return value;
  }
};

if (process.env.NODE_ENV === 'production' || process.env.PGSSL === 'true') {
  // Vercel ↔ Supabase pooler presents an intermediate cert Node rejects by default
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const hostedSsl = { rejectUnauthorized: false };

export const pool = hasDiscrete
  ? new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DATABASE || 'postgres',
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      ssl: hostedSsl,
      max: Number(process.env.PGPOOL_MAX || 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000
    })
  : rawConnectionString
    ? new Pool({
        connectionString: sanitizeConnectionString(rawConnectionString),
        ssl: hostedSsl,
        max: Number(process.env.PGPOOL_MAX || 5),
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 10_000
      })
    : new Pool({
        host: process.env.PGHOST || 'postgres',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'evently_db',
        user: process.env.PGUSER || 'evently_user',
        password: process.env.PGPASSWORD || 'evently_password',
        max: Number(process.env.PGPOOL_MAX || 10)
      });

export const connectDB = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('📊 Connected to PostgreSQL database');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
};

const closeDatabase = async () => {
  console.log('\n🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
};

process.once('SIGINT', closeDatabase);
process.once('SIGTERM', closeDatabase);
