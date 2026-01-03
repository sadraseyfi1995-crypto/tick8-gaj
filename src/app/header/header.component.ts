import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService, User } from '../auth/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  user: User | null = null;
  isLoggedIn = false;
  private subscriptions = new Subscription();
  private readonly ADMIN_EMAIL = 'sadra.seyfi.1995@gmail.com';

  constructor(private authService: AuthService) { }

  get isAdmin(): boolean {
    return this.user?.email === this.ADMIN_EMAIL;
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.authService.user$.subscribe(user => {
        this.user = user;
      })
    );

    this.subscriptions.add(
      this.authService.isLoggedIn$.subscribe(isLoggedIn => {
        this.isLoggedIn = isLoggedIn;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  logout(): void {
    this.authService.logout();
  }
}
