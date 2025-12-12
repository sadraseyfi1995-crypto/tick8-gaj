import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app.component';
import { VocabComponent } from './vocab/vocab.component';
import { BookComponent } from './book/book.component';
import { PageComponent } from './page/page.component';
import { MainComponent } from './main/main.component';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { LayoutComponent } from './layout/layout.component';
import { RouterModule } from '@angular/router';
import { CourseManagementComponent } from './course-management/course-management.component';
import { LoginComponent } from './login/login.component';
import { AuthInterceptor } from './auth/auth.interceptor';
import { AuthGuard } from './auth/auth.guard';
import { WelcomeComponent } from './welcome/welcome.component';
import { SnapshotManagementComponent } from './snapshot-management/snapshot-management.component';

@NgModule({
  declarations: [
    AppComponent,
    VocabComponent,
    PageComponent,
    BookComponent,
    MainComponent,
    HeaderComponent,
    SidebarComponent,
    LayoutComponent,
    CourseManagementComponent,
    LoginComponent,
    WelcomeComponent,
    SnapshotManagementComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    RouterModule.forRoot([
      { path: '', component: WelcomeComponent },
      { path: 'book', component: BookComponent, canActivate: [AuthGuard] },
      { path: 'login', component: LoginComponent },
      { path: 'manage-courses', component: CourseManagementComponent, canActivate: [AuthGuard] },
      { path: 'snapshots', component: SnapshotManagementComponent, canActivate: [AuthGuard] }
    ]),
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
