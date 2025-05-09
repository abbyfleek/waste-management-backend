import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase clients
const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true
    }
});

const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Function to test connection
async function testConnection() {
    try {
        const { data, error } = await supabase.from('users').select('count').single();
        if (error) throw error;
        console.log('Supabase connection successful');
        return true;
    } catch (error) {
        console.error('Supabase connection test failed:', error);
        return false;
    }
}

export { supabase, serviceClient, testConnection };