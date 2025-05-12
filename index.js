// Import the necessary modules using ES module syntax
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';
import { supabase, serviceClient, testConnection } from './supabase.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'https://waste-management-backend-akyqu20eu-abbyfleeks-projects.vercel.app'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials: true
}));
app.use(bodyParser.json());

// Set FRONTEND_URL environment variable
process.env.FRONTEND_URL = 'https://waste-management-backend-akyqu20eu-abbyfleeks-projects.vercel.app';

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            console.log('No authorization header');
            return res.status(401).json({ error: 'No authorization header' });
        }

        const token = authHeader.split(' ')[1];
        if (!token) {
            console.log('No token provided');
            return res.status(401).json({ error: 'No token provided' });
        }

        console.log('Verifying token...');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        
        if (authError) {
            console.error('Auth error:', authError);
            return res.status(401).json({ error: 'Invalid token' });
        }

        if (!user) {
            console.log('No user found');
            return res.status(401).json({ error: 'User not found' });
        }

        console.log('Getting user role...');
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (userError) {
            console.error('User data error:', userError);
            return res.status(401).json({ error: 'Error fetching user data' });
        }

        if (!userData) {
            console.log('No user data found');
            return res.status(401).json({ error: 'User data not found' });
        }

        req.user = {
            id: user.id,
            role: userData.role
        };

        console.log('Authentication successful');
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ error: 'Authentication failed', details: error.message });
    }
};

// Serve static files from the public directory
app.use(express.static(join(__dirname, 'public')));

// Test Supabase connection
async function testSupabaseConnection() {
    try {
        await supabase.from('users').select('count').single();
        console.log('Supabase connection successful');
    } catch (error) {
        console.error('Supabase connection error:', error);
    }
}

// Input validation middleware
const validateRegistration = (req, res, next) => {
    const { email, password, role } = req.body;
    console.log('Validating registration:', { email, role });

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ error: "Invalid email format" });
    }
    if (role && !['admin', 'client'].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be either 'admin' or 'client'" });
    }
    next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        error: "Something went wrong!", 
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};

// Root route handler
app.get('/', (req, res) => {
    try {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Error loading page');
    }
});

// Client Dashboard Route Handler
app.get('/client-dashboard/:binId', (req, res) => {
    try {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Error serving client dashboard:', error);
        res.status(500).send('Error loading page');
    }
});

// Generate QR Code Route Handler
app.get('/generate-qr', (req, res) => {
    try {
        res.sendFile(join(__dirname, 'public', 'generate-qr.html'));
    } catch (error) {
        console.error('Error serving QR generator:', error);
        res.status(500).send('Error loading QR generator');
    }
});

// User Signup & Role Assignment
app.post('/api/register', validateRegistration, async (req, res) => {
    try {
        console.log('Registration request received:', {
            body: req.body,
            headers: req.headers,
            origin: req.headers.origin
        });
        
        const { email, password, role = "client", name } = req.body;

        if (!name) {
            console.log('Name validation failed');
            return res.status(400).json({ error: "Name is required" });
        }

        // First check if user already exists in the users table
        console.log('Checking for existing user...');
        const { data: existingUsers, error: checkError } = await serviceClient
            .from("users")
            .select("id")
            .eq("email", email);

        if (checkError) {
            console.error('Error checking existing user:', checkError);
            return res.status(500).json({ 
                error: "Database error", 
                details: checkError.message 
            });
        }

        if (existingUsers && existingUsers.length > 0) {
            console.log('User already exists:', email);
            return res.status(400).json({ error: "Email already registered. Please login or use a different email." });
        }

        console.log('Creating user in Supabase Auth...');
        // Create user in Supabase Auth using service client
        const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                role: role,
                name: name
            }
        });

        if (authError) {
            console.error('Supabase auth error:', authError);
            return res.status(400).json({ 
                error: "Registration failed", 
                details: authError.message 
            });
        }

        if (!authData.user) {
            console.error('No user data returned from signup');
            return res.status(500).json({ 
                error: "Registration failed", 
                details: "No user data returned" 
            });
        }

        console.log('Auth user created successfully:', authData.user.id);

        // Insert user into users table using service client
        console.log('Inserting user into users table...');
        const { error: insertError } = await serviceClient
            .from("users")
            .insert({
                id: authData.user.id,
                email: email,
                role: role,
                name: name,
                email_confirmed: true,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Error inserting user:', insertError);
            // Try to clean up the auth user if we can't insert into the users table
            await serviceClient.auth.admin.deleteUser(authData.user.id);
            return res.status(500).json({ 
                error: "Failed to create user profile", 
                details: insertError.message 
            });
        }

        console.log('User registration completed successfully');
        res.status(201).json({ 
            message: "Registration successful",
            user: {
                id: authData.user.id,
                email: email,
                role: role,
                name: name
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            error: "Registration failed", 
            details: error.message 
        });
    }
});

