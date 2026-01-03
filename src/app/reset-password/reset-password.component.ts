import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
    selector: 'app-reset-password',
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent implements OnInit {
    email = '';
    token = '';
    newPassword = '';
    confirmPassword = '';
    isLoading = false;
    errorMessage: string | null = null;
    successMessage: string | null = null;

    constructor(
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        // Get token and email from query params if provided
        this.route.queryParams.subscribe(params => {
            this.token = params['token'] || '';
            this.email = params['email'] || '';
        });
    }

    resetPassword(): void {
        // Reset messages
        this.errorMessage = null;
        this.successMessage = null;

        // Validate form
        if (!this.email || !this.token || !this.newPassword || !this.confirmPassword) {
            this.errorMessage = 'All fields are required';
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.email)) {
            this.errorMessage = 'Invalid email format';
            return;
        }

        // Validate password length
        if (this.newPassword.length < 8) {
            this.errorMessage = 'Password must be at least 8 characters';
            return;
        }

        // Validate password match
        if (this.newPassword !== this.confirmPassword) {
            this.errorMessage = 'Passwords do not match';
            return;
        }

        this.isLoading = true;

        this.authService.resetPassword(this.email, this.token, this.newPassword).subscribe({
            next: (response) => {
                this.successMessage = response.message;
                setTimeout(() => {
                    this.router.navigate(['/login']);
                }, 2000);
            },
            error: (err) => {
                this.errorMessage = err.message;
                this.isLoading = false;
            }
        });
    }
}
