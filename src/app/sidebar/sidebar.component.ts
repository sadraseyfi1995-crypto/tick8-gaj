import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SidebarMode } from '../layout/layout.component';
import { Router, ActivatedRoute } from '@angular/router';
import { SharedService } from '../shared.service';

export interface ICourse {
  id: string,
  name: string,
  order: number,
  pageSize?: number
}

import { DataHandlerService } from '../data-handler.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  @Input() mode: SidebarMode = 'expanded';
  @Output() toggleMode = new EventEmitter<SidebarMode>();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private sharedService: SharedService,
    private dataHandler: DataHandlerService
  ) {
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
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { course: courseId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.sharedService.setChosenCourse(this.dataHandler.courses.find(item => item.id === courseId)!);
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
