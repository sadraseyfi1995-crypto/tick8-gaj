import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
    selector: 'app-signup',
    templateUrl: './signup.component.html',
    styleUrls: ['./signup.component.scss']
})
export class SignupComponent {
    name = '';
    email = '';
    password = '';
    confirmPassword = '';
    isLoading = false;
    errorMessage: string | null = null;
    successMessage: string | null = null;

    constructor(
        private authService: AuthService,
        private router: Router
    ) { }

    signup(): void {
        // Reset messages
        this.errorMessage = null;
        this.successMessage = null;

        // Validate form
        if (!this.name || !this.email || !this.password || !this.confirmPassword) {
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
        if (this.password.length < 8) {
            this.errorMessage = 'Password must be at least 8 characters';
            return;
        }

        // Validate password match
        if (this.password !== this.confirmPassword) {
            this.errorMessage = 'Passwords do not match';
            return;
        }

        this.isLoading = true;

        this.authService.signup(this.email, this.password, this.name).subscribe({
            next: () => {
                this.successMessage = 'Account created successfully!';
                setTimeout(() => {
                    this.router.navigate(['/']);
                }, 1000);
            },
            error: (err) => {
                this.errorMessage = err.message;
                this.isLoading = false;
            }
        });
    }
}
