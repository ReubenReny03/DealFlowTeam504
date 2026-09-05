import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PriceListDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorStateComponent, LoadingComponent } from '../../shared/ui';

/** Tier price lists (the pricing half of screen 17's Pricelists block). */
@Component({
  selector: 'df-pricelists',
  standalone: true,
  imports: [LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Price Lists</h1>
    <p class="df-muted mt-1">What each tier actually pays. Separate from the discount ceilings, which govern how much more can be given away.</p>

    @if (loading()) { <div class="mt-6"><df-loading [count]="3" label="Loading price lists" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr><th class="df-th">Tier</th><th class="df-th">Currencies</th><th class="df-th">Price Rule</th><th class="df-th text-right">Overrides</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (pl of lists(); track pl.id) {
              <tr>
                <td class="df-td font-medium text-slate-800">{{ pl.name }}</td>
                <td class="df-td text-slate-600">{{ pl.currencies.join(', ') }}</td>
                <td class="df-td text-slate-600">{{ rule(pl) }}</td>
                <td class="df-td text-right font-mono text-slate-500">{{ pl.entries.length }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-400">Editing a price rule is Agent A, task A-10 in docs/AGENT_A.md.</p>
    }
  `,
})
export class PriceListsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lists = signal<PriceListDto[]>([]);

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.lists.set(await firstValueFrom(this.api.get<PriceListDto[]>('/pricelists'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load price lists.'); }
    finally { this.loading.set(false); }
  }
  rule(pl: PriceListDto): string {
    switch (pl.ruleType) {
      case 'PERCENT_OFF_BASE': return `price minus ${pl.ruleValue} percent base`;
      case 'FIXED_PRICE': return 'fixed price';
      default: return 'price, no adjustment';
    }
  }
}
