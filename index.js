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

// Initialize Supabase client
const supabaseUrl = process.env.supabaseUrl;
const supabaseKey = process.env.supabaseKey;
const supabase = createClient(supabaseUrl, supabaseKey);

// Input validation middleware
const validateRegistration = (req, res, next) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    next();
};

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Something went wrong!" });
};

// Root route handler - must be before other routes
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
        const { email, password, role = "user" } = req.body;

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
            return res.status(400).json({ error: "Signup error: " + error.message });
        }

        const userId = data.user?.id || data.session?.user.id;

        // Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

        if (checkError && checkError.code !== "PGRST100") {
            throw checkError;
        }

        if (existingUser) {
            return res.status(400).json({ error: "User already exists." });
        }

        // Insert new user with role
        const { error: roleError } = await supabase
            .from("users")
            .insert([{ id: userId, email, role }]);

        if (roleError) {
            throw roleError;
        }

        res.status(200).json({ message: "Registration successful!", user: data });
    } catch (error) {
        next(error);
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
                .select("bin_id, location, waste_level");

            if (binsError) {
                throw binsError;
            }

            res.status(200).json({ role: "admin", bins });
        } else {
            res.status(200).json({ role: "user", message: "User Dashboard Loaded" });
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
