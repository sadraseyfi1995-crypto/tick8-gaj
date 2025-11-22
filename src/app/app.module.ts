import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { VocabComponent } from './vocab/vocab.component';
import { BookComponent } from './book/book.component';
import { HttpClientModule } from '@angular/common/http';
import { PageComponent } from './page/page.component';
import { MainComponent } from './main/main.component';
import { HeaderComponent } from './header/header.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { LayoutComponent } from './layout/layout.component';
import { RouterModule } from '@angular/router';
import { CopyDirective } from './copy-to-clipboard-button.directive';

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
    CopyDirective
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    RouterModule.forRoot([]),
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
