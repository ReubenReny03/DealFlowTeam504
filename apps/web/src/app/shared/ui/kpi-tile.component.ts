import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';

/** The dashboard tiles on screens 2, 14, 15 and 16. */
@Component({
  selector: 'df-kpi-tile',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link()) {
      <a [routerLink]="link()" class="df-card group block p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-[0_12px_28px_-12px_rgb(15_23_42_/_0.18)]">
        <ng-container *ngTemplateOutlet="body" />
      </a>
    } @else {
      <div class="df-card p-5"><ng-container *ngTemplateOutlet="body" /></div>
    }

    <ng-template #body>
      <div class="mb-3 h-1 w-8 rounded-full transition-all duration-200 group-hover:w-12" [class]="accentClass()"></div>
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

  accentClass(): string {
    switch (this.tone()) {
      case 'warn': return 'bg-amber-400';
      case 'danger': return 'bg-rose-400';
      case 'good': return 'bg-emerald-400';
      default: return 'bg-brand-400';
    }
  }
}
