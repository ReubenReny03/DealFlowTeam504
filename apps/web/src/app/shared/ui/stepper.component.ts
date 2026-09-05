import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface Step {
  label: string;
  /** done = behind us, active = where we are, pending = ahead, failed = it stopped here. */
  state: 'done' | 'active' | 'pending' | 'failed';
  caption?: string;
}

/**
 * The horizontal stepper on screen 6 (Submitted -> Sales Manager -> Finance ->
 * Confirmed) and screen 13 (Order Confirmed -> Shipped -> Invoiced -> Paid).
 */
@Component({
  selector: 'df-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="df-scroll-x flex items-start gap-1 py-2">
      @for (step of steps(); track step.label; let i = $index; let last = $last) {
        <li class="flex min-w-[8rem] flex-1 flex-col items-center text-center">
          <div class="flex w-full items-center">
            <span class="h-0.5 flex-1" [class]="i === 0 ? 'bg-transparent' : connectorClass(i)"></span>
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold" [class]="dotClass(step)">
              {{ step.state === 'done' ? '✓' : step.state === 'failed' ? '✕' : i + 1 }}
            </span>
            <span class="h-0.5 flex-1" [class]="last ? 'bg-transparent' : connectorClass(i + 1)"></span>
          </div>
          <p class="mt-2 text-xs font-medium" [class]="labelClass(step)">{{ step.label }}</p>
          @if (step.caption) { <p class="mt-0.5 text-[11px] leading-tight text-slate-400">{{ step.caption }}</p> }
        </li>
      }
    </ol>
  `,
})
export class StepperComponent {
  readonly steps = input.required<Step[]>();

  dotClass(step: Step): string {
    switch (step.state) {
      case 'done': return 'border-emerald-500 bg-emerald-500 text-white';
      case 'active': return 'border-brand-600 bg-brand-600 text-white ring-4 ring-brand-100';
      case 'failed': return 'border-rose-500 bg-rose-500 text-white';
      default: return 'border-slate-300 bg-white text-slate-400';
    }
  }

  labelClass(step: Step): string {
    return step.state === 'pending' ? 'text-slate-400' : 'text-slate-800';
  }

  connectorClass(index: number): string {
    const prior = this.steps()[index - 1];
    return prior && prior.state === 'done' ? 'bg-emerald-400' : 'bg-slate-200';
  }
}
