import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

// Global error logging function (before Angular initializes)
function logErrorToBackend(errorData: any) {
  try {
    const apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/logs/error';

    // Get user email if available
    let userEmail = 'anonymous';
    try {
      const userStr = localStorage.getItem('tick8_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        userEmail = user.email || 'anonymous';
      }
    } catch (e) {
      // Ignore localStorage errors
    }

    const payload = {
      type: 'frontend',
      source: errorData.source || 'early-initialization',
      message: errorData.message || 'Unknown error',
      stack: errorData.stack || null,
      url: window.location.href,
      userAgent: navigator.userAgent,
      context: errorData.context || {},
      severity: errorData.severity || 'error',
      userEmail: userEmail
    };

    // Use sendBeacon if available (more reliable for page unload), otherwise fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(apiUrl, blob);
    } else {
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(() => {
        // Silently fail if logging fails
      });
    }
  } catch (e) {
    // Silently fail if logging fails
    console.error('Failed to log error:', e);
  }
}

// Catch global window errors (before Angular)
window.addEventListener('error', (event: ErrorEvent) => {
  logErrorToBackend({
    source: 'window-error-handler',
    message: event.message || 'Window error',
    stack: event.error?.stack || null,
    context: {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    }
  });
});

// Catch unhandled promise rejections (before Angular)
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  logErrorToBackend({
    source: 'unhandled-promise-rejection',
    message: event.reason?.message || event.reason?.toString() || 'Unhandled promise rejection',
    stack: event.reason?.stack || null,
    context: {
      reason: event.reason
    }
  });
});

// Intercept console.error to catch errors logged to console
const originalConsoleError = console.error;
console.error = function(...args: any[]) {
  // Call original console.error
  originalConsoleError.apply(console, args);

  // Log to backend if it looks like an error
  if (args.length > 0) {
    const firstArg = args[0];
    if (firstArg instanceof Error || (typeof firstArg === 'string' && firstArg.toLowerCase().includes('error'))) {
      logErrorToBackend({
        source: 'console-error',
        message: firstArg instanceof Error ? firstArg.message : String(firstArg),
        stack: firstArg instanceof Error ? firstArg.stack : null,
        context: {
          args: args.map(arg => {
            try {
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            } catch {
              return String(arg);
            }
          })
        },
        severity: 'warning' // Console errors are typically warnings
      });
    }
  }
};

// Bootstrap Angular with error logging
platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => {
    console.error('Angular bootstrap error:', err);
    logErrorToBackend({
      source: 'angular-bootstrap',
      message: err.message || 'Failed to bootstrap Angular application',
      stack: err.stack || null,
      severity: 'error'
    });
  });
