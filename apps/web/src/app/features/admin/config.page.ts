import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerTier, EMPTY_STATES, ProductCategory } from '@dealflow/shared';
import { AdminConfigStore } from '../../core/state/feature.stores';
import { ToastStore } from '../../core/state/toast.store';
import { ErrorStateComponent, LoadingComponent } from '../../shared/ui';

/**
 * SCREEN 18 — Discount Tiers & Approval Chain Setup.
 *
 * The proof that nothing is hardcoded. Save a ceiling here and the API re-scores
 * every open quotation on the spot; the panel underneath lists exactly which
 * ones moved, and which stopped needing a human at all.
 */
@Component({
  selector: 'df-config',
  standalone: true,
  imports: [FormsModule, LoadingComponent, ErrorStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Discount Tiers & Approval Chain</h1>
    <p class="df-muted mt-1">
      Every quotation in the system is scored against these numbers. Change one and open quotations re-evaluate immediately.
    </p>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="4" label="Loading configuration" /></div>
    } @else if (store.error()) {
      <div class="mt-6"><df-error-state [message]="store.error()!" (retry)="reload()" /></div>
    } @else {
      @if (store.config(); as c) {
      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="df-card p-5">
          <h2 class="df-h2">Tier Discount Ceilings</h2>
          <p class="df-muted mt-1">The most any customer of that tier may be given, on any line.</p>
          <div class="mt-4 space-y-3">
            @for (tier of tiers; track tier) {
              <label class="flex items-center justify-between gap-4">
                <span class="text-sm font-medium text-slate-700">{{ pretty(tier) }}</span>
                <span class="flex items-center gap-1">
                  <input class="df-input !w-24 text-right" type="number" min="0" max="100" [(ngModel)]="tierCeilings[tier]" />
                  <span class="text-sm text-slate-400">%</span>
                </span>
              </label>
            }
          </div>
          @if (tierOrderIssue(); as issue) {
            <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
              ⚠ {{ issue }}
            </p>
          }
        </section>

        <section class="df-card p-5">
          <h2 class="df-h2">Category Discount Ceilings</h2>
          <p class="df-muted mt-1">Thin-margin categories get less discretion, whatever the customer's tier.</p>
          <div class="mt-4 space-y-3">
            @for (cat of categories; track cat) {
              <label class="flex items-center justify-between gap-4">
                <span class="text-sm font-medium text-slate-700">{{ pretty(cat) }}</span>
                <span class="flex items-center gap-1">
                  <input class="df-input !w-24 text-right" type="number" min="0" max="100" [(ngModel)]="categoryCeilings[cat]" />
                  <span class="text-sm text-slate-400">%</span>
                </span>
              </label>
            }
          </div>
          <p class="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            A line's real limit is the <strong>stricter</strong> of its tier ceiling and its category ceiling. A Gold customer at 15% buying
            a Service capped at 10% is allowed 10%, not 15%.
          </p>
        </section>

        <section class="df-card p-5 lg:col-span-2">
          <h2 class="df-h2">Approval chain</h2>
          <div class="df-scroll-x mt-3">
            <table class="min-w-full divide-y divide-slate-200">
              <thead class="bg-slate-50">
                <tr><th class="df-th">Situation</th><th class="df-th">Blended risk score</th><th class="df-th">Who must approve</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                <tr>
                  <td class="df-td">Within every line's own limit</td>
                  <td class="df-td font-mono">0</td>
                  <td class="df-td text-emerald-700">No approval needed</td>
                </tr>
                <tr>
                  <td class="df-td">Over limit, blended risk medium</td>
                  <td class="df-td font-mono">{{ thresholds.mediumMinScore }} – {{ thresholds.highMinScore - 1 }}</td>
                  <td class="df-td">Sales Manager</td>
                </tr>
                <tr>
                  <td class="df-td">Over limit, blended risk high</td>
                  <td class="df-td font-mono">{{ thresholds.highMinScore }}+</td>
                  <td class="df-td">Sales Manager, then Finance</td>
                </tr>
                <tr class="bg-rose-50/40">
                  <td class="df-td">Any single line this far over its own limit</td>
                  <td class="df-td">
                    <span class="flex items-center gap-1">
                      <input class="df-input !w-20 text-right" type="number" min="1" max="100" [(ngModel)]="thresholds.hardEscalationMaxSingleOver" />
                      <span class="text-sm text-slate-400">pts</span>
                    </span>
                  </td>
                  <td class="df-td">Sales Manager, then Finance — regardless of the score</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="df-label">Medium band starts at</span>
              <input class="df-input" type="number" min="1" [(ngModel)]="thresholds.mediumMinScore" />
            </label>
            <label class="block">
              <span class="df-label">High band starts at</span>
              <input class="df-input" type="number" min="1" [(ngModel)]="thresholds.highMinScore" />
            </label>
          </div>

          <p class="mt-4 text-xs leading-relaxed text-slate-500">
            When a quote mixes categories with different ceilings, the system computes a blended risk score and routes to the highest
            required level. All approvals, rejections and edits are logged with user, timestamp and reason.
          </p>
        </section>

        <section class="df-card p-5 lg:col-span-2">
          <label class="block">
            <span class="df-label">Reason for this change (required)</span>
            <input class="df-input" [(ngModel)]="reason" placeholder="e.g. Q4 pricing policy — Services discretion raised to 20%" />
          </label>
          <div class="mt-4 flex items-center gap-3">
            <button type="button" class="df-btn-primary" [disabled]="store.saving() || !reason.trim() || !!tierOrderIssue()" (click)="save()">
              {{ store.saving() ? 'Saving…' : 'Save configuration' }}
            </button>
            <span class="text-xs text-slate-400">
              @if (tierOrderIssue()) { Fix the tier ordering above before saving. }
              @else { Saving re-evaluates every open quotation immediately. }
            </span>
          </div>
        </section>

        @if (store.lastImpact().length) {
          <section class="df-card border-brand-200 bg-brand-50/50 p-5 lg:col-span-2">
            <h2 class="df-h2">What that change did</h2>
            <p class="df-muted mt-1">{{ store.lastImpact().length }} open quotation(s) were re-scored on the spot.</p>
            <div class="df-scroll-x mt-3">
              <table class="min-w-full divide-y divide-slate-200">
                <thead><tr><th class="df-th">Quotation</th><th class="df-th text-right">Was</th><th class="df-th text-right">Now</th><th class="df-th">Outcome</th></tr></thead>
                <tbody class="divide-y divide-slate-100">
                  @for (row of store.lastImpact(); track row.quotationNumber) {
                    <tr>
                      <td class="df-td font-mono font-medium">{{ row.quotationNumber }}</td>
                      <td class="df-td text-right font-mono text-slate-500">{{ row.previousScore }}</td>
                      <td class="df-td text-right font-mono font-semibold">{{ row.newScore }}</td>
                      <td class="df-td">
                        @if (row.autoApproved) {
                          <span class="df-chip border-emerald-200 bg-emerald-100 text-emerald-800">No longer needs approval</span>
                        } @else {
                          <span class="text-slate-500">Still requires review</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      </div>
    } @else {
      <div class="mt-6">
        <p class="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          <strong>{{ empty.title }}</strong><br />{{ empty.body }}
        </p>
      </div>
      }
    }
  `,
})
export class ConfigPage implements OnInit {
  protected readonly store = inject(AdminConfigStore);
  private readonly toast = inject(ToastStore);

  protected readonly tiers = Object.values(CustomerTier);
  protected readonly categories = Object.values(ProductCategory);
  protected readonly empty = EMPTY_STATES['config'];
  /** Ascending order of discretion — a higher tier should never be given less room than a lower one. */
  private readonly tierOrder: CustomerTier[] = [CustomerTier.BRONZE, CustomerTier.SILVER, CustomerTier.GOLD];

  tierCeilings: Record<string, number> = {};
  categoryCeilings: Record<string, number> = {};
  thresholds = { mediumMinScore: 1, highMinScore: 30, hardEscalationMaxSingleOver: 8 };
  reason = '';

  async ngOnInit(): Promise<void> { await this.reload(); }

  async reload(): Promise<void> {
    await this.store.load();
    const c = this.store.config();
    if (!c) return;
    this.tierCeilings = { ...c.tierCeilings };
    this.categoryCeilings = { ...c.categoryCeilings };
    this.thresholds = {
      mediumMinScore: c.thresholds.mediumMinScore,
      highMinScore: c.thresholds.highMinScore,
      hardEscalationMaxSingleOver: c.thresholds.hardEscalationMaxSingleOver,
    };
  }

  pretty(value: string): string {
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  /** UI-only guard: a higher tier's ceiling dropping below a lower tier's makes the governance table read backwards. */
  tierOrderIssue(): string | null {
    for (let i = 1; i < this.tierOrder.length; i++) {
      const prev = this.tierOrder[i - 1];
      const curr = this.tierOrder[i];
      const prevCeiling = this.tierCeilings[prev] ?? 0;
      const currCeiling = this.tierCeilings[curr] ?? 0;
      if (currCeiling < prevCeiling) {
        return `${this.pretty(curr)}'s ceiling (${currCeiling}%) is lower than ${this.pretty(prev)}'s (${prevCeiling}%) — a higher tier should never have less discretion than a lower one.`;
      }
    }
    return null;
  }

  async save(): Promise<void> {
    try {
      const count = await this.store.save({
        tierCeilings: this.tierCeilings,
        categoryCeilings: this.categoryCeilings,
        thresholds: this.thresholds,
        reason: this.reason,
      });
      this.toast.success(
        'Configuration saved',
        count === 0 ? 'No open quotation changed its risk level.' : `${count} open quotation(s) were re-scored immediately.`,
      );
      this.reason = '';
    } catch { /* interceptor toasted it */ }
  }
}
