import { Component, AfterViewInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements AfterViewInit {
    isLoading = false;
    errorMessage: string | null = null;
    statusMessage: string | null = null;
    showFallbackButton = false;

    constructor(private authService: AuthService) { }

    ngAfterViewInit(): void {
        // Initialize Google Sign-In button after view is ready
        setTimeout(() => {
            this.authService.initializeGoogleSignIn('google-signin-button');

            // Show fallback button after a delay if Google button didn't render
            setTimeout(() => {
                const googleButton = document.getElementById('google-signin-button');
                if (googleButton && googleButton.children.length === 0) {
                    this.showFallbackButton = true;
                    this.statusMessage = 'Google button loading delayed. Use the button below:';
                }
            }, 3000);
        }, 100);
    }

    /**
     * Manual Google Sign-In using OAuth popup
     */
    signInWithGooglePopup(): void {
        this.isLoading = true;
        this.errorMessage = null;

        // Open Google OAuth popup manually
        const clientId = '756031099059-a9njf86rbc742hfukari2s2koui01q5p.apps.googleusercontent.com';
        // IMPORTANT: This must match exactly what is in Google Cloud Console "Authorized redirect URIs"
        const redirectUri = encodeURIComponent(window.location.origin);
        const scope = encodeURIComponent('openid email profile');
        const nonce = Math.random().toString(36).substring(2);

        console.log('Starting manual sign-in...');
        console.log('Redirect URI:', window.location.origin);

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}&` +
            `redirect_uri=${redirectUri}&` +
            `response_type=id_token&` +
            `scope=${scope}&` +
            `nonce=${nonce}&` +
            `prompt=select_account`;

        // Open popup
        const popup = window.open(authUrl, 'Google Sign In', 'width=500,height=600');

        if (!popup) {
            this.errorMessage = 'Popup blocked. Please allow popups for this site.';
            this.isLoading = false;
            return;
        }

        // Listen for message from popup
        const messageHandler = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                console.log('Received token from popup');
                window.removeEventListener('message', messageHandler);

                const hash = event.data.hash;
                const params = new URLSearchParams(hash.substring(1));
                const idToken = params.get('id_token');

                if (idToken) {
                    // Authenticate with backend
                    this.authService.authenticateWithGoogle(idToken).subscribe({
                        next: () => {
                            window.location.href = '/';
                        },
                        error: (err) => {
                            console.error('Backend auth failed:', err);
                            this.errorMessage = 'Authentication failed. Please try again.';
                            this.isLoading = false;
                        }
                    });
                }
            }
        };

        window.addEventListener('message', messageHandler);

        // Check for popup close (fallback if user closes it manually)
        const checkPopup = setInterval(() => {
            if (popup.closed) {
                clearInterval(checkPopup);
                // If we haven't authenticated yet, stop loading
                // (Wait a bit just in case the message is processing)
                setTimeout(() => {
                    if (this.isLoading) {
                        this.isLoading = false;
                        window.removeEventListener('message', messageHandler);
                        console.log('Popup closed by user');
                    }
                }, 1000);
            }
        }, 500);
    }
}
