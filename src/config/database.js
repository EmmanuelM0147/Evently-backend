import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

// Keep DATE columns (e.g. weddings.wedding_date) as 'YYYY-MM-DD' instead of timezone-shifted Date objects
types.setTypeParser(types.builtins.DATE, (value) => value);

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'evently_db',
  user: process.env.PGUSER || 'evently_user',
  password: process.env.PGPASSWORD || 'evently_password',
  max: Number(process.env.PGPOOL_MAX || 10)
});

// Test database connection
export const connectDB = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('📊 Connected to PostgreSQL database');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
};

// Graceful shutdown
const closeDatabase = async () => {
  console.log('\n🔄 Closing database connections...');
  await pool.end();
  console.log('✅ Database connections closed');
};

process.once('SIGINT', closeDatabase);
process.once('SIGTERM', closeDatabase);