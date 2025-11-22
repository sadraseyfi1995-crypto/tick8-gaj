import { Component, HostListener, Input } from '@angular/core';
import { VocabComponentModel } from '../vocab/vocab.component';
import { SharedService } from '../shared.service';

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    result.push(array.slice(i, i + chunkSize));
  }
  return result;
}

@Component({
  selector: 'app-book',
  templateUrl: './book.component.html',
  styleUrls: ['./book.component.scss']
})
export class BookComponent {
  private _allQuestions: VocabComponentModel[] = [];
  public get allQuestions(): VocabComponentModel[] {
    return this._allQuestions;
  }
  @Input()
  public set allQuestions(value: VocabComponentModel[]) {
    this._allQuestions = value;
    this.createChunkedQuestions();
  }
  chunkedQuestions: VocabComponentModel[][] = [];
  currentPage: number = 0;

  constructor(private sharedService: SharedService) {

  }

  ngOnInit(): void {
    this.sharedService.chosenCourse$.subscribe(course => {
      if (course) {
        this.createChunkedQuestions();
      }
    });
  }

  private createChunkedQuestions() {
    const course = this.sharedService.getChosenCourse();
    if (course) {
      this.chunkedQuestions = chunkArray(this.allQuestions, course.pageSize ?? 20);
    }
  }

  nextPage(): void {
    if (this.currentPage < this.chunkedQuestions.length - 1) {
      this.currentPage++;
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.currentPage--;
    }
  }
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft') {
      this.previousPage();
    } else if (event.key === 'ArrowRight') {
      this.nextPage();
    }
  }
}
