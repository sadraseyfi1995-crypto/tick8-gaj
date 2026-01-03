import { Component, OnInit } from '@angular/core';
import { LogsService, LogEntry, LogStats } from '../logs.service';

@Component({
  selector: 'app-logs-viewer',
  templateUrl: './logs-viewer.component.html',
  styleUrls: ['./logs-viewer.component.scss']
})
export class LogsViewerComponent implements OnInit {
  logs: LogEntry[] = [];
  stats: any = null;
  isLoading = false;
  errorMessage: string | null = null;

  // Filters
  filterType = '';
  filterSeverity = '';
  filterUser = '';
  filterSource = '';
  filterLimit = 100;
  filterDays = 7;

  // Selected log for detail view
  selectedLog: LogEntry | null = null;

  // Available filter options
  types = ['frontend', 'backend', 'info', 'warning'];
  severities = ['info', 'warning', 'error'];

  constructor(private logsService: LogsService) {}

  ngOnInit(): void {
    this.loadLogs();
    this.loadStats();
  }

  /**
   * Load logs with current filters
   */
  loadLogs(): void {
    this.isLoading = true;
    this.errorMessage = null;

    const params: any = {
      limit: this.filterLimit
    };

    if (this.filterType) params.type = this.filterType;
    if (this.filterSeverity) params.severity = this.filterSeverity;
    if (this.filterUser) params.userEmail = this.filterUser;
    if (this.filterSource) params.source = this.filterSource;

    this.logsService.getLogs(params).subscribe({
      next: (response) => {
        this.logs = response.logs;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.error || 'Failed to load logs';
        this.isLoading = false;
      }
    });
  }

  /**
   * Load statistics
   */
  loadStats(): void {
    this.logsService.getStats(this.filterDays).subscribe({
      next: (response) => {
        this.stats = response.stats;
      },
      error: (err) => {
        console.error('Failed to load stats:', err);
      }
    });
  }

  /**
   * Apply filters and reload
   */
  applyFilters(): void {
    this.loadLogs();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.filterType = '';
    this.filterSeverity = '';
    this.filterUser = '';
    this.filterSource = '';
    this.filterLimit = 100;
    this.loadLogs();
  }

  /**
   * Show log details
   */
  showDetails(log: LogEntry): void {
    this.selectedLog = log;
  }

  /**
   * Close detail view
   */
  closeDetails(): void {
    this.selectedLog = null;
  }

  /**
   * Format timestamp
   */
  formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Get severity badge class
   */
  getSeverityClass(severity: string): string {
    switch (severity) {
      case 'error':
        return 'severity-error';
      case 'warning':
        return 'severity-warning';
      case 'info':
        return 'severity-info';
      default:
        return '';
    }
  }

  /**
   * Get type badge class
   */
  getTypeClass(type: string): string {
    switch (type) {
      case 'frontend':
        return 'type-frontend';
      case 'backend':
        return 'type-backend';
      default:
        return '';
    }
  }

  /**
   * Copy log to clipboard
   */
  copyToClipboard(log: LogEntry): void {
    const logText = JSON.stringify(log, null, 2);
    navigator.clipboard.writeText(logText).then(() => {
      alert('Log copied to clipboard');
    });
  }

  /**
   * Cleanup old logs
   */
  cleanupOldLogs(): void {
    if (confirm('Delete logs older than 30 days?')) {
      this.logsService.cleanupLogs(30).subscribe({
        next: (response) => {
          alert(`Deleted ${response.deletedCount} old log files`);
          this.loadLogs();
          this.loadStats();
        },
        error: (err) => {
          alert('Failed to cleanup logs: ' + (err.error?.error || 'Unknown error'));
        }
      });
    }
  }

  /**
   * Get unique users from stats
   */
  getUniqueUsers(): string[] {
    if (!this.stats?.byUser) return [];
    return Object.keys(this.stats.byUser);
  }

  /**
   * Get unique sources from stats
   */
  getUniqueSources(): string[] {
    if (!this.stats?.bySource) return [];
    return Object.keys(this.stats.bySource);
  }
}
