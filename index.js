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
        details: process.env.NODE_ENV === 'development' ? err.message : undefined 
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
            throw checkError;
        }

        if (existingUsers && existingUsers.length > 0) {
            console.log('User already exists:', email);
            return res.status(400).json({ error: "User already exists." });
        }

        // Proceed with auth signup
        const { data, error } = await supabase.auth.signUp({ 
            email, 
            password,
            options: {
                data: {
                    role: role
                },
                emailRedirectTo: 'https://waste-management-backend-d3uu.vercel.app/login'
            }
        });

        if (error) {
            console.error('Supabase auth error:', error);
            return res.status(400).json({ 
                error: "Signup error", 
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

        // Insert user into users table
        const { error: insertError } = await supabase
            .from("users")
            .insert([{ 
                id: data.user.id, 
                email: email, 
                role: role 
            }]);

        if (insertError) {
            console.error('Error inserting user:', insertError);
            // Try to clean up the auth user if we can't insert into the users table
            await supabase.auth.admin.deleteUser(data.user.id);
            throw insertError;
        }

        console.log('User registration completed successfully');
        res.status(200).json({ 
            message: "Registration successful! Please check your email for verification.", 
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

        const { data, error } = await supabase
            .from('bins')
            .select('bin_id, location, last_pickup, qr_url')
            .eq('bin_id', binId)
            .single();

        if (error) {
            throw error;
        }

        if (!data) {
            return res.status(404).json({ message: 'Bin not found' });
        }

        res.status(200).json({ bin: data });
    } catch (error) {
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

        if (level < 0 || level > 100) {
            return res.status(400).json({ error: "Waste level must be between 0 and 100" });
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
        const { data, error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        res.status(400).json({ error: error.message });
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

// Export for Vercel
export default app;
