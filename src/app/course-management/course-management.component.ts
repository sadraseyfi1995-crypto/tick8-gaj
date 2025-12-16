import { Component, OnInit } from '@angular/core';
import { DataHandlerService } from '../data-handler.service';
import { MessageService } from 'primeng/api';

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

  // AI Generation State
  aiPrompt: string = '';
  isGenerating: boolean = false;

  constructor(private dataHandler: DataHandlerService, private messageService: MessageService) { }

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

  generateFromAI() {
    if (!this.aiPrompt.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter a prompt' });
      return;
    }

    this.isGenerating = true;
    this.dataHandler.generateVocab(this.aiPrompt).subscribe({
      next: (vocabList) => {
        this.newCourse.content = JSON.stringify(vocabList, null, 2);
        this.messageService.add({ severity: 'success', summary: 'AI Success', detail: 'Vocabulary generated from your prompt' });
        this.isGenerating = false;

        // Auto-fill name if empty
        if (!this.newCourse.name) {
          this.newCourse.name = 'AI Generated Course';
        }
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'AI Error', detail: 'Failed to generate content' });
        this.isGenerating = false;
      }
    });
  }

  aiAppendPrompt: string = '';

  generateAppendFromAI(course: any) {
    if (!this.aiAppendPrompt.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Warning', detail: 'Please enter a prompt' });
      return;
    }

    this.isGenerating = true;
    this.dataHandler.generateVocab(this.aiAppendPrompt).subscribe({
      next: (vocabList) => {
        // If there is existing content in the text area, we might want to append to it or replace it.
        // For simplicity, let's just set it or separate by a comma if it's invalid JSON,
        // but since we expect a JSON array, replacing it is safer, OR we can try to merge if the user knows what they are doing.
        // Actually, the user asked for "append", so generating a list to BE appended is what's needed.
        // We just put it in the textarea.
        this.appendContent[course.id] = JSON.stringify(vocabList, null, 2);

        this.messageService.add({ severity: 'success', summary: 'AI Success', detail: 'Vocabulary generated for append' });
        this.isGenerating = false;
      },
      error: (err) => {
        console.error(err);
        this.messageService.add({ severity: 'error', summary: 'AI Error', detail: 'Failed to generate content' });
        this.isGenerating = false;
      }
    });
  }

  createCourse() {
    try {
      const content = JSON.parse(this.newCourse.content);
      if (!Array.isArray(content)) {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Content must be a JSON array' });
        return;
      }

      this.dataHandler.createCourse(this.newCourse, content).subscribe(() => {
        this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course created successfully' });
        this.newCourse = { name: '', pageSize: 15, content: '' };
        this.loadCourses();
      });
    } catch (e) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Invalid JSON content' });
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
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Content must be a JSON array' });
        return;
      }

      this.dataHandler.appendToCourse(course.id, content).subscribe((res) => {
        this.messageService.add({ severity: 'success', summary: 'Success', detail: `Successfully appended ${res.added} items` });
        this.appendContent[course.id] = '';
        this.expandedCourseId = null;
      });
    } catch (e) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Invalid JSON content' });
    }
  }

  updateCourse(course: any) {
    const updates = {
      name: course.name,
      order: course.order,
      pageSize: course.pageSize
    };
    this.dataHandler.updateCourse(course.id, updates).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Course updated successfully' });
      this.loadCourses();
    });
  }

  deleteCourse(course: any) {
    if (confirm(`Are you sure you want to delete course "${course.name}"? This cannot be undone.`)) {
      this.dataHandler.deleteCourse(course.id).subscribe(() => {
        this.loadCourses();
      });
    }
  }
}
