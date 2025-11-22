import { Directive, ElementRef, Input, NgZone } from '@angular/core';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { fromEvent, map, switchMap, takeUntil, timer } from 'rxjs';

@UntilDestroy()
@Directive({
  selector: '[copy]'
})
export class CopyDirective {
  @Input() copy: string = '';

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
  ) {
  }

  ngOnInit() {
    this.zone.runOutsideAngular(() => {
      const holdDuration = 500; // milliseconds - adjust as needed

      fromEvent(this.host.nativeElement, 'mousedown').pipe(
        switchMap((mouseDownEvent) => {
          // Create a timer that emits when the hold duration is completed
          return timer(holdDuration).pipe(
            // If mouseup happens before the timer completes, cancel the operation
            takeUntil(fromEvent(this.host.nativeElement, 'mouseup')),
            // Map to the original mousedown event when hold is successful
            map(() => mouseDownEvent)
          );
        }),
        // Only proceed if the hold was successful (timer completed before mouseup)
        switchMap(() => navigator.clipboard.writeText(this.copy)),
        untilDestroyed(this)
      ).subscribe(() => console.log('copied!'))
    })
  }
}