import { Component, OnInit } from '@angular/core';
import { DataHandlerService } from '../data-handler.service';

@Component({
  selector: 'app-course-management',
  templateUrl: './course-management.component.html',
  styleUrls: ['./course-management.component.scss']
})
export class CourseManagementComponent implements OnInit {
  courses: any[] = [];

  constructor(private dataHandler: DataHandlerService) { }

  ngOnInit(): void {
    this.loadCourses();
  }

  loadCourses() {
    this.dataHandler.getCourses().subscribe(courses => {
      this.courses = courses.map(c => ({
        ...c,
        id: c.filename.replace('.json', '') // Ensure ID is available
      }));
    });
  }

  updateCourse(course: any) {
    const updates = {
      name: course.name,
      order: course.order,
      pageSize: course.pageSize
    };
    this.dataHandler.updateCourse(course.id, updates).subscribe(() => {
      alert('Course updated successfully');
      this.loadCourses(); // Refresh
    }, err => {
      alert('Failed to update course');
      console.error(err);
    });
  }

  deleteCourse(course: any) {
    if (confirm(`Are you sure you want to delete course "${course.name}"? This cannot be undone.`)) {
      this.dataHandler.deleteCourse(course.id).subscribe(() => {
        this.loadCourses();
      }, err => {
        alert('Failed to delete course');
        console.error(err);
      });
    }
  }
}
