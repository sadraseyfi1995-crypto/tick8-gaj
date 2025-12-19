const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

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
        const { email, name, picture, googleId } = userData;
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
        } else {
            // Create new user
            user = {
                email,
                name,
                picture,
                googleId,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            };
        }

        await fs.writeFile(profilePath, JSON.stringify(user, null, 2), 'utf-8');
        return user;
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
}

module.exports = {
    setupAuthRoutes,
    authMiddleware,
    optionalAuthMiddleware,
    UserService,
    AUTH_CONFIG
};
