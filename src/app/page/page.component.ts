import { Component, Input } from '@angular/core';
import { VocabComponentModel } from '../vocab/vocab.component';
@Component({
  selector: 'app-page',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss']
})
export class PageComponent {
  private _vocabWords: VocabComponentModel[] | null = null;
  public get vocabWords(): VocabComponentModel[] | null {
    return this._vocabWords;
  }
  @Input()
  public set vocabWords(value: VocabComponentModel[] | null) {
    this._vocabWords = value;
  }
}
