import { Injectable } from '@angular/core';
import { Observable, filter, BehaviorSubject, of } from 'rxjs';
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
    const courseId = this.sharedService.getChosenCourseId();
    if (!courseId) {
      return of([]);
    }
    return this.http.get<VocabComponentModel[]>(this.apiUrl + '/' + courseId + '.json');
  }

  updateById(id: number | string, updates: VboxState[]): Observable<{ success: boolean; item?: VocabComponentModel }> {
    const url = `${this.apiUrl}/${this.sharedService.getChosenCourseId()}/${id}`;
    return this.http.patch<{ success: boolean; item?: VocabComponentModel }>(url, updates);
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