// Add new endpoint to handle email confirmation
app.get('/api/confirm-email', async (req, res) => {
    try {
        const { token_hash, type, email } = req.query;

        if (!token_hash || !type || !email) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Create service client with admin privileges
        const serviceClient = createClient(
            supabaseUrl,
            process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Verify the email confirmation
        const { data, error } = await serviceClient.auth.verifyOtp({
            token_hash,
            type,
            email
        });

        if (error) {
            console.error('Email confirmation error:', error);
            return res.status(400).json({ error: error.message });
        }

        // Update user's email_confirmed status in the users table
        const { error: updateError } = await serviceClient
            .from('users')
            .update({ email_confirmed: true })
            .eq('email', email);

        if (updateError) {
            console.error('Error updating email confirmation status:', updateError);
            return res.status(500).json({ error: 'Failed to update email confirmation status' });
        }

        // Redirect to login page with success message
        res.redirect(`${process.env.FRONTEND_URL || 'https://waste-management-backend-akyqu20eu-abbyfleeks-projects.vercel.app'}/login?message=Email confirmed successfully! You can now login.`);
    } catch (error) {
        console.error('Email confirmation error:', error);
        res.status(500).json({ error: 'Failed to confirm email' });
    }
});

// User Login
app.post('/api/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        // Pass the session (which contains access_token) to checkUserRole
        await checkUserRole(data.user, res, data.session);
    } catch (error) {
        next(error);
    }
});

// Check User Role
async function checkUserRole(user, res, session) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (error) {
            throw error;
        }

        const role = data.role;

        if (role === "admin") {
            const { data: bins, error: binsError } = await supabase
                .from("bins")
                .select("bin_id, location, waste_level, last_pickup");

            if (binsError) {
                throw binsError;
            }

            res.status(200).json({ 
                role: "admin", 
                bins,
                message: "Welcome to Admin Dashboard",
                access_token: session?.access_token
            });
        } else if (role === "client") {
            res.status(200).json({ 
                role: "client", 
                message: "Welcome to Client Dashboard",
                access_token: session?.access_token
            });
        } else {
            throw new Error("Invalid user role");
        }
    } catch (error) {
        res.status(400).json({ error: 'Error fetching user role: ' + error.message });
    }
}

// Fetch Bin Information
app.get('/api/bins/:binId', async (req, res, next) => {
    try {
        const { binId } = req.params;
        
        // Input validation
        if (!binId || typeof binId !== 'string' || binId.trim().length === 0) {
            return res.status(400).json({ 
                error: "Invalid bin ID",
                message: "Please provide a valid bin ID"
            });
        }

        console.log('Fetching bin info for ID:', binId);

        if (!supabaseKey) {
            console.error('Supabase key is not configured');
            return res.status(500).json({ 
                error: "Server configuration error",
                details: "Database connection not properly configured"
            });
        }

        const { data, error } = await supabase
            .from('bins')
            .select('bin_id, location, last_pickup, waste_level, qr_url')
            .eq('bin_id', binId.trim())
            .single();

        if (error) {
            console.error('Supabase query error:', error);
            if (error.code === 'PGRST116') {
                return res.status(404).json({ 
                    error: "Bin not found",
                    message: `No bin found with ID: ${binId}`
                });
            }
            return res.status(500).json({ 
                error: "Database error",
                details: error.message
            });
        }

        if (!data) {
            console.log('Bin not found:', binId);
            return res.status(404).json({ 
                error: "Bin not found",
                message: `No bin found with ID: ${binId}`
            });
        }

        console.log('Bin data retrieved:', data);
        res.status(200).json({ bin: data });
    } catch (error) {
        console.error('Unexpected error in bin endpoint:', error);
        next(error);
    }
});

