import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface Snapshot {
  id: string;
  date: string;
  createdAt: string;
  note: string;
}

@Component({
  selector: 'app-snapshot-management',
  templateUrl: './snapshot-management.component.html',
  styleUrls: ['./snapshot-management.component.scss']
})
export class SnapshotManagementComponent implements OnInit {
  private apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/snapshots';

  snapshots: Snapshot[] = [];
  newNote: string = '';
  isLoading: boolean = false;
  message: string = '';

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.loadSnapshots();
  }

  loadSnapshots(): void {
    this.isLoading = true;
    this.http.get<Snapshot[]>(this.apiUrl).subscribe({
      next: (data) => {
        this.snapshots = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load snapshots:', err);
        this.isLoading = false;
      }
    });
  }

  createSnapshot(): void {
    this.isLoading = true;
    this.http.post<any>(this.apiUrl, { note: this.newNote }).subscribe({
      next: (res) => {
        this.message = 'Snapshot created!';
        this.newNote = '';
        this.loadSnapshots();
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        console.error('Failed to create snapshot:', err);
        this.message = 'Failed to create snapshot';
        this.isLoading = false;
      }
    });
  }

  restoreSnapshot(id: string): void {
    if (!confirm('Restore this snapshot? Current data will be overwritten.')) {
      return;
    }

    this.isLoading = true;
    this.http.post<any>(`${this.apiUrl}/${id}/restore`, {}).subscribe({
      next: () => {
        this.message = 'Snapshot restored! Refresh the page to see changes.';
        this.isLoading = false;
        setTimeout(() => this.message = '', 5000);
      },
      error: (err) => {
        console.error('Failed to restore snapshot:', err);
        this.message = 'Failed to restore snapshot';
        this.isLoading = false;
      }
    });
  }

  deleteSnapshot(id: string): void {
    if (!confirm('Delete this snapshot? This cannot be undone.')) {
      return;
    }

    this.isLoading = true;
    this.http.delete<any>(`${this.apiUrl}/${id}`).subscribe({
      next: () => {
        this.message = 'Snapshot deleted';
        this.loadSnapshots();
        setTimeout(() => this.message = '', 3000);
      },
      error: (err) => {
        console.error('Failed to delete snapshot:', err);
        this.message = 'Failed to delete snapshot';
        this.isLoading = false;
      }
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString();
  }
}
