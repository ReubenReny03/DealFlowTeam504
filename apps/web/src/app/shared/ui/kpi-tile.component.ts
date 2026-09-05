import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** The dashboard tiles on screens 2, 14, 15 and 16. */
@Component({
  selector: 'df-kpi-tile',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link()) {
      <a [routerLink]="link()" class="df-card block p-5 transition hover:border-brand-300 hover:shadow-md">
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <div class="df-card p-5"><ng-container *ngTemplateOutlet="body" /></div>
    }

    <ng-template #body>
      <p class="text-xs font-medium uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-2 text-3xl font-semibold tracking-tight" [class]="toneClass()">{{ value() }}</p>
      @if (caption()) { <p class="mt-1 text-sm text-slate-500">{{ caption() }}</p> }
    </ng-template>
  `,
})
export class KpiTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly caption = input<string | null>(null);
  readonly link = input<string | null>(null);
  readonly tone = input<'neutral' | 'warn' | 'danger' | 'good'>('neutral');

  toneClass(): string {
    switch (this.tone()) {
      case 'warn': return 'text-amber-600';
      case 'danger': return 'text-rose-600';
      case 'good': return 'text-emerald-600';
      default: return 'text-slate-900';
    }
  }
}
