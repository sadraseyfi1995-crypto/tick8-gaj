import { Component, HostListener } from '@angular/core';

export type SidebarMode = 'collapsed' | 'expanded' | 'mobile-hidden';

import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent {
  sidebarMode: SidebarMode = 'expanded';
  isMobile = false;
  mobileMenuOpen = false;

  constructor(public authService: AuthService) {
    this.checkScreenSize();
  }

  @HostListener('window:resize')
  onResize() {
    this.checkScreenSize();
  }

  private checkScreenSize() {
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;

    if (this.isMobile && !wasMobile) {
      this.sidebarMode = 'mobile-hidden';
      this.mobileMenuOpen = false;
    } else if (!this.isMobile && wasMobile) {
      this.sidebarMode = 'expanded';
      this.mobileMenuOpen = false;
    }
  }

  onSidebarToggle(newMode: SidebarMode) {
    this.sidebarMode = newMode;
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    this.sidebarMode = this.mobileMenuOpen ? 'expanded' : 'mobile-hidden';
  }

  closeMobileMenu() {
    if (this.isMobile) {
      this.mobileMenuOpen = false;
      this.sidebarMode = 'mobile-hidden';
    }
  }
}
