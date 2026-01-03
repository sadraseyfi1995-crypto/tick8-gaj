const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Configuration
const AUTH_CONFIG = {
    // Replace with your Google OAuth Client ID from Google Cloud Console
    googleClientId: process.env.GOOGLE_CLIENT_ID || '611200183710-u4c45q0t2tpdo56ufacv5jo286eb7g5a.apps.googleusercontent.com',

    // JWT secret - in production, use a secure random string from env
    jwtSecret: process.env.JWT_SECRET || 'tick8-jwt-secret-change-in-production',

    // JWT expiration
    jwtExpiration: '7d',

    // Users data directory
    usersDir: path.join(__dirname, 'data', 'users')
};

const googleClient = new OAuth2Client(AUTH_CONFIG.googleClientId);

/**
 * User Service - handles user data storage
 */
class UserService {
    /**
     * Get user directory path
     * @param {string} email - User email
     * @returns {string} User directory path
     */
    static getUserDir(email) {
        return path.join(AUTH_CONFIG.usersDir, email);
    }

    /**
     * Get user profile path
     * @param {string} email - User email
     * @returns {string} User profile file path
     */
    static getUserProfilePath(email) {
        return path.join(this.getUserDir(email), 'profile.json');
    }

    /**
     * Check if user exists
     * @param {string} email - User email
     * @returns {boolean}
     */
    static userExists(email) {
        return fsSync.existsSync(this.getUserProfilePath(email));
    }

    /**
     * Get user by email
     * @param {string} email - User email
     * @returns {Promise<Object|null>}
     */
    static async getUser(email) {
        const profilePath = this.getUserProfilePath(email);
        if (!fsSync.existsSync(profilePath)) {
            return null;
        }
        const data = await fs.readFile(profilePath, 'utf-8');
        return JSON.parse(data);
    }

    /**
     * Create or update user
     * @param {Object} userData - User data from Google
     * @returns {Promise<Object>} Created/updated user
     */
    static async upsertUser(userData) {
        const { email, name, picture, googleId, password } = userData;
        const userDir = this.getUserDir(email);
        const profilePath = this.getUserProfilePath(email);

        // Ensure user directory exists
        if (!fsSync.existsSync(userDir)) {
            await fs.mkdir(userDir, { recursive: true });
        }

        let user;
        if (fsSync.existsSync(profilePath)) {
            // Update existing user
            const existing = JSON.parse(await fs.readFile(profilePath, 'utf-8'));
            user = {
                ...existing,
                name,
                picture,
                googleId,
                lastLogin: new Date().toISOString()
            };
            // Only update password if provided
            if (password) {
                user.password = password;
            }
        } else {
            // Create new user
            user = {
                email,
                name,
                picture,
                googleId,
                password,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
        }

        await fs.writeFile(profilePath, JSON.stringify(user, null, 2), 'utf-8');
        return user;
    }

    /**
     * Create user with email/password
     * @param {string} email - User email
     * @param {string} password - User password (plain text)
     * @param {string} name - User name
     * @returns {Promise<Object>} Created user
     */
    static async createEmailUser(email, password, name) {
        const userDir = this.getUserDir(email);
        const profilePath = this.getUserProfilePath(email);

        // Check if user already exists
        if (fsSync.existsSync(profilePath)) {
            throw new Error('User already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Ensure user directory exists
        await fs.mkdir(userDir, { recursive: true });

        const user = {
            email,
            name,
            password: hashedPassword,
            authMethod: 'email',
            emailVerified: false,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };

        await fs.writeFile(profilePath, JSON.stringify(user, null, 2), 'utf-8');

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Verify user password
     * @param {string} email - User email
     * @param {string} password - Plain text password
     * @returns {Promise<Object|null>} User object if valid, null otherwise
     */
    static async verifyPassword(email, password) {
        const user = await this.getUser(email);

        if (!user || !user.password) {
            return null;
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return null;
        }

        // Update last login
        user.lastLogin = new Date().toISOString();
        await fs.writeFile(this.getUserProfilePath(email), JSON.stringify(user, null, 2), 'utf-8');

        // Return user without password
        const { password: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }

    /**
     * Generate password reset token
     * @param {string} email - User email
     * @returns {Promise<string>} Reset token
     */
    static async generatePasswordResetToken(email) {
        const user = await this.getUser(email);

        if (!user) {
            throw new Error('User not found');
        }

        // Generate random token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        // Set expiration (1 hour)
        user.resetToken = resetTokenHash;
        user.resetTokenExpiry = new Date(Date.now() + 3600000).toISOString();

        await fs.writeFile(this.getUserProfilePath(email), JSON.stringify(user, null, 2), 'utf-8');

        return resetToken;
    }

    /**
     * Reset password using token
     * @param {string} email - User email
     * @param {string} token - Reset token
     * @param {string} newPassword - New password
     * @returns {Promise<boolean>} Success status
     */
    static async resetPassword(email, token, newPassword) {
        const user = await this.getUser(email);

        if (!user || !user.resetToken || !user.resetTokenExpiry) {
            return false;
        }

        // Check token expiry
        if (new Date(user.resetTokenExpiry) < new Date()) {
            return false;
        }

        // Verify token
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        if (tokenHash !== user.resetToken) {
            return false;
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user
        user.password = hashedPassword;
        delete user.resetToken;
        delete user.resetTokenExpiry;

        await fs.writeFile(this.getUserProfilePath(email), JSON.stringify(user, null, 2), 'utf-8');

        return true;
    }
}

/**
 * Verify Google ID token
 * @param {string} idToken - Google ID token
 * @returns {Promise<Object>} User payload
 */
async function verifyGoogleToken(idToken) {
    const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: AUTH_CONFIG.googleClientId
    });
    return ticket.getPayload();
}

/**
 * Generate JWT token
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
function generateToken(user) {
    return jwt.sign(
        {
            email: user.email,
            name: user.name
        },
        AUTH_CONFIG.jwtSecret,
        { expiresIn: AUTH_CONFIG.jwtExpiration }
    );
}

/**
 * Middleware to verify JWT token
 */
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, AUTH_CONFIG.jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

/**
 * Optional auth middleware - doesn't fail if no token, just sets req.user if valid
 */
function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, AUTH_CONFIG.jwtSecret);
        req.user = decoded;
    } catch (err) {
        // Token invalid, but that's okay for optional auth
    }

    next();
}

/**
 * Setup auth routes
 * @param {Express.Application} app - Express app
 */
function setupAuthRoutes(app) {
    /**
     * POST /api/auth/google
     * Authenticate with Google ID token
     */
    app.post('/api/auth/google', async (req, res) => {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: 'ID token is required' });
        }

