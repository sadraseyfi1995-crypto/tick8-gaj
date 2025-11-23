import { Component, OnInit } from '@angular/core';
import { DataHandlerService } from '../data-handler.service';

@Component({
  selector: 'app-course-management',
  templateUrl: './course-management.component.html',
  styleUrls: ['./course-management.component.scss']
})
export class CourseManagementComponent implements OnInit {
  courses: any[] = [];
  newCourse = {
    name: '',
    pageSize: 15,
    content: ''
  };
  appendContent: { [key: string]: string } = {};
  expandedCourseId: string | null = null;

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

  createCourse() {
    try {
      const content = JSON.parse(this.newCourse.content);
      if (!Array.isArray(content)) {
        alert('Content must be a JSON array');
        return;
      }

      this.dataHandler.createCourse(this.newCourse, content).subscribe(() => {
        alert('Course created successfully');
        this.newCourse = { name: '', pageSize: 15, content: '' };
        this.loadCourses();
      }, err => {
        alert('Failed to create course');
        console.error(err);
      });
    } catch (e) {
      alert('Invalid JSON content');
    }
  }

  toggleAppend(course: any) {
    if (this.expandedCourseId === course.id) {
      this.expandedCourseId = null;
    } else {
      this.expandedCourseId = course.id;
      if (!this.appendContent[course.id]) {
        this.appendContent[course.id] = '';
      }
    }
  }

  submitAppend(course: any) {
    try {
      const content = JSON.parse(this.appendContent[course.id]);
      if (!Array.isArray(content)) {
        alert('Content must be a JSON array');
        return;
      }

      this.dataHandler.appendToCourse(course.id, content).subscribe((res) => {
        alert(`Successfully appended ${res.added} items`);
        this.appendContent[course.id] = '';
        this.expandedCourseId = null;
      }, err => {
        alert('Failed to append content');
        console.error(err);
      });
    } catch (e) {
      alert('Invalid JSON content');
    }
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
