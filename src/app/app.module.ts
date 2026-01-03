import { NgModule, ErrorHandler } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { GlobalErrorHandler } from './global-error-handler';

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
import { ErrorInterceptor } from './error.interceptor';
import { AuthGuard } from './auth/auth.guard';
import { WelcomeComponent } from './welcome/welcome.component';
import { SnapshotManagementComponent } from './snapshot-management/snapshot-management.component';
import { SignupComponent } from './signup/signup.component';
import { ForgotPasswordComponent } from './forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './reset-password/reset-password.component';
import { LogsViewerComponent } from './logs-viewer/logs-viewer.component';

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
    SnapshotManagementComponent,
    SignupComponent,
    ForgotPasswordComponent,
    ResetPasswordComponent,
    LogsViewerComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    HttpClientModule,
    FormsModule,
    ToastModule,
    RouterModule.forRoot([
      { path: '', component: WelcomeComponent },
      { path: 'book', component: BookComponent, canActivate: [AuthGuard] },
      { path: 'login', component: LoginComponent },
      { path: 'signup', component: SignupComponent },
      { path: 'forgot-password', component: ForgotPasswordComponent },
      { path: 'reset-password', component: ResetPasswordComponent },
      { path: 'manage-courses', component: CourseManagementComponent, canActivate: [AuthGuard] },
      { path: 'snapshots', component: SnapshotManagementComponent, canActivate: [AuthGuard] },
      { path: 'logs', component: LogsViewerComponent, canActivate: [AuthGuard] }
    ]),
  ],
  providers: [
    MessageService,
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