// Update Waste Level
app.post('/api/update-waste-level', async (req, res, next) => {
    try {
        const { binId, level } = req.body;

        if (!binId || level === undefined) {
            return res.status(400).json({ error: "Bin ID and waste level are required" });
        }

        if (level < 0 || level > 100) {          return res.status(400).json({ error: "Waste level must be between 0 and 100" });
        }

        const { error } = await supabase
            .from("bins")
            .update({ 
                waste_level: level, 
                last_updated: new Date().toISOString() 
            })
            .eq("bin_id", binId);

        if (error) {
            throw error;
        }

        const { data: updatedBinData, error: fetchError } = await supabase
            .from("bins")
            .select("waste_level")
            .eq("bin_id", binId)
            .single();

        if (fetchError) {
            throw fetchError;
        }

        const currentLevel = updatedBinData.waste_level;
        console.log(`Bin Fill Level: ${currentLevel}%`);

        if (currentLevel > 80) {
            console.log("⚠️ Bin is over 80% full! Please schedule collection.");
        }

        res.status(200).json({ message: "Waste level updated", currentLevel });
    } catch (error) {
        next(error);
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const isConnected = await testConnection();
        if (!isConnected) {
            return res.status(500).json({ 
                status: 'error',
                message: 'Database connection failed'
            });
        }
        res.json({ 
            status: 'ok',
            message: 'Server is running',
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'Server health check failed'
        });
    }
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
    try {
        const { data, error } = await supabase.from('users').select('count').single();
        if (error) throw error;
        res.json({ status: 'ok', message: 'Database connection successful' });
    } catch (error) {
        console.error('Database connection test failed:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Database connection failed',
            error: error.message 
        });
    }
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'https://waste-management-backend-akyqu20eu-abbyfleeks-projects.vercel.app'}/reset-password`
        });
        
        if (error) {
            console.error('Password reset error:', error);
            return res.status(400).json({ error: error.message });
        }
        
        res.json({ message: 'Password reset email sent successfully' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to send password reset email' });
    }
});

// Add new endpoint to handle password reset
app.post('/api/update-password', async (req, res) => {
    try {
        const { password, access_token } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        // If access_token is provided, set it in the session
        if (access_token) {
            const { error: sessionError } = await supabase.auth.setSession({
                access_token,
                refresh_token: ''
            });

            if (sessionError) {
                console.error('Session error:', sessionError);
                return res.status(400).json({ error: 'Invalid or expired reset link' });
            }
        }

        const { data, error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            console.error('Password update error:', error);
            return res.status(400).json({ error: error.message });
        }

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('Password update error:', error);
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// Add this test endpoint before the catch-all route
app.get('/api/test-service-role', async (req, res) => {
    try {
        console.log('Testing service role permissions...');
        
        // Test 1: Try to create a test user
        const testEmail = `test_${Date.now()}@example.com`;
        const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
            email: testEmail,
            password: 'Test123!@#',
            email_confirm: true
        });

        if (userError) {
            console.error('Service role test failed - User creation:', userError);
            return res.status(500).json({
                error: 'Service role test failed',
                details: userError.message
            });
        }

        // Test 2: Try to insert into users table
        const { error: insertError } = await serviceClient
            .from('users')
            .insert({
                id: userData.user.id,
                email: testEmail,
                role: 'client',
                email_confirmed: true,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Service role test failed - Table insert:', insertError);
            // Clean up the test user
            await serviceClient.auth.admin.deleteUser(userData.user.id);
            return res.status(500).json({
                error: 'Service role test failed',
                details: insertError.message
            });
        }

        // Test 3: Try to read from users table
        const { data: readData, error: readError } = await serviceClient
            .from('users')
            .select('*')
            .eq('id', userData.user.id)
            .single();

        if (readError) {
            console.error('Service role test failed - Table read:', readError);
            return res.status(500).json({
                error: 'Service role test failed',
                details: readError.message
            });
        }

        // Clean up the test user
        await serviceClient.auth.admin.deleteUser(userData.user.id);
        await serviceClient
            .from('users')
            .delete()
            .eq('id', userData.user.id);

        console.log('Service role test passed successfully');
        res.status(200).json({
            message: 'Service role permissions verified successfully',
            tests: {
                userCreation: 'passed',
                tableInsert: 'passed',
                tableRead: 'passed',
                cleanup: 'passed'
            }
        });
    } catch (error) {
        console.error('Service role test failed:', error);
        res.status(500).json({
            error: 'Service role test failed',
            details: error.message
        });
    }
});

// Add this test endpoint before the catch-all route
app.get('/api/check-rls', async (req, res) => {
    try {
        console.log('Checking RLS status...');
        
        // Test 1: Check if we can read from the table
        const { data: readData, error: readError } = await serviceClient
            .from('users')
            .select('count')
            .single();

        if (readError) {
            console.error('RLS check failed - Read test:', readError);
            return res.status(500).json({
                error: 'RLS check failed',
                details: readError.message,
                hint: 'This might indicate RLS is blocking access or not properly configured'
            });
        }

        // Test 2: Try to insert a test record
        const testId = '00000000-0000-0000-0000-000000000000';
        const { error: insertError } = await serviceClient
            .from('users')
            .insert({
                id: testId,
                email: 'test@example.com',
                role: 'client',
                email_confirmed: false,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('RLS check failed - Insert test:', insertError);
            return res.status(500).json({
                error: 'RLS check failed',
                details: insertError.message,
                hint: 'This might indicate RLS is blocking inserts or not properly configured'
            });
        }

        // Clean up test record
        await serviceClient
            .from('users')
            .delete()
            .eq('id', testId);

        console.log('RLS check passed successfully');
        res.status(200).json({
            message: 'RLS is properly configured',
            tests: {
                readAccess: 'passed',
                insertAccess: 'passed',
                deleteAccess: 'passed'
            }
        });
    } catch (error) {
        console.error('RLS check failed:', error);
        res.status(500).json({
            error: 'RLS check failed',
            details: error.message
        });
    }
});

// Save QR Code Information
app.post('/api/save-qr', async (req, res) => {
    try {
        const { binId, location } = req.body;
        
        if (!binId || !location) {
            return res.status(400).json({ 
                error: "Missing required fields",
                message: "Bin ID and location are required"
            });
        }

        // Generate QR URL
        const baseUrl = process.env.FRONTEND_URL || 'https://waste-management-backend-akyqu20eu-abbyfleeks-projects.vercel.app';
        const qrUrl = `${baseUrl}/client-dashboard/${binId}`;

        // Save to database
        const { data, error } = await supabase
            .from('bins')
            .insert({
                bin_id: binId,
                location: location,
                qr_url: qrUrl,
                waste_level: 0,
                last_pickup: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving QR code:', error);
            return res.status(500).json({ 
                error: "Database error",
                details: error.message
            });
        }

        res.status(201).json({ 
            message: "QR code saved successfully",
            bin: data
        });
    } catch (error) {
        console.error('Error in save-qr endpoint:', error);
        res.status(500).json({ 
            error: "Server error",
            details: error.message
        });
    }
});

// Get assigned bins for the logged-in user
app.get('/api/assigned-bins', authenticateToken, async (req, res) => {
    try {
        const { data: bins, error } = await supabase
            .from('bins')
            .select('*')
            .eq('assigned_user_id', req.user.id);

        if (error) throw error;
        res.json(bins);
    } catch (error) {
        console.error('Error fetching assigned bins:', error);
        res.status(500).json({ error: 'Failed to fetch assigned bins' });
    }
});

// Assign bin to user (admin only)
app.post('/api/assign-bin', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can assign bins' });
        }

        const { binId, userId } = req.body;

        const { data, error } = await supabase
            .from('bins')
            .update({ assigned_user_id: userId })
            .eq('bin_id', binId);

        if (error) throw error;
        res.json({ message: 'Bin assigned successfully' });
    } catch (error) {
        console.error('Error assigning bin:', error);
        res.status(500).json({ error: 'Failed to assign bin' });
    }
});

// Get bin info with user check
app.get('/api/bin-info/:binId', authenticateToken, async (req, res) => {
    try {
        const { binId } = req.params;

        const { data: bin, error } = await supabase
            .from('bins')
            .select('*')
            .eq('bin_id', binId)
            .single();

        if (error) throw error;

        // Check if user has access to this bin
        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'You do not have access to this bin' });
        }

        res.json(bin);
    } catch (error) {
        console.error('Error fetching bin info:', error);
        res.status(500).json({ error: 'Failed to fetch bin information' });
    }
});

// Schedule pickup for a bin
app.post('/api/schedule-pickup', authenticateToken, async (req, res) => {
    try {
        const { binId, scheduledDate, scheduledTime, notes } = req.body;
        
        // Validate input
        if (!binId || !scheduledDate || !scheduledTime) {
            return res.status(400).json({ error: "Bin ID, date, and time are required" });
        }

        // Check if user has access to the bin
        const { data: bin, error: binError } = await supabase
            .from('bins')
            .select('assigned_user_id')
            .eq('bin_id', binId)
            .single();

        if (binError) throw binError;

        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You don't have permission to schedule pickups for this bin" });
        }

        // Create pickup schedule
        const { data, error } = await supabase
            .from('pickup_schedules')
            .insert({
                bin_id: binId,
                scheduled_date: scheduledDate,
                scheduled_time: scheduledTime,
                notes: notes || null
            })
            .select()
            .single();

        if (error) throw error;

        // Update bin's scheduled pickup
        await supabase
            .from('bins')
            .update({ scheduled_pickup: `${scheduledDate}T${scheduledTime}` })
            .eq('bin_id', binId);

        res.status(201).json({ 
            message: "Pickup scheduled successfully",
            schedule: data
        });
    } catch (error) {
        console.error('Error scheduling pickup:', error);
        res.status(500).json({ error: "Failed to schedule pickup" });
    }
});

// Get pickup schedules for a bin
app.get('/api/pickup-schedules/:binId', authenticateToken, async (req, res) => {
    try {
        const { binId } = req.params;

        // Check if user has access to the bin
        const { data: bin, error: binError } = await supabase
            .from('bins')
            .select('assigned_user_id')
            .eq('bin_id', binId)
            .single();

        if (binError) throw binError;

        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You don't have permission to view schedules for this bin" });
        }

        // Get schedules
        const { data, error } = await supabase
            .from('pickup_schedules')
            .select('*')
            .eq('bin_id', binId)
            .order('scheduled_date', { ascending: true });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching pickup schedules:', error);
        res.status(500).json({ error: "Failed to fetch pickup schedules" });
    }
});

// Update pickup schedule status
app.patch('/api/pickup-schedules/:scheduleId', authenticateToken, async (req, res) => {
    try {
        const { scheduleId } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        // Get the schedule to check permissions
        const { data: schedule, error: scheduleError } = await supabase
            .from('pickup_schedules')
            .select('bin_id')
            .eq('id', scheduleId)
            .single();

        if (scheduleError) throw scheduleError;

        // Check if user has access to the bin
        const { data: bin, error: binError } = await supabase
            .from('bins')
            .select('assigned_user_id')
            .eq('bin_id', schedule.bin_id)
            .single();

        if (binError) throw binError;

        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You don't have permission to update this schedule" });
        }

        // Update schedule
        const { data, error } = await supabase
            .from('pickup_schedules')
            .update({ status })
            .eq('id', scheduleId)
            .select()
            .single();

        if (error) throw error;

        // If completed, update bin's waste level and last pickup
        if (status === 'completed') {
            await supabase
                .from('bins')
                .update({ 
                    waste_level: 0,
                    last_pickup: new Date().toISOString()
                })
                .eq('bin_id', schedule.bin_id);
        }

        res.json({ 
            message: "Schedule updated successfully",
            schedule: data
        });
    } catch (error) {
        console.error('Error updating pickup schedule:', error);
        res.status(500).json({ error: "Failed to update pickup schedule" });
    }
});

// Create a new transaction
app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { binId, amount, paymentMethod, description } = req.body;

        if (!binId || !amount || amount <= 0) {
            return res.status(400).json({ error: "Bin ID and valid amount are required" });
        }

        // Check if user has access to the bin
        const { data: bin, error: binError } = await supabase
            .from('bins')
            .select('assigned_user_id')
            .eq('bin_id', binId)
            .single();

        if (binError) throw binError;

        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You don't have permission to create transactions for this bin" });
        }

        // Create transaction
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                bin_id: binId,
                user_id: req.user.id,
                amount,
                payment_method: paymentMethod || null,
                description: description || null
            })
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ 
            message: "Transaction created successfully",
            transaction: data
        });
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: "Failed to create transaction" });
    }
});

// Get transactions for a user
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                bins (
                    bin_id,
                    location
                )
            `)
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});

