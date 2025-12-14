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
    // Only trigger decay once per session, not on every component init
    const lastDecayTrigger = sessionStorage.getItem('lastDecayTrigger');
    const today = new Date().toISOString().split('T')[0];

    if (lastDecayTrigger !== today) {
      this.vocabService.triggerDailyDecay().subscribe({
        next: (res) => {
          console.log('Daily maintenance:', res.message);
          if (res.run) {
            sessionStorage.setItem('lastDecayTrigger', today);
          }
        },
        error: (err) => console.error('Daily maintenance failed', err)
      });
    }
  }
}
