import { Injectable } from '@angular/core';
import { HttpEvent, HttpInterceptor, HttpHandler, HttpRequest, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ErrorLoggingService } from './error-logging.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(
    private messageService: MessageService,
    private errorLoggingService: ErrorLoggingService
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'An error occurred';

        if (error.error instanceof ErrorEvent) {
          errorMessage = `Network error: ${error.error.message}`;
        } else {
          switch (error.status) {
            case 0:
              errorMessage = 'Network error: Unable to connect to the server';
              break;
            case 400:
              errorMessage = error.error?.message || 'Bad request';
              break;
            case 401:
              errorMessage = 'Unauthorized: Please log in';
              break;
            case 403:
              errorMessage = 'Forbidden: You do not have permission';
              break;
            case 404:
              errorMessage = 'Resource not found';
              break;
            case 500:
              errorMessage = 'Server error: Please try again later';
              break;
            case 503:
              errorMessage = 'Service unavailable: Please try again later';
              break;
            default:
              errorMessage = error.error?.message || `Error ${error.status}: ${error.statusText}`;
          }
        }

        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 4000
        });

        // Log error to backend (skip if it's the logging endpoint itself to avoid infinite loop)
        if (!req.url.includes('/api/logs/error')) {
          this.errorLoggingService.logError(error, {
            source: 'http-interceptor',
            requestUrl: req.url,
            requestMethod: req.method,
            statusCode: error.status,
            userFacingMessage: errorMessage
          });
        }

        return throwError(() => error);
      })
    );
  }
}