// Get transactions for a specific bin
app.get('/api/transactions/bin/:binId', authenticateToken, async (req, res) => {
    try {
        const { binId } = req.params;

        // Check if user has access to the bin
        const { data: bin, error: binError } = await supabase
            .from('bins')
            .select('assigned_user_id')
            .eq('bin_id', binId)
            .single();

        if (binError) throw binError;

        if (bin.assigned_user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: "You don't have permission to view transactions for this bin" });
        }

        const { data, error } = await supabase
            .from('transactions')
            .select(`
                *,
                users (
                    id,
                    name,
                    email
                )
            `)
            .eq('bin_id', binId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json(data);
    } catch (error) {
        console.error('Error fetching bin transactions:', error);
        res.status(500).json({ error: "Failed to fetch bin transactions" });
    }
});

// Update transaction status
app.patch('/api/transactions/:transactionId', authenticateToken, async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { status } = req.body;

        if (!status || !['pending', 'completed', 'failed'].includes(status)) {
            return res.status(400).json({ error: "Invalid status" });
        }

        // Only admin can update transaction status
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: "Only admins can update transaction status" });
        }

        const { data, error } = await supabase
            .from('transactions')
            .update({ status })
            .eq('id', transactionId)
            .select()
            .single();

        if (error) throw error;

        res.json({ 
            message: "Transaction status updated successfully",
            transaction: data
        });
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: "Failed to update transaction" });
    }
});

