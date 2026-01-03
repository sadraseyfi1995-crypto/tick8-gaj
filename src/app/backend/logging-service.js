const fs = require('fs').promises;
const path = require('path');

/**
 * Logging Service - Centralized error and event logging
 * All logs are stored under the admin user's directory
 */
class LoggingService {
    constructor(storage, adminEmail) {
        this.storage = storage;
        this.adminEmail = adminEmail;
        this.logsDir = `users/${this.sanitizeEmail(adminEmail)}/logs`;
    }

    /**
     * Sanitize email for file paths
     */
    sanitizeEmail(email) {
        if (!email || typeof email !== 'string') {
            return 'unknown';
        }
        return email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
    }

    /**
     * Get current log file path (one file per day)
     */
    getCurrentLogFile() {
        const today = new Date().toISOString().split('T')[0];
        return `${this.logsDir}/${today}.jsonl`;
    }

    /**
     * Log an error
     * @param {Object} errorData - Error information
     * @param {string} errorData.type - Error type: 'frontend' or 'backend'
     * @param {string} errorData.source - Source of error (e.g., 'auth.service', 'server.js')
     * @param {string} errorData.message - Error message
     * @param {string} errorData.stack - Stack trace (optional)
     * @param {string} errorData.userEmail - User who encountered the error (optional)
     * @param {Object} errorData.context - Additional context (optional)
     */
    async logError(errorData) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                type: errorData.type || 'unknown',
                source: errorData.source || 'unknown',
                message: errorData.message || 'No message',
                stack: errorData.stack || null,
                userEmail: errorData.userEmail || 'anonymous',
                userAgent: errorData.userAgent || null,
                url: errorData.url || null,
                method: errorData.method || null,
                statusCode: errorData.statusCode || null,
                context: errorData.context || {},
                severity: errorData.severity || 'error',
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            };

            // Ensure logs directory exists
            await this.storage.ensureDir(this.logsDir);

            // Get current log file
            const logFile = this.getCurrentLogFile();

            // Append log entry (JSONL format - one JSON object per line)
            const logLine = JSON.stringify(logEntry) + '\n';

            // Read existing content if file exists
            let existingContent = '';
            if (await this.storage.exists(logFile)) {
                existingContent = await this.storage.read(logFile);
            }

            // Append new log entry
            await this.storage.write(logFile, existingContent + logLine);

            console.log(`[LOG] ${logEntry.severity.toUpperCase()}: ${logEntry.message} (User: ${logEntry.userEmail})`);

            return logEntry;
        } catch (err) {
            // Fallback to console if logging fails
            console.error('Failed to write to log file:', err);
            console.error('Original error data:', errorData);
            return null;
        }
    }

    /**
     * Log an informational event
     */
    async logInfo(message, context = {}) {
        return this.logError({
            type: 'info',
            message,
            context,
            severity: 'info'
        });
    }

    /**
     * Log a warning
     */
    async logWarning(message, context = {}) {
        return this.logError({
            type: 'warning',
            message,
            context,
            severity: 'warning'
        });
    }

    /**
     * Get logs for a specific date range
     * @param {string} startDate - Start date (YYYY-MM-DD)
     * @param {string} endDate - End date (YYYY-MM-DD)
     * @param {Object} filters - Optional filters
     */
    async getLogs(startDate, endDate, filters = {}) {
        try {
            const logs = [];
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Iterate through each day in the range
            for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
                const dateStr = date.toISOString().split('T')[0];
                const logFile = `${this.logsDir}/${dateStr}.jsonl`;

                if (await this.storage.exists(logFile)) {
                    const content = await this.storage.read(logFile);
                    const lines = content.trim().split('\n').filter(line => line);

                    for (const line of lines) {
                        try {
                            const logEntry = JSON.parse(line);

                            // Apply filters
                            if (filters.type && logEntry.type !== filters.type) continue;
                            if (filters.userEmail && logEntry.userEmail !== filters.userEmail) continue;
                            if (filters.severity && logEntry.severity !== filters.severity) continue;
                            if (filters.source && !logEntry.source.includes(filters.source)) continue;

                            logs.push(logEntry);
                        } catch (parseErr) {
                            console.error('Failed to parse log line:', parseErr);
                        }
                    }
                }
            }

            // Sort by timestamp descending (newest first)
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return logs;
        } catch (err) {
            console.error('Failed to retrieve logs:', err);
            return [];
        }
    }

    /**
     * Get recent logs (last N entries)
     */
    async getRecentLogs(limit = 100, filters = {}) {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);

        const logs = await this.getLogs(
            sevenDaysAgo.toISOString().split('T')[0],
            today.toISOString().split('T')[0],
            filters
        );

        return logs.slice(0, limit);
    }

    /**
     * Get error statistics
     */
    async getErrorStats(days = 7) {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - days);

        const logs = await this.getLogs(
            startDate.toISOString().split('T')[0],
            today.toISOString().split('T')[0]
        );

        const stats = {
            total: logs.length,
            byType: {},
            bySeverity: {},
            byUser: {},
            bySource: {},
            timeline: {}
        };

        logs.forEach(log => {
            // Count by type
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;

            // Count by severity
            stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;

            // Count by user
            stats.byUser[log.userEmail] = (stats.byUser[log.userEmail] || 0) + 1;

            // Count by source
            stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1;

            // Count by date
            const date = log.timestamp.split('T')[0];
            stats.timeline[date] = (stats.timeline[date] || 0) + 1;
        });

        return stats;
    }

    /**
     * Delete old logs (cleanup)
     */
    async deleteOldLogs(daysToKeep = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const files = await this.storage.list(this.logsDir);

            let deletedCount = 0;
            for (const file of files) {
                if (file.endsWith('.jsonl')) {
                    const dateStr = file.replace('.jsonl', '');
                    const fileDate = new Date(dateStr);

                    if (fileDate < cutoffDate) {
                        await this.storage.delete(`${this.logsDir}/${file}`);
                        deletedCount++;
                    }
                }
            }

            console.log(`Deleted ${deletedCount} old log files`);
            return deletedCount;
        } catch (err) {
            console.error('Failed to delete old logs:', err);
            return 0;
        }
    }
}

module.exports = LoggingService;
