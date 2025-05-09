import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get environment variables with fallbacks
const supabaseUrl = process.env.SUPABASE_URL || 'https://fbpcfpplfetfcjzvgxnc.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate configuration
if (!supabaseKey) {
    console.error('Error: SUPABASE_ANON_KEY is not set in environment variables');
    process.exit(1);
}

if (!supabaseServiceKey) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not set in environment variables');
    process.exit(1);
}

// Create Supabase clients with error handling
let supabase;
let serviceClient;

try {
    // Regular client for normal operations
    supabase = createClient(supabaseUrl, supabaseKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true
        }
    });

    // Service role client for admin operations
    serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    console.log('Supabase clients initialized successfully');
} catch (error) {
    console.error('Error initializing Supabase clients:', error);
    process.exit(1);
}

export { supabase, serviceClient };