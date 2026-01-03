import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ErrorLoggingService {
  private apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/logs';

  constructor(private http: HttpClient) {}

  /**
   * Log an error to the backend
   */
  logError(error: any, context: any = {}): void {
    const errorData = {
      type: 'frontend',
      source: context.source || 'unknown',
      message: this.extractMessage(error),
      stack: error.stack || null,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
        userEmail: this.getUserEmail()
      },
      severity: context.severity || 'error'
    };

    // Send to backend (fire and forget - don't block UI on logging errors)
    this.http.post(`${this.apiUrl}/error`, errorData)
      .pipe(
        catchError(err => {
          // Silently fail if logging fails
          console.error('Failed to log error to backend:', err);
          return of(null);
        })
      )
      .subscribe();
  }

  /**
   * Log a warning
   */
  logWarning(message: string, context: any = {}): void {
    this.logError(
      { message },
      { ...context, severity: 'warning' }
    );
  }

  /**
   * Log info
   */
  logInfo(message: string, context: any = {}): void {
    this.logError(
      { message },
      { ...context, severity: 'info' }
    );
  }

  /**
   * Extract error message from various error types
   */
  private extractMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (error?.message) {
      return error.message;
    }

    if (error?.error?.message) {
      return error.error.message;
    }

    if (error?.error) {
      return JSON.stringify(error.error);
    }

    return 'Unknown error';
  }

  /**
   * Get current user email from localStorage
   */
  private getUserEmail(): string {
    try {
      const userStr = localStorage.getItem('tick8_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.email || 'anonymous';
      }
    } catch (e) {
      // Ignore
    }
    return 'anonymous';
  }
}
