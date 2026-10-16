import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

// Keep DATE columns (e.g. weddings.wedding_date) as 'YYYY-MM-DD' instead of timezone-shifted Date objects
types.setTypeParser(types.builtins.DATE, (value) => value);

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

// Supabase / Vercel inject self-signed chain through the pooler; disable verification for hosted PG.
const hostedSsl = connectionString
  ? { rejectUnauthorized: false }
  : undefined;

export const pool = connectionString
  ? new Pool({
      connectionString,
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
