import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config(); // Ensure dotenv is loaded for environment variables

const supabase = createClient(process.env.supabaseUrl, process.env.supabaseKey);

export default supabase;