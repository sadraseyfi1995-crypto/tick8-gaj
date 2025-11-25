import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { VocabComponentModel } from './vocab/vocab.component';
import { ICourse } from './models/course.model';

@Injectable({
  providedIn: 'root'
})
export class SharedService {
  public chosenCourse$ = new BehaviorSubject<ICourse | null>(null);
  public pageNavigation$ = new Subject<number>();
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

  public navigateToPage(page: number) {
    this.pageNavigation$.next(page);
  }

  /**
   * Calculate the last page that contains at least one filled card
   * A card is considered filled if it has at least one state that is not 'none'
   */
  public calculateLastFilledPage(data: VocabComponentModel[], pageSize: number): number {
    if (!data || data.length === 0) {
      return 0;
    }

    let lastFilledIndex = -1;

    // Find the last card that has at least one non-'none' state
    for (let i = data.length - 1; i >= 0; i--) {
      const card = data[i];
      if (card.states && card.states.some(state => state !== 'none')) {
        lastFilledIndex = i;
        break;
      }
    }

    // If no filled cards found, return first page
    if (lastFilledIndex === -1) {
      return 0;
    }

    // Calculate which page this card is on
    return Math.floor(lastFilledIndex / pageSize);
  }

  constructor() {
  }
}
