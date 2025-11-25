import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { SidebarMode } from '../layout/layout.component';
import { Router, ActivatedRoute } from '@angular/router';
import { SharedService } from '../shared.service';
import { DataHandlerService } from '../data-handler.service';
import { ICourse } from '../models/course.model';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent implements OnInit {
  @Input() mode: SidebarMode = 'expanded';
  @Output() toggleMode = new EventEmitter<SidebarMode>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sharedService: SharedService,
    public dataHandler: DataHandlerService
  ) { }

  ngOnInit(): void {
    this.dataHandler.getCourses().subscribe(courses => {
      this.dataHandler.courses = courses.map((c: any) => ({
        id: c.filename.replace('.json', ''),
        name: c.name,
        order: 0, // Default order if not present
        pageSize: c.pageSize || 15 // Use backend pageSize or default to 15
      }));
    });
  }

  setCourse(courseId: string) {
    const course = this.dataHandler.courses.find(item => item.id === courseId);
    if (!course) {
      console.error(`Course with id ${courseId} not found`);
      return;
    }

    this.router.navigate(['/'], {
      queryParams: {
        course: courseId,
        page: null
      },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.sharedService.setChosenCourse(course);
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
