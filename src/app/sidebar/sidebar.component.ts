import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SidebarMode } from '../layout/layout.component';
import { Router, ActivatedRoute } from '@angular/router';
import { SharedService } from '../shared.service';
import { DataHandlerService } from '../data-handler.service';
import { ICourse } from '../models/course.model';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  @Input() mode: SidebarMode = 'expanded';
  @Output() toggleMode = new EventEmitter<SidebarMode>();
  @Output() navigate = new EventEmitter<void>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sharedService: SharedService,
    public dataHandler: DataHandlerService,
    public authService: AuthService
  ) { }

  ngOnInit(): void {
    // Subscribe to the shared course list
    this.dataHandler.courses$.subscribe(); // Ensure subscription is active if needed, but we rely on dataHandler.courses array which is updated?
    // Actually, we should bind to dataHandler.courses directly or use the subject if we want to be reactive.
    // The previous code mapped courses in the component. dataHandler.refreshCourses() does mapping now.

    // Trigger initial load only if authenticated
    if (this.authService.isAuthenticated()) {
      this.dataHandler.refreshCourses();
    }
  }

  setCourse(courseId: string) {
    const course = this.dataHandler.courses.find(item => item.id === courseId);
    if (!course) {
      console.error(`Course with id ${courseId} not found`);
      return;
    }

    this.router.navigate(['/book'], {
      queryParams: {
        course: courseId,
        page: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.sharedService.setChosenCourse(course);
    this.navigate.emit();
  }

  onNavigate() {
    this.navigate.emit();
  }

  get sortedCourses() {
    return this.dataHandler.courses.slice().sort((a, b) => a.order - b.order);
  }

  /** Toggle between modes */
  onToggleClick() {
    const next: SidebarMode = this.mode === 'expanded' ? 'collapsed' : 'expanded';
    this.toggleMode.emit(next);
  }
}
