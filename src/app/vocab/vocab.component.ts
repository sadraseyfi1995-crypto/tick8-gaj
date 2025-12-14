import { Component, Input, OnInit } from '@angular/core';
import { DataHandlerService } from '../data-handler.service';

export type VboxState = 'none' | 'tick' | 'cross' | 'boost';

export interface VocabComponentModel {
  id?: number | string;
  word: string;
  answer?: string;
  states?: VboxState[];
  lastUpdated?: Date;
}

@Component({
  selector: 'app-vocab',
  templateUrl: './vocab.component.html',
  styleUrls: ['./vocab.component.scss']
})
export class VocabComponent implements OnInit {
  @Input() vocab: VocabComponentModel = { word: '' };
  boxes = 8;
  flipped = false;

  constructor(private vocabService: DataHandlerService) {
  }

  ngOnInit(): void {
    if (this.vocab.states && this.vocab.states.length === this.boxes) {
      this.vocab.states = [...this.vocab.states];
    } else {
      this.vocab.states = Array(this.boxes).fill('none') as VboxState[];
    }
  }

  /** Toggle flip state */
  toggleFlip() {
    this.flipped = !this.flipped;
  }

  /** Cycle one of the checkboxes (only when front is visible) */
  cycleBox(idx: number) {
    for (let i = 0; i < idx; i++) {
      if (this.vocab.states![i] === 'none') {
        return;
      }
    }
    const order: VboxState[] = ['none', 'tick', 'cross'];
    const cur = this.vocab.states![idx];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.vocab.states![idx] = next;
    this.vocab.lastUpdated = new Date();
    this.onStatesChanged(this.vocab.id!, this.vocab.states!)
  }

  onBoxKeydown(event: KeyboardEvent, idx: number) {
    if (event.key === ' ' || event.key === 'Enter' || event.key === 'Spacebar') {
      event.preventDefault();
      this.cycleBox(idx);
    }
  }

  //TODO should be pipe
  areSameDay(
    a: Date | string | number | null | undefined,
    b: Date | string | number | null | undefined = new Date()
  ): boolean {

    if (a == null || b == null) return false;

    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);

    // invalid date guard
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;

    return (
      da.getFullYear() === db.getFullYear() &&
      da.getMonth() === db.getMonth() &&
      da.getDate() === db.getDate()
    );
  }



  onStatesChanged(id: number | string, newStates: VboxState[]) {
    // sync to backend
    console.log(`💾 Saving changes for card ${id}:`, newStates);
    this.vocabService.updateById(id, newStates).subscribe({
      next: (response) => {
        console.log('✓ State saved successfully:', response);

        // Update local data store to prevent stale data from overwriting our changes
        const currentData = this.vocabService.data$.getValue();
        const itemIndex = currentData.findIndex(item => item.id === id);
        if (itemIndex !== -1) {
          currentData[itemIndex].states = newStates;
          currentData[itemIndex].lastUpdated = new Date();
          this.vocabService.data$.next([...currentData]);
          console.log('✓ Local data store updated');
        }
      },
      error: err => {
        console.error('✗ Save failed:', err);
        alert('Failed to save your changes! Please try again.');
      }
    });
  }

  onCardKeydown(event: KeyboardEvent) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.toggleFlip();
    }
  }

  getAriaChecked(state: VboxState): string {
    return state === 'tick' ? 'true' : state === 'none' ? 'false' : 'mixed';
  }

  getAriaLabel(index: number, state: VboxState): string {
    const stateText = state === 'none' ? 'not checked' : state === 'tick' ? 'checked' : 'checked with cross';
    return `Box ${index + 1}: ${stateText}`;
  }

  /** Copy card word to clipboard */
  copyCard(): void {
    navigator.clipboard.writeText(this.vocab.word)
      .then(() => console.log('Word copied!'))
      .catch(err => console.error('Copy failed:', err));
  }
}
