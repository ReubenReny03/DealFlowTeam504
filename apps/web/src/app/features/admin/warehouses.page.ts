import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { WarehouseDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ErrorStateComponent, LoadingComponent, MoneyPipe } from '../../shared/ui';

/** Warehouse setup: the numbers the split planner actually ranks on. */
@Component({
  selector: 'df-warehouses',
  standalone: true,
  imports: [LoadingComponent, ErrorStateComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Warehouses</h1>
    <p class="df-muted mt-1">The split planner prefers the lowest shipping cost weight, and estimates cost as base + per-unit × quantity.</p>

    @if (loading()) { <div class="mt-6"><df-loading [count]="2" label="Loading warehouses" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="df-th">Warehouse</th><th class="df-th">Code</th>
              <th class="df-th text-right">Shipping weight</th><th class="df-th text-right">Base shipment</th>
              <th class="df-th text-right">Per unit</th><th class="df-th text-right">Lead time</th><th class="df-th text-right">Reorder point</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (w of warehouses(); track w.id) {
              <tr>
                <td class="df-td font-medium text-slate-800">{{ w.name }}</td>
                <td class="df-td font-mono text-slate-500">{{ w.code }}</td>
                <td class="df-td text-right font-mono">{{ w.shippingCostWeight }}</td>
                <td class="df-td text-right font-mono">{{ w.baseShipmentCost | money }}</td>
                <td class="df-td text-right font-mono">{{ w.perUnitShippingCost | money }}</td>
                <td class="df-td text-right font-mono">{{ w.replenishmentRule.leadTimeDays }} days</td>
                <td class="df-td text-right font-mono">{{ w.replenishmentRule.reorderPoint }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs text-slate-400">Creating and editing warehouses is Agent A, task A-11 in docs/AGENT_A.md.</p>
    }
  `,
})
export class WarehousesPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly warehouses = signal<WarehouseDto[]>([]);

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.warehouses.set(await firstValueFrom(this.api.get<WarehouseDto[]>('/warehouses'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load warehouses.'); }
    finally { this.loading.set(false); }
  }
}
