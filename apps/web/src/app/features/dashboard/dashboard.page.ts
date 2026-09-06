import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Role, type SalesDashboardDto } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/state/session.store';
import { liveRefresh } from '../../core/realtime/live-refresh';
import { SocketEvent } from '@dealflow/shared';
import {
  AgoPipe, EmptyStateComponent, ErrorStateComponent, KpiTileComponent,
  LoadingComponent, MoneyPipe, StatusChipComponent,
} from '../../shared/ui';

/** Screen 2 — Sales Dashboard / Home. */
@Component({
  selector: 'df-dashboard',
  standalone: true,
  imports: [RouterLink, KpiTileComponent, MoneyPipe, AgoPipe, StatusChipComponent, LoadingComponent, ErrorStateComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Good to see you, {{ session.user()?.name }}</h1>
        <p class="df-muted mt-1">Here is what needs you today.</p>
      </div>
      <div class="flex gap-2">
        <a routerLink="/app/quotations" class="df-btn-primary">+ New Quotation</a>
        @if (canApprove()) { <a routerLink="/app/approvals" class="df-btn-ghost">View Approvals</a> }
      </div>
    </div>

    @if (loading()) {
      <div class="mt-6"><df-loading [count]="3" label="Loading your dashboard" /></div>
    } @else if (error()) {
      <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div>
    } @else {
      @if (data(); as d) {
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <df-kpi-tile label="Pending Approvals" [value]="d.pendingApprovals"
          [caption]="d.pendingApprovals === 1 ? '1 quotation waiting' : d.pendingApprovals + ' quotations waiting'"
          link="/app/approvals" [tone]="d.pendingApprovals > 0 ? 'warn' : 'neutral'" />
        <df-kpi-tile label="Open Quotations" [value]="d.openQuotations"
          [caption]="d.openQuotations + ' active deals'" link="/app/quotations" />
        <df-kpi-tile label="At-Risk Deals" [value]="d.atRiskDeals"
          [caption]="d.atRiskDeals + ' flagged by Deal Health'" link="/app/deal-health"
          [tone]="d.atRiskDeals > 0 ? 'danger' : 'good'" />
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2">
          <h2 class="df-h2 mb-3">Your quotations</h2>
          @if (d.myQuotations.length) {
            <ul class="space-y-2">
              @for (q of d.myQuotations; track q.id) {
                <li>
                  <a [routerLink]="['/app/quotations', q.id]" class="df-card flex items-center justify-between gap-4 p-4 transition hover:border-brand-300">
                    <div class="min-w-0">
                      <p class="truncate font-medium text-slate-800">{{ q.customerName }}</p>
                      <p class="font-mono text-xs text-slate-400">{{ q.number }} · {{ q.lastActivityAt | ago }}</p>
                    </div>
                    <div class="flex shrink-0 items-center gap-3">
                      @if (q.riskScore > 0) { <df-status-chip kind="risk" [value]="q.riskLevel" [text]="'Risk ' + q.riskScore" /> }
                      <df-status-chip kind="stage" [value]="q.stage" />
                      <span class="w-28 text-right font-semibold text-slate-900">{{ q.grandTotal | money: q.currency }}</span>
                    </div>
                  </a>
                </li>
              }
            </ul>
          } @else {
            <df-empty-state title="No quotations yet"
              body="Quotations you create will appear here, grouped by stage. Start one to see live pricing, margin and risk as you build."
              cta="+ New Quotation" (action)="newQuotation()" />
          }
        </section>

        <section>
          <h2 class="df-h2 mb-3">Recent activity</h2>
          <div class="df-card divide-y divide-slate-100">
            @for (item of d.recentActivity; track item.id) {
              <div class="p-3.5">
                <p class="text-sm font-medium text-slate-800">{{ item.title }}</p>
                <p class="mt-0.5 text-sm leading-snug text-slate-500">{{ item.detail }}</p>
                <p class="mt-1 text-[11px] text-slate-400">
                  {{ item.actorName }}@if (item.entityLabel) { · {{ item.entityLabel }} } · {{ item.at | ago }}
                </p>
              </div>
            } @empty {
              <p class="p-6 text-center text-sm text-slate-400">Nothing has happened yet.</p>
            }
          </div>
        </section>
      </div>
      }
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<SalesDashboardDto | null>(null);
  protected readonly canApprove = computed(() =>
    ([Role.SALES_MANAGER, Role.FINANCE, Role.ADMIN] as Role[]).includes(this.session.role() as Role),
  );

  constructor() {
    // The landing screen is the one most likely to be left open on a second
    // monitor, so it is the one that most needs to stop being a snapshot.
    liveRefresh(
      [SocketEvent.QUOTATION_UPDATED, SocketEvent.APPROVAL_UPDATED, SocketEvent.ORDER_UPDATED],
      () => void this.load(),
    );
  }

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await firstValueFrom(this.api.get<SalesDashboardDto>('/quotations/dashboard')));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the dashboard.');
    } finally {
      this.loading.set(false);
    }
  }

  newQuotation(): void { void this.router.navigate(['/app/quotations']); }
}