// Add this test endpoint before the catch-all route
app.get('/api/test-db-permissions', async (req, res) => {
    try {
        console.log('Testing database permissions...');
        
        // Test 1: Check if we can read from the users table
        const { data: readData, error: readError } = await supabase
            .from('users')
            .select('count')
            .single();

        if (readError) {
            console.error('Database permission test failed - Read test:', readError);
            return res.status(500).json({
                error: 'Database permission test failed',
                details: readError.message,
                hint: 'This might indicate RLS is blocking access or not properly configured'
            });
        }

        // Test 2: Try to insert a test record
        const testId = '00000000-0000-0000-0000-000000000000';
        const { error: insertError } = await supabase
            .from('users')
            .insert({
                id: testId,
                email: 'test@example.com',
                role: 'client',
                name: 'Test User',
                email_confirmed: false,
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Database permission test failed - Insert test:', insertError);
            return res.status(500).json({
                error: 'Database permission test failed',
                details: insertError.message,
                hint: 'This might indicate RLS is blocking inserts or not properly configured'
            });
        }

        // Clean up test record
        await supabase
            .from('users')
            .delete()
            .eq('id', testId);

        console.log('Database permission test passed successfully');
        res.status(200).json({
            message: 'Database permissions are properly configured',
            tests: {
                readAccess: 'passed',
                insertAccess: 'passed',
                deleteAccess: 'passed'
            }
        });
    } catch (error) {
        console.error('Database permission test failed:', error);
        res.status(500).json({
            error: 'Database permission test failed',
            details: error.message
        });
    }
});

// Delete user endpoint (admin only)
app.delete('/api/users/:userId', authenticateToken, async (req, res) => {
    try {
        // Check if the requesting user is an admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can delete users' });
        }

        const { userId } = req.params;

        // First delete from users table
        const { error: deleteError } = await serviceClient
            .from('users')
            .delete()
            .eq('id', userId);

        if (deleteError) {
            console.error('Error deleting user from users table:', deleteError);
            return res.status(500).json({ 
                error: 'Failed to delete user',
                details: deleteError.message 
            });
        }

        // Then delete from auth
        const { error: authError } = await serviceClient.auth.admin.deleteUser(userId);

        if (authError) {
            console.error('Error deleting user from auth:', authError);
            return res.status(500).json({ 
                error: 'Failed to delete user from auth',
                details: authError.message 
            });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ 
            error: 'Failed to delete user',
            details: error.message 
        });
    }
});

// Assign bin to user by email (admin only)
app.post('/api/assign-bin-by-email', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can assign bins' });
        }

        const { bin_id, email } = req.body;
        console.log('Assigning bin to email:', email); // Debug log

        // Find user by email (case-insensitive, trimmed)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .ilike('email', email.trim())
            .single();

        if (userError) {
            console.error('User lookup error:', userError); // Debug log
            return res.status(400).json({ error: 'User not found' });
        }

        // Assign bin to user
        const { error: assignError } = await supabase
            .from('bins')
            .update({ user_id: user.id })
            .eq('bin_id', bin_id);

        if (assignError) {
            console.error('Bin assignment error:', assignError); // Debug log
            return res.status(400).json({ error: 'Failed to assign bin' });
        }

        res.status(200).json({ message: 'Bin assigned successfully' });
    } catch (error) {
        console.error('Assign bin error:', error); // Debug log
        res.status(500).json({ error: error.message });
    }
});

// Catch-all route for SPA - must be after all other routes
app.get('*', (req, res) => {
    try {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Error loading page');
    }
});

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// Start server with error handling
const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    console.log('Environment:', process.env.NODE_ENV || 'development');
    testSupabaseConnection();
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});


