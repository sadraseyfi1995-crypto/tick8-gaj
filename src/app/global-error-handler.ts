import { ErrorHandler, Injectable } from '@angular/core';
import { ErrorLoggingService } from './error-logging.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private errorLoggingService: ErrorLoggingService) {}

  handleError(error: any): void {
    // Log to console for debugging
    console.error('Global error caught:', error);

    // Extract error details
    const errorMessage = error.message || error.toString();
    const stack = error.stack || null;

    // Log to backend
    this.errorLoggingService.logError(error, {
      source: 'global-error-handler',
      errorType: error.name || 'UnhandledError',
      componentStack: this.extractComponentStack(error)
    });

    // Don't suppress the error - let Angular's default error handling continue
    throw error;
  }

  /**
   * Extract Angular component stack if available
   */
  private extractComponentStack(error: any): string | null {
    if (error?.ngDebugContext) {
      return JSON.stringify({
        component: error.ngDebugContext.component?.constructor?.name,
        view: error.ngDebugContext.view
      });
    }
    return null;
  }
}
