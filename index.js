// Import the necessary modules using ES module syntax
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import bodyParser from 'body-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the public directory
app.use(express.static(join(__dirname, 'public')));

// Initialize Supabase client with error handling
const supabaseUrl = process.env.supabaseUrl || 'https://fbpcfpplfetfcjzvgxnc.supabase.co';
const supabaseKey = process.env.supabaseKey;

if (!supabaseKey) {
    console.error('Error: supabaseKey is not set in environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test Supabase connection
supabase.from('users').select('count').single()
    .then(() => console.log('Supabase connection successful'))
    .catch(error => {
        console.error('Supabase connection error:', error);
        process.exit(1);
    });

// Input validation middleware
const validateRegistration = (req, res, next) => {
    const { email, password, role } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
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
        console.log('Registration attempt:', { email: req.body.email, role: req.body.role });
        
        const { email, password, role = "client" } = req.body;

        // First check if user already exists in the users table
        const { data: existingUsers, error: checkError } = await supabase
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

        // Proceed with auth signup using service client
        const { data, error } = await serviceClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email to simplify registration
            user_metadata: {
                role: role
            }
        });

        if (error) {
            console.error('Supabase auth error:', error);
            return res.status(400).json({ 
                error: "Registration failed", 
                details: error.message 
            });
        }

        if (!data.user) {
            console.error('No user data returned from signup');
            return res.status(500).json({ 
                error: "Registration failed", 
                details: "No user data returned" 
            });
        }

        console.log('Auth user created successfully:', data.user.id);

        // First, check if the users table exists and has the correct structure
        const { data: tableInfo, error: tableError } = await serviceClient
            .from('users')
            .select('*')
            .limit(1);

        if (tableError) {
            console.error('Error checking users table:', tableError);
            return res.status(500).json({
                error: "Database configuration error",
                details: "Users table may not be properly configured"
            });
        }

        // Insert user into users table with minimal required fields
        const userData = {
            id: data.user.id,
            email: email,
            role: role
        };

        console.log('Attempting to insert user with data:', userData);

        const { error: insertError } = await serviceClient
            .from("users")
            .insert(userData);

        if (insertError) {
            console.error('Error inserting user:', insertError);
            console.error('Error details:', {
                code: insertError.code,
                message: insertError.message,
                details: insertError.details,
                hint: insertError.hint
            });
            
            // Try to clean up the auth user if we can't insert into the users table
            try {
                await serviceClient.auth.admin.deleteUser(data.user.id);
                console.log('Cleaned up auth user after failed profile creation');
            } catch (cleanupError) {
                console.error('Error cleaning up auth user:', cleanupError);
            }

            return res.status(500).json({ 
                error: "Failed to create user profile", 
                details: insertError.message,
                hint: insertError.hint || 'Please try again or contact support'
            });
        }

        console.log('User registration completed successfully');
        res.status(200).json({ 
            message: "Registration successful! You can now login.", 
            user: { 
                id: data.user.id,
                email: data.user.email,
                role: role
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
        res.redirect(`${process.env.FRONTEND_URL || 'https://waste-management-backend-d3uu.vercel.app'}/login?message=Email confirmed successfully! You can now login.`);
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

        await checkUserRole(data.user, res);
    } catch (error) {
        next(error);
    }
});

// Check User Role
async function checkUserRole(user, res) {
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
                message: "Welcome to Admin Dashboard"
            });
        } else if (role === "client") {
            res.status(200).json({ 
                role: "client", 
                message: "Welcome to Client Dashboard" 
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
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'https://waste-management-backend-d3uu.vercel.app'}/reset-password`
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

// Catch-all route for SPA - must be after all other routes
app.get('*', (req, res) => {
    try {
        res.sendFile(join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Error loading page');
    }
});

// Apply error handling middleware
app.use(errorHandler);

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});


