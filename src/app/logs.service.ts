import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface LogEntry {
  timestamp: string;
  type: string;
  source: string;
  message: string;
  stack: string | null;
  userEmail: string;
  userAgent: string | null;
  url: string | null;
  method: string | null;
  statusCode: number | null;
  context: any;
  severity: string;
  id: string;
}

export interface LogsResponse {
  success: boolean;
  logs: LogEntry[];
  count: number;
}

export interface LogStats {
  success: boolean;
  stats: {
    total: number;
    byType: { [key: string]: number };
    bySeverity: { [key: string]: number };
    byUser: { [key: string]: number };
    bySource: { [key: string]: number };
    timeline: { [key: string]: number };
  };
}

@Injectable({
  providedIn: 'root'
})
export class LogsService {
  private apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/logs';

  constructor(private http: HttpClient) {}

  /**
   * Get logs with optional filters
   */
  getLogs(params: {
    startDate?: string;
    endDate?: string;
    type?: string;
    userEmail?: string;
    severity?: string;
    source?: string;
    limit?: number;
  } = {}): Observable<LogsResponse> {
    return this.http.get<LogsResponse>(this.apiUrl, { params: params as any });
  }

  /**
   * Get error statistics
   */
  getStats(days: number = 7): Observable<LogStats> {
    return this.http.get<LogStats>(`${this.apiUrl}/stats`, {
      params: { days: days.toString() }
    });
  }

  /**
   * Delete old logs
   */
  cleanupLogs(daysToKeep: number = 30): Observable<any> {
    return this.http.delete(`${this.apiUrl}/cleanup`, {
      params: { daysToKeep: daysToKeep.toString() }
    });
  }
}
