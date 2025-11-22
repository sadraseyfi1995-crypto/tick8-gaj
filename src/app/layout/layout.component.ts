import { Component } from '@angular/core';

export type SidebarMode = 'collapsed' | 'expanded';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  sidebarMode: SidebarMode = 'expanded';

  onSidebarToggle(newMode: SidebarMode) {
    this.sidebarMode = newMode;
  }
}
