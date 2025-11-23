import { Injectable } from '@angular/core';
import { Observable, catchError, filter, throwError, BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { VboxState, VocabComponentModel } from './vocab/vocab.component';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';

import { SharedService } from './shared.service';
import { ICourse } from './sidebar/sidebar.component';

@Injectable({
  providedIn: 'root'
})
export class DataHandlerService {
  private apiUrl = 'http://localhost:3000/api/vocab-files';
  public data: VocabComponentModel[] = [];
  public data$ = new BehaviorSubject<VocabComponentModel[]>([]);
  public courses: ICourse[] = [];

  constructor(private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private sharedService: SharedService
  ) {
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        const courseId = this.route.snapshot.queryParams['course'];
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
      })
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
    this.getAll().subscribe(data => {
      this.data = data;
      this.data$.next(data);

      // Calculate and navigate to the last filled page
      const course = this.sharedService.getChosenCourse();
      if (course) {
        const lastFilledPage = this.sharedService.calculateLastFilledPage(data, course.pageSize ?? 20);
        this.sharedService.navigateToPage(lastFilledPage);
      }
    });
  }

  getAll(): Observable<VocabComponentModel[]> {
    return this.http.get<VocabComponentModel[]>(this.apiUrl + (this.sharedService.getChosenCourseId() ? '/' + this.sharedService.getChosenCourseId() + '.json' : ''))
      .pipe(catchError(this.handleError));
  }

  updateById(id: number | string, updates: VboxState[]): Observable<{ success: boolean; item?: VocabComponentModel }> {
    const url = `${this.apiUrl}/${this.sharedService.getChosenCourseId()}/${id}`;
    return this.http.patch<{ success: boolean; item?: VocabComponentModel }>(url, updates)
      .pipe(catchError(this.handleError));
  }

  getCourses(): Observable<any[]> {
    return this.http.get<any[]>('http://localhost:3000/api/courses')
      .pipe(catchError(this.handleError));
  }

  deleteCourse(id: string): Observable<any> {
    return this.http.delete<any>(`http://localhost:3000/api/courses/${id}`)
      .pipe(catchError(this.handleError));
  }

  updateCourse(id: string, updates: any): Observable<any> {
    return this.http.put<any>(`http://localhost:3000/api/courses/${id}`, updates)
      .pipe(catchError(this.handleError));
  }

  triggerDailyDecay(): Observable<any> {
    return this.http.post<any>('http://localhost:3000/api/maintenance/decay', {})
      .pipe(catchError(this.handleError));
  }

  private handleError(err: any) {
    console.error('VocabApiService error', err);
    return throwError(() => new Error(err.message || 'Server error'));
  }
}
