import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Skeleton rows. Used wherever a list is still loading. */
@Component({
  selector: 'df-loading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2" role="status" [attr.aria-label]="label()">
      @for (row of rows(); track row) {
        <div class="h-11 animate-pulse rounded-lg bg-slate-100"></div>
      }
      <span class="sr-only">{{ label() }}</span>
    </div>
  `,
})
export class LoadingComponent {
  readonly count = input(4);
  readonly label = input('Loading');
  rows(): number[] { return Array.from({ length: this.count() }, (_, i) => i); }
}
