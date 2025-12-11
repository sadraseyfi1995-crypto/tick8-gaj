import { Component, HostListener, Input } from '@angular/core';
import { VocabComponentModel } from '../vocab/vocab.component';
import { SharedService } from '../shared.service';
import { DataHandlerService } from '../data-handler.service';

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

  public set allQuestions(value: VocabComponentModel[]) {
    this._allQuestions = value;
    this.createChunkedQuestions();
  }
  chunkedQuestions: VocabComponentModel[][] = [];
  currentPage: number = 0;
  pendingPage: number | null = null;

  constructor(private sharedService: SharedService, private dataHandler: DataHandlerService) {

  }

  ngOnInit(): void {
    this.dataHandler.data$.subscribe(data => {
      this.allQuestions = data;
    });

    this.sharedService.chosenCourse$.subscribe(course => {
      if (course) {
        this.pendingPage = null; // Clear pending on course change
        this.createChunkedQuestions();
      }
    });

    this.sharedService.pageNavigation$.subscribe(page => {
      this.pendingPage = page;
      this.applyPendingPage();
    });
  }

  private createChunkedQuestions() {
    const course = this.sharedService.getChosenCourse();
    if (course) {
      this.chunkedQuestions = chunkArray(this.allQuestions, course.pageSize ?? 20);
      this.applyPendingPage();

      // Ensure currentPage is valid
      if (this.chunkedQuestions.length > 0 && this.currentPage >= this.chunkedQuestions.length) {
        this.currentPage = this.chunkedQuestions.length - 1;
      } else if (this.chunkedQuestions.length === 0) {
        this.currentPage = 0;
      }
    }
  }

  private applyPendingPage() {
    if (this.pendingPage !== null && this.pendingPage < this.chunkedQuestions.length) {
      this.currentPage = this.pendingPage;
      this.pendingPage = null;
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

  /** Copy all cards on the current page as JSON array to clipboard */
  copyAllCards(): void {
    const currentCards = this.chunkedQuestions[this.currentPage];
    if (!currentCards || currentCards.length === 0) {
      console.log('No cards to copy');
      return;
    }

    const cardsData = currentCards.map(card => ({
      word: card.word,
      answer: card.answer || '',
      states: card.states
    }));

    navigator.clipboard.writeText(JSON.stringify(cardsData, null, 2))
      .then(() => console.log('All cards copied!'))
      .catch(err => console.error('Copy failed:', err));
  }
}
