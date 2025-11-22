import { Component, OnInit } from '@angular/core';
import { DataHandlerService } from './data-handler.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(public vocabService: DataHandlerService) { }

  ngOnInit() {
    this.vocabService.triggerDailyDecay().subscribe({
      next: (res) => console.log('Daily maintenance:', res.message),
      error: (err) => console.error('Daily maintenance failed', err)
    });
  }
}
