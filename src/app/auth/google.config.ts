/**
 * Google OAuth Configuration
 * 
 * Replace the values below with your actual Google OAuth credentials
 * from the Google Cloud Console: https://console.cloud.google.com/apis/credentials
 * 
 * Setup steps:
 * 1. Go to Google Cloud Console → APIs & Services → Credentials
 * 2. Create or select a project
 * 3. Configure OAuth consent screen (External for testing)
 * 4. Create OAuth 2.0 Client ID (Web application type)
 * 5. Add authorized JavaScript origins: http://localhost:4200
 * 6. Add authorized redirect URIs: http://localhost:4200
 * 7. Copy the Client ID and paste it below
 */

export const GOOGLE_CONFIG = {
    /**
     * Your Google OAuth 2.0 Client ID
     * Format: xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
     */
    clientId: '611200183710-u4c45q0t2tpdo56ufacv5jo286eb7g5a.apps.googleusercontent.com'
};
