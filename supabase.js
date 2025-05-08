import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config(); // Ensure dotenv is loaded for environment variables

const supabaseUrl = process.env.supabaseUrl;
const supabaseKey = process.env.supabaseKey;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
}

// Regular client for normal operations
const supabase = createClient(supabaseUrl, supabaseKey);

// Service role client for admin operations
const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export { supabase, serviceClient };