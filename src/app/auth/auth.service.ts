import { Injectable, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { GOOGLE_CONFIG } from './google.config';

declare const google: any;

export interface User {
    email: string;
    name: string;
    picture: string;
}

export interface AuthResponse {
    success: boolean;
    token: string;
    user: User;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/auth';
    private tokenKey = 'tick8_auth_token';
    private userKey = 'tick8_user';

    private currentUser$ = new BehaviorSubject<User | null>(null);
    private isAuthenticated$ = new BehaviorSubject<boolean>(false);
    private googleClientId = GOOGLE_CONFIG.clientId;

    public user$ = this.currentUser$.asObservable();
    public isLoggedIn$ = this.isAuthenticated$.asObservable();

    constructor(
        private http: HttpClient,
        private router: Router,
        private ngZone: NgZone
    ) {
        this.checkStoredAuth();
    }

    /**
     * Check for stored authentication on app startup
     */
    private checkStoredAuth(): void {
        const token = localStorage.getItem(this.tokenKey);
        const userStr = localStorage.getItem(this.userKey);

        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                this.currentUser$.next(user);
                this.isAuthenticated$.next(true);
            } catch {
                this.clearAuth();
            }
        }
    }

    /**
     * Initialize Google Sign-In button
     * @param buttonElementId - ID of the button container element
     */
    public initializeGoogleSignIn(buttonElementId: string): void {
        this.waitForGoogleAndInit(buttonElementId, 0);
    }

    /**
     * Wait for Google Identity Services to load, then initialize
     */
    private waitForGoogleAndInit(buttonElementId: string, attempts: number): void {
        const maxAttempts = 50; // 5 seconds max wait

        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            // Google is loaded, initialize
            google.accounts.id.initialize({
                client_id: this.googleClientId,
                callback: (response: any) => this.handleGoogleCallback(response),
                auto_select: false,
                cancel_on_tap_outside: true
            });

            const buttonElement = document.getElementById(buttonElementId);
            if (buttonElement) {
                google.accounts.id.renderButton(
                    buttonElement,
                    {
                        type: 'standard',
                        theme: 'outline',
                        size: 'large',
                        text: 'signin_with',
                        shape: 'rectangular',
                        logo_alignment: 'left',
                        width: 280
                    }
                );
            }
        } else if (attempts < maxAttempts) {
            // Google not loaded yet, retry
            setTimeout(() => {
                this.waitForGoogleAndInit(buttonElementId, attempts + 1);
            }, 100);
        } else {
            console.error('Google Identity Services failed to load after maximum attempts');
        }
    }

    /**
     * Handle Google Sign-In callback
     */
    private handleGoogleCallback(response: any): void {
        if (response.credential) {
            // Run inside Angular zone to trigger change detection
            this.ngZone.run(() => {
                this.authenticateWithGoogle(response.credential).subscribe({
                    next: () => {
                        this.router.navigate(['/']);
                    },
                    error: (err) => {
                        console.error('Authentication failed:', err);
                    }
                });
            });
        }
    }

    /**
     * Send Google ID token to backend for verification
     */
    public authenticateWithGoogle(idToken: string): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.apiUrl}/google`, { idToken })
            .pipe(
                tap(response => {
                    if (response.success) {
                        this.setAuth(response.token, response.user);
                    }
                }),
                catchError(err => {
                    console.error('Auth error:', err);
                    return throwError(() => new Error(err.error?.error || 'Authentication failed'));
                })
            );
    }

    /**
     * Set authentication state
     */
    private setAuth(token: string, user: User): void {
        localStorage.setItem(this.tokenKey, token);
        localStorage.setItem(this.userKey, JSON.stringify(user));
        this.currentUser$.next(user);
        this.isAuthenticated$.next(true);
    }

    /**
     * Clear authentication state
     */
    private clearAuth(): void {
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        this.currentUser$.next(null);
        this.isAuthenticated$.next(false);
    }

    /**
     * Get stored auth token
     */
    public getToken(): string | null {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Get current user
     */
    public getCurrentUser(): User | null {
        return this.currentUser$.value;
    }

    /**
     * Check if user is authenticated
     */
    public isAuthenticated(): boolean {
        return this.isAuthenticated$.value;
    }

    /**
     * Logout user
     */
    public logout(): void {
        // Call backend to log the logout
        this.http.post(`${this.apiUrl}/logout`, {}).subscribe();

        // Clear local state
        this.clearAuth();

        // Revoke Google session
        if (typeof google !== 'undefined') {
            google.accounts.id.disableAutoSelect();
        }

        // Navigate to login
        this.router.navigate(['/login']);
    }

    /**
     * Get user info from backend
     */
    public fetchUserInfo(): Observable<User> {
        return this.http.get<User>(`${this.apiUrl}/me`)
            .pipe(
                tap(user => {
                    this.currentUser$.next(user);
                }),
                catchError(err => {
                    if (err.status === 401) {
                        this.clearAuth();
                    }
                    return throwError(() => err);
                })
            );
    }
}