        try {
            // Verify Google token
            const payload = await verifyGoogleToken(idToken);

            // Extract user info
            const userData = {
                email: payload.email,
                name: payload.name,
                picture: payload.picture,
                googleId: payload.sub
            };

            // Create or update user
            const user = await UserService.upsertUser(userData);

            // Generate JWT
            const token = generateToken(user);

            res.json({
                success: true,
                token,
                user: {
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                }
            });
        } catch (err) {
            console.error('Google auth error:', err);

            if (err.message?.includes('Token used too late') ||
                err.message?.includes('Invalid token')) {
                return res.status(401).json({ error: 'Invalid or expired Google token' });
            }

            res.status(500).json({ error: 'Authentication failed' });
        }
    });

    /**
     * GET /api/auth/me
     * Get current user info
     */
    app.get('/api/auth/me', authMiddleware, async (req, res) => {
        try {
            const user = await UserService.getUser(req.user.email);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({
                email: user.email,
                name: user.name,
                picture: user.picture
            });
        } catch (err) {
            console.error('Get user error:', err);
            res.status(500).json({ error: 'Failed to get user info' });
        }
    });

    /**
     * POST /api/auth/logout
     * Logout (client-side token removal, server can log it)
     */
    app.post('/api/auth/logout', optionalAuthMiddleware, (req, res) => {
        // JWT tokens are stateless, so logout is mainly client-side
        // This endpoint is for logging/analytics purposes
        if (req.user) {
            console.log(`User ${req.user.email} logged out`);
        }
        res.json({ success: true });
    });

    /**
     * POST /api/auth/signup
     * Sign up with email and password
     */
    app.post('/api/auth/signup', async (req, res) => {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        try {
            const user = await UserService.createEmailUser(email, password, name);

            // Generate JWT
            const token = generateToken(user);

            res.json({
                success: true,
                token,
                user: {
                    email: user.email,
                    name: user.name
                }
            });
        } catch (err) {
            console.error('Signup error:', err);

            if (err.message === 'User already exists') {
                return res.status(409).json({ error: 'User already exists' });
            }

            res.status(500).json({ error: 'Signup failed' });
        }
    });

    /**
     * POST /api/auth/login
     * Login with email and password
     */
    app.post('/api/auth/login', async (req, res) => {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        try {
            const user = await UserService.verifyPassword(email, password);

            if (!user) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }

            // Generate JWT
            const token = generateToken(user);

            res.json({
                success: true,
                token,
                user: {
                    email: user.email,
                    name: user.name,
                    picture: user.picture
                }
            });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Login failed' });
        }
    });

    /**
     * POST /api/auth/forgot-password
     * Request password reset
     */
    app.post('/api/auth/forgot-password', async (req, res) => {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        try {
            const resetToken = await UserService.generatePasswordResetToken(email);

            // In production, send this via email
            // For now, return it in the response (NOT SECURE for production)
            console.log(`Password reset token for ${email}: ${resetToken}`);

            res.json({
                success: true,
                message: 'Password reset instructions sent to your email',
                // REMOVE THIS IN PRODUCTION - only for development
                resetToken: resetToken
            });
        } catch (err) {
            console.error('Forgot password error:', err);

            // Always return success to prevent email enumeration
            res.json({
                success: true,
                message: 'If the email exists, password reset instructions have been sent'
            });
        }
    });

    /**
     * POST /api/auth/reset-password
     * Reset password using token
     */
    app.post('/api/auth/reset-password', async (req, res) => {
        const { email, token, newPassword } = req.body;

        if (!email || !token || !newPassword) {
            return res.status(400).json({ error: 'Email, token, and new password are required' });
        }

        // Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        try {
            const success = await UserService.resetPassword(email, token, newPassword);

            if (!success) {
                return res.status(400).json({ error: 'Invalid or expired reset token' });
            }

            res.json({
                success: true,
                message: 'Password reset successfully'
            });
        } catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({ error: 'Password reset failed' });
        }
    });
}

module.exports = {
    setupAuthRoutes,
    authMiddleware,
    optionalAuthMiddleware,
    UserService,
    AUTH_CONFIG
};
