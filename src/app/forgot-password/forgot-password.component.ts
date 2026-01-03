import { Component } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Component({
    selector: 'app-forgot-password',
    templateUrl: './forgot-password.component.html',
    styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
    email = '';
    isLoading = false;
    errorMessage: string | null = null;
    successMessage: string | null = null;
    resetToken: string | null = null;

    constructor(private authService: AuthService) { }

    requestReset(): void {
        // Reset messages
        this.errorMessage = null;
        this.successMessage = null;
        this.resetToken = null;

        // Validate email
        if (!this.email) {
            this.errorMessage = 'Email is required';
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.email)) {
            this.errorMessage = 'Invalid email format';
            return;
        }

        this.isLoading = true;

        this.authService.forgotPassword(this.email).subscribe({
            next: (response) => {
                this.successMessage = response.message;
                // For development: show reset token (REMOVE IN PRODUCTION)
                if (response.resetToken) {
                    this.resetToken = response.resetToken;
                }
                this.isLoading = false;
            },
            error: (err) => {
                this.errorMessage = err.message || 'Failed to send reset email';
                this.isLoading = false;
            }
        });
    }
}
