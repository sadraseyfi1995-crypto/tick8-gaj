import { Component } from '@angular/core';

export type SidebarMode = 'collapsed' | 'expanded';

import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  sidebarMode: SidebarMode = 'expanded';

  constructor(public authService: AuthService) { }

  onSidebarToggle(newMode: SidebarMode) {
    this.sidebarMode = newMode;
  }
}
