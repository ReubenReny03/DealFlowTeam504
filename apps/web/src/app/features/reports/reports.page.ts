import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApprovalStatus, ProductCategory, type UserDto } from '@dealflow/shared';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import { ReportingStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import { downloadBlob } from '../../shared/download';
import {
  ErrorStateComponent,
  KpiTileComponent,
  LoadingComponent,
  MoneyPipe,
} from '../../shared/ui';
import { signal } from '@angular/core';

/** Screen 15 — Admin / Reporting Dashboard, with the PDF's four filters. */
@Component({
  selector: 'df-reports',
  standalone: true,
  imports: [FormsModule, KpiTileComponent, MoneyPipe, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Reporting</h1>
        <p class="df-muted mt-1">Every figure here is aggregated from live documents.</p>
      </div>
      <div class="flex gap-2">
        <button type="button" class="df-btn-ghost" (click)="exportAs('pdf')">Export PDF</button>
        <button type="button" class="df-btn-ghost" (click)="exportAs('xls')">Export XLS</button>
      </div>
    </div>

    <div class="df-card mt-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label class="block">
        <span class="df-label">Period</span>
        <select class="df-input" [(ngModel)]="period" (ngModelChange)="apply()">
          <option value="today">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
        </select>
      </label>
      <label class="block">
        <span class="df-label">Sales Rep</span>
        <select class="df-input" [(ngModel)]="repId" (ngModelChange)="apply()">
          <option value="">All reps</option>
          @for (r of reps(); track r.id) {
            <option [value]="r.id">{{ r.name }}</option>
          }
        </select>
      </label>
      <label class="block">
        <span class="df-label">Approval Status</span>
        <select class="df-input" [(ngModel)]="approvalStatus" (ngModelChange)="apply()">
          <option value="">Any</option>
          @for (s of approvalStatuses; track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
      </label>
      <label class="block">
        <span class="df-label">Product / Category</span>
        <select class="df-input" [(ngModel)]="category" (ngModelChange)="apply()">
          <option value="">All categories</option>
          @for (c of categories; track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
      </label>
    </div>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="4" label="Loading reports" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="apply()" /></div>
    } @else {
      @if (store.dashboard(); as d) {
        <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <df-kpi-tile
            label="Quotes Created"
            [value]="d.quotesCreated"
            caption="in the selected period"
          />
          <df-kpi-tile
            label="Avg Approval Time"
            [value]="d.avgApprovalTimeLabel"
            [tone]="
              d.avgApprovalTimeMs === 0 ? 'neutral' : d.avgApprovalWithinSla ? 'good' : 'danger'
            "
            [caption]="
              d.avgApprovalTimeMs === 0
                ? 'no decisions in this period'
                : (d.avgApprovalWithinSla ? 'within' : 'over') +
                  ' the ' +
                  d.avgApprovalSlaHours +
                  'h SLA target'
            "
          />
          <df-kpi-tile
            label="Top Upsell Product"
            [value]="d.topUpsellProduct?.name ?? '—'"
            [caption]="
              d.topUpsellProduct
                ? d.topUpsellProduct.timesAdded + ' times added from the panel'
                : 'no upsells accepted yet'
            "
          />
          <df-kpi-tile
            label="Conversion"
            [value]="d.conversionRatePct + '%'"
            caption="quotes that reached Confirmed"
            tone="good"
          />
        </div>

        <div class="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 class="df-h2 mb-3">By sales rep</h2>
            <div class="df-card df-scroll-x">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="df-th">Rep</th>
                    <th class="df-th text-right">Quotes</th>
                    <th class="df-th text-right">Value</th>
                    <th class="df-th text-right">Avg Discount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (r of d.byRep; track r.repId) {
                    <tr>
                      <td class="df-td font-medium text-slate-800">{{ r.repName }}</td>
                      <td class="df-td text-right font-mono">{{ r.quotes }}</td>
                      <td class="df-td text-right font-semibold">{{ r.value | money }}</td>
                      <td class="df-td text-right font-mono">{{ r.avgDiscountPct }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 class="df-h2 mb-3">By product</h2>
            <div class="df-card df-scroll-x">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="df-th">Product</th>
                    <th class="df-th text-right">Qty</th>
                    <th class="df-th text-right">Value</th>
                    <th class="df-th text-right">Avg Discount</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (p of d.byProduct.slice(0, 10); track p.productId) {
                    <tr>
                      <td class="df-td font-medium text-slate-800">{{ p.name }}</td>
                      <td class="df-td text-right font-mono">{{ p.qty }}</td>
                      <td class="df-td text-right font-semibold">{{ p.value | money }}</td>
                      <td class="df-td text-right font-mono">{{ p.avgDiscountPct }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }
    }
  `,
})
export class ReportsPage implements OnInit {
  protected readonly store = inject(ReportingStore);
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastStore);

  protected readonly reps = signal<UserDto[]>([]);
  protected readonly approvalStatuses = Object.values(ApprovalStatus);
  protected readonly categories = Object.values(ProductCategory);

  period = 'month';
  repId = '';
  approvalStatus = '';
  category = '';

  async ngOnInit(): Promise<void> {
    void this.apply();
    try {
      const users = await firstValueFrom(this.api.get<UserDto[]>('/users', { role: 'SALES_REP' }));
      this.reps.set(users ?? []);
    } catch {
      /* the filter simply shows "All reps" */
    }
  }

  apply(): void {
    void this.store.load({
      period: this.period,
      repId: this.repId || undefined,
      approvalStatus: this.approvalStatus || undefined,
      category: this.category || undefined,
    });
  }

  async exportAs(kind: 'pdf' | 'xls'): Promise<void> {
    const params = new URLSearchParams({
      period: this.period,
      ...(this.repId ? { repId: this.repId } : {}),
      ...(this.approvalStatus ? { approvalStatus: this.approvalStatus } : {}),
      ...(this.category ? { category: this.category } : {}),
    });
    const isPdf = kind === 'pdf';
    const path = isPdf ? 'export.pdf' : 'export.xlsx';
    const ext = isPdf ? 'pdf' : 'xlsx';
    try {
      const blob = await firstValueFrom(
        this.http.get(`${environment.apiBase}/reporting/${path}?${params}`, {
          responseType: 'blob',
        }),
      );
      downloadBlob(blob, `dealflow360-reporting.${ext}`);
    } catch {
      this.toast.error(`Could not export ${kind.toUpperCase()}`, 'Please try again.');
    }
  }
}
