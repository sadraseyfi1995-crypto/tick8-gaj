import { Injectable } from '@angular/core';
import { Observable, filter, BehaviorSubject, of, Subject, debounceTime, switchMap } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { VboxState, VocabComponentModel } from './vocab/vocab.component';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';

import { SharedService } from './shared.service';
import { ICourse } from './models/course.model';
import { AuthService } from './auth/auth.service';

@Injectable({
  providedIn: 'root'
})
export class DataHandlerService {
  private apiUrl = 'https://tick8-api-616079701914.europe-west1.run.app/api/vocab-files';
  public data: VocabComponentModel[] = [];
  public data$ = new BehaviorSubject<VocabComponentModel[]>([]);
  public courses: ICourse[] = [];
  public courses$ = new BehaviorSubject<ICourse[]>([]);
  public loading$ = new BehaviorSubject<boolean>(false);

  // Debouncing for updates to prevent GCS rate limiting
  private pendingUpdates = new Map<string, { id: string | number; updates: any; courseId: string }>();
  private updateTrigger$ = new Subject<void>();
  private updateDebounceMs = 500;

  constructor(private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private sharedService: SharedService,
    private authService: AuthService
  ) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        const courseId = this.route.snapshot.queryParams['course'];
        // Only fetch courses if authenticated
        if (this.authService.isAuthenticated()) {
          if (this.courses.length === 0) {
            this.getCourses().subscribe(courses => {
              this.courses = courses.map((c: any) => ({
                id: c.filename.replace('.json', ''),
                name: c.name,
                order: 0,
                pageSize: c.pageSize || 15
              }));
              this.updateChosenCourse(courseId);
            });
          } else {
            this.updateChosenCourse(courseId);
          }
        }
      });

    // Setup debounced update processing to prevent GCS rate limiting
    this.updateTrigger$.pipe(
      debounceTime(this.updateDebounceMs)
    ).subscribe(() => {
      this.processPendingUpdates();
    });
  }

  private updateChosenCourse(courseId: string) {
    const course = this.courses.find(item => item.id === courseId);
    if (course) {
      this.sharedService.setChosenCourse(course);
    }
    this.sharedService.setChosenCourseId(courseId);
    this.fetchData();
  }

  private fetchData() {
    this.loading$.next(true);
    this.getAll().subscribe({
      next: data => {
        this.data = data;
        this.data$.next(data);

        // Calculate and navigate to the last filled page
        const course = this.sharedService.getChosenCourse();
        if (course) {
          const lastFilledPage = this.sharedService.calculateLastFilledPage(data, course.pageSize ?? 20);
          this.sharedService.navigateToPage(lastFilledPage);
        }
        this.loading$.next(false);
      },
      error: err => {
        console.error('Error fetching data:', err);
        this.loading$.next(false);
      }
    });
  }

  getAll(): Observable<VocabComponentModel[]> {
    const courseId = this.sharedService.getChosenCourseId();
    if (!courseId) {
      return of([]);
    }
    return this.http.get<VocabComponentModel[]>(this.apiUrl + '/' + courseId + '.json');
  }

  getPage(courseId: string, page: number, pageSize: number): Observable<{ data: VocabComponentModel[], page: number, pageSize: number, total: number, totalPages: number }> {
    return this.http.get<{ data: VocabComponentModel[], page: number, pageSize: number, total: number, totalPages: number }>(
      `${this.apiUrl}/${courseId}.json?page=${page}&pageSize=${pageSize}`
    );
  }

  getLastFilledPage(courseId: string, pageSize: number): Observable<{ lastFilledPage: number, lastFilledIndex: number, totalItems: number, pageSize: number }> {
    return this.http.get<{ lastFilledPage: number, lastFilledIndex: number, totalItems: number, pageSize: number }>(
      `${this.apiUrl}/${courseId}.json/last-filled-page?pageSize=${pageSize}`
    );
  }

  updateById(id: number | string, updates: VboxState[] | { states?: VboxState[]; liked?: boolean }): Observable<{ success: boolean; item?: VocabComponentModel }> {
    const courseId = this.sharedService.getChosenCourseId();
    if (!courseId) {
      return of({ success: false });
    }

    // Create a unique key for this update
    const updateKey = `${courseId}:${id}`;

    // Merge with any pending update for this item
    const existing = this.pendingUpdates.get(updateKey);
    let mergedUpdates = updates;
    if (existing) {
      // Merge updates - new updates override existing
      if (Array.isArray(updates)) {
        mergedUpdates = updates;
      } else if (typeof existing.updates === 'object' && !Array.isArray(existing.updates)) {
        mergedUpdates = { ...existing.updates, ...updates };
      } else {
        mergedUpdates = updates;
      }
    }

    this.pendingUpdates.set(updateKey, { id, updates: mergedUpdates, courseId });

    // Trigger debounced processing
    this.updateTrigger$.next();

    // Return immediately with success (optimistic update)
    // The actual API call happens after debounce
    return of({ success: true });
  }

  /**
   * Process all pending updates - called after debounce timer
   */
  private processPendingUpdates(): void {
    const updates = Array.from(this.pendingUpdates.entries());
    this.pendingUpdates.clear();

    if (updates.length === 0) return;

    // Process each unique item update
    updates.forEach(([key, { id, updates, courseId }]) => {
      const url = `${this.apiUrl}/${courseId}/${id}`;
      this.http.patch<{ success: boolean; item?: VocabComponentModel }>(url, updates).subscribe({
        next: (response) => {
          // Update local data if needed
          if (response.item) {
            const index = this.data.findIndex(item => String(item.id) === String(id));
            if (index !== -1) {
              this.data[index] = response.item;
              this.data$.next([...this.data]);
            }
          }
        },
        error: (err) => {
          console.error('Failed to save update:', err);
          // Could implement retry logic here
        }
      });
    });
  }

  getCourses(): Observable<any[]> {
    return this.http.get<any[]>(`https://tick8-api-616079701914.europe-west1.run.app/api/courses?t=${new Date().getTime()}`);
  }

  refreshCourses() {
    this.getCourses().subscribe(courses => {
      this.courses = courses.map((c: any) => ({
        id: c.filename.replace('.json', ''),
        name: c.name,
        order: c.order || 0,
        pageSize: c.pageSize || 15
      }));
      this.courses$.next(this.courses);
    });
  }

  deleteCourse(id: string): Observable<any> {
    return this.http.delete<any>(`https://tick8-api-616079701914.europe-west1.run.app/api/courses/${id}`);
  }

  updateCourse(id: string, updates: any): Observable<any> {
    return this.http.put<any>(`https://tick8-api-616079701914.europe-west1.run.app/api/courses/${id}`, updates);
  }

  createCourse(courseData: any, content: any[]): Observable<any> {
    return this.http.post<any>('https://tick8-api-616079701914.europe-west1.run.app/api/courses', {
      name: courseData.name,
      pageSize: courseData.pageSize,
      content: content
    });
  }

  appendToCourse(courseId: string, content: any[]): Observable<any> {
    return this.http.post<any>(`https://tick8-api-616079701914.europe-west1.run.app/api/courses/${courseId}/append`, {
      content: content
    });
  }

  triggerDailyDecay(): Observable<any> {
    return this.http.post<any>('https://tick8-api-616079701914.europe-west1.run.app/api/maintenance/decay', {});
  }

  generateVocab(prompt: string): Observable<any[]> {
    return this.http.post<any[]>('https://tick8-api-616079701914.europe-west1.run.app/api/generate-vocab', { prompt });
  }
}
