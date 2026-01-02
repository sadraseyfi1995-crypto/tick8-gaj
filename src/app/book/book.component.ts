import { Component, HostListener } from '@angular/core';
import { VocabComponentModel } from '../vocab/vocab.component';
import { SharedService } from '../shared.service';
import { DataHandlerService } from '../data-handler.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-book',
  templateUrl: './book.component.html',
  styleUrls: ['./book.component.scss']
})
export class BookComponent {
  currentPageData: VocabComponentModel[] = [];
  currentPage: number = 0;
  totalPages: number = 0;
  totalItems: number = 0;
  pageSize: number = 15;
  isLoading: boolean = false;
  currentCourseId: string = '';

  constructor(
    private sharedService: SharedService,
    private dataHandler: DataHandlerService,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Subscribe to course changes
    this.sharedService.chosenCourse$.subscribe(course => {
      if (course) {
        this.pageSize = course.pageSize ?? 15;
        this.currentCourseId = course.id;
        this.currentPage = 0;

        // Load the last filled page instead of page 0
        this.loadLastFilledPage();
      }
    });

    // Subscribe to page navigation
    this.sharedService.pageNavigation$.subscribe(page => {
      if (page !== null && page !== this.currentPage) {
        this.loadPage(page);
      }
    });

    // Subscribe to query params for initial page load
    this.route.queryParams.subscribe(params => {
      const page = params['page'] ? parseInt(params['page']) : null;
      if (this.currentCourseId && page !== null && page !== this.currentPage) {
        this.loadPage(page);
      }
    });
  }

  private loadLastFilledPage(): void {
    if (!this.currentCourseId) {
      return;
    }

    this.isLoading = true;
    this.dataHandler.getLastFilledPage(this.currentCourseId, this.pageSize).subscribe({
      next: (response) => {
        this.loadPage(response.lastFilledPage);
      },
      error: (err) => {
        console.error('Error getting last filled page:', err);
        // Fallback to page 0 on error
        this.loadPage(0);
      }
    });
  }

  private loadPage(page: number): void {
    const courseId = this.currentCourseId || this.sharedService.getChosenCourseId();
    if (!courseId) {
      return;
    }

    this.isLoading = true;
    this.dataHandler.getPage(courseId, page, this.pageSize).subscribe({
      next: (response) => {
        this.currentPageData = response.data;
        this.currentPage = response.page;
        this.totalPages = response.totalPages;
        this.totalItems = response.total;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading page:', err);
        this.isLoading = false;
      }
    });
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1) {
      this.loadPage(this.currentPage + 1);
    }
  }

  previousPage(): void {
    if (this.currentPage > 0) {
      this.loadPage(this.currentPage - 1);
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

  /** Copy all words on the current page as JSON array to clipboard */
  copyAllCards(): void {
    if (!this.currentPageData || this.currentPageData.length === 0) {
      console.log('No cards to copy');
      return;
    }

    const words = this.currentPageData.map((card: VocabComponentModel) => card.word);

    navigator.clipboard.writeText(JSON.stringify(words, null, 2))
      .then(() => console.log('All words copied!'))
      .catch(err => console.error('Copy failed:', err));
  }
}
