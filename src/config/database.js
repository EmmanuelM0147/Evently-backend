import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Supabase configuration
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please connect to Supabase first.');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Test database connection
export const connectDB = async () => {
  try {
    // Test connection with a simple query
    const { data, error } = await supabase
      .from('events')
      .select('count')
      .limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is ok for now
      throw error;
    }

    console.log('📊 Connected to Supabase database');
    console.log('🕒 Connection successful');
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    throw error;
  }
};

// Export the client for use in other modules
export { supabase as pool }; // Keep the same export name for compatibility

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Closing database connections...');
  await supabase.removeAllSubscriptions();
  console.log('✅ Database connections closed');
  process.exit(0);
});