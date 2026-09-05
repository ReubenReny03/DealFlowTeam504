import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { SubscriptionPlanDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorStateComponent, LoadingComponent, MoneyPipe, StatusChipComponent } from '../../shared/ui';

/** Recurring plan setup, including the proration and cancellation rules. */
@Component({
  selector: 'df-plans',
  standalone: true,
  imports: [LoadingComponent, ErrorStateComponent, MoneyPipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Subscription Plans</h1>
    <p class="df-muted mt-1">Each plan carries its own proration and cancellation rule, which is what billing applies on a mid-cycle change.</p>

    @if (loading()) { <div class="mt-6"><df-loading [count]="3" label="Loading plans" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr><th class="df-th">Plan</th><th class="df-th">Cycle</th><th class="df-th text-right">Amount</th><th class="df-th">Proration</th><th class="df-th">Cancellation</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (p of plans(); track p.id) {
              <tr>
                <td class="df-td font-medium text-slate-800">{{ p.name }}</td>
                <td class="df-td"><df-status-chip kind="cycle" [value]="p.cycle" /></td>
                <td class="df-td text-right font-semibold">{{ p.amount | money }}</td>
                <td class="df-td text-slate-600">{{ p.prorationRule }}</td>
                <td class="df-td text-slate-600">{{ p.cancellationRule }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-400">Creating a plan is Agent A, task A-12 in docs/AGENT_A.md.</p>
    }
  `,
})
export class PlansPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly plans = signal<SubscriptionPlanDto[]>([]);

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.plans.set(await firstValueFrom(this.api.get<SubscriptionPlanDto[]>('/subscription-plans'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load plans.'); }
    finally { this.loading.set(false); }
  }
}
