import { Component, OnInit } from '@angular/core';
import { DataHandlerService } from './data-handler.service';
import { AuthService } from './auth/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  constructor(public vocabService: DataHandlerService, private authService: AuthService) { }

  ngOnInit() {
    // Only trigger decay once per session, not on every component init
    const lastDecayTrigger = sessionStorage.getItem('lastDecayTrigger');
    const today = new Date().toISOString().split('T')[0];

    // Only run if authenticated
    if (this.authService.isAuthenticated() && lastDecayTrigger !== today) {
      this.vocabService.triggerDailyDecay().subscribe({
        next: (res) => {
          console.log('Daily maintenance:', res.message);
          if (res.run) {
            sessionStorage.setItem('lastDecayTrigger', today);
          }
        },
        error: (err) => {
          console.error('Daily maintenance failed', err);
          // If maintenance fails (likely auth/network issue), ensure we don't get stuck
          if (err.status === 401 || err.status === 0) {
            // Token might be stale or network blocked, better to re-auth
            console.warn('Auto-logout triggers due to maintenance failure');
            this.authService.logout();
          }
        }
      });
    }
  }
}
