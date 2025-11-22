import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ICourse } from './sidebar/sidebar.component';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  public chosenCourse$ = new BehaviorSubject<ICourse | null>(null);
  private chosenCourseId!: string;

  public getChosenCourse() {
    return this.chosenCourse$.value;
  }

  public getChosenCourseId() {
    return this.chosenCourseId;
  }

  public setChosenCourseId(id: string) {
    this.chosenCourseId = id;
  }

  public setChosenCourse(course: ICourse) {
    this.chosenCourse$.next(course);
  }

  constructor() {
  }
}
