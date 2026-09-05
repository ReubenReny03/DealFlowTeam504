import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  BillingCycle, CYCLE_LABEL, EMPTY_STATES, ProrationRule, money,
  type ProductDto, type SubscriptionPlanDto, type UpsertSubscriptionPlanRequest,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent, ErrorStateComponent, LoadingComponent, ModalComponent, MoneyPipe, StatusChipComponent,
} from '../../shared/ui';

/** Recurring plan setup, including the proration and cancellation rules. */
@Component({
  selector: 'df-plans',
  standalone: true,
  imports: [FormsModule, LoadingComponent, ErrorStateComponent, EmptyStateComponent, ModalComponent, MoneyPipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Subscription Plans</h1>
        <p class="df-muted mt-1">Each plan carries its own proration and cancellation rule, which is what billing applies on a mid-cycle change.</p>
      </div>
      <button type="button" class="df-btn-primary" (click)="create()">+ New Plan</button>
    </div>

    @if (loading()) { <div class="mt-6"><df-loading [count]="3" label="Loading plans" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else if (!plans().length) {
      <div class="mt-6"><df-empty-state [title]="empty.title" [body]="empty.body" [cta]="empty.cta ?? null" (action)="create()" /></div>
    }
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
      <p class="mt-3 text-xs leading-relaxed text-slate-400">
        A plan bills at the beginning of each period. Under PRORATED, a mid-cycle change credits the unused remainder and charges the new
        amount over the same days; a negative net becomes a credit note.
      </p>

      <df-modal [open]="formOpen()" title="New subscription plan" subtitle="It can only bill for a subscription product." (close)="close()">
        @if (subscriptionProducts().length) {
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="df-label">Plan name</span>
              <input class="df-input" [(ngModel)]="draft.name" placeholder="e.g. Care Plan 2yr — Annual" />
            </label>
            <label class="block sm:col-span-2">
              <span class="df-label">Product</span>
              <select class="df-input" [(ngModel)]="draft.productId">
                @for (p of subscriptionProducts(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.sku }})</option> }
              </select>
            </label>
            <label class="block">
              <span class="df-label">Cycle</span>
              <select class="df-input" [(ngModel)]="draft.cycle">
                @for (c of cycles; track c) { <option [value]="c">{{ cycleLabel[c] }}</option> }
              </select>
            </label>
            <label class="block">
              <span class="df-label">Amount per cycle (USD)</span>
              <input class="df-input" type="number" min="0" step="0.01" [(ngModel)]="draft.amount" />
            </label>
            <label class="block">
              <span class="df-label">Proration rule</span>
              <select class="df-input" [(ngModel)]="draft.prorationRule">
                @for (r of rules; track r) { <option [value]="r">{{ r }}</option> }
              </select>
            </label>
            <label class="block">
              <span class="df-label">Cancellation rule</span>
              <select class="df-input" [(ngModel)]="draft.cancellationRule">
                @for (r of rules; track r) { <option [value]="r">{{ r }}</option> }
              </select>
            </label>
          </div>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="df-btn-ghost" (click)="close()">Cancel</button>
            <button type="button" class="df-btn-primary" [disabled]="saving() || !draft.name.trim() || !draft.productId" (click)="save()">
              {{ saving() ? 'Creating…' : 'Create plan' }}
            </button>
          </div>
        } @else {
          <p class="text-sm leading-relaxed text-slate-600">
            There is no subscription product to bill for yet. Open a product on the Products screen and set <strong>Subscription</strong>
            to Yes with a recurring cycle first.
          </p>
          <div class="mt-5 flex justify-end"><button type="button" class="df-btn-ghost" (click)="close()">Close</button></div>
        }
      </df-modal>
    }
  `,
})
export class PlansPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly plans = signal<SubscriptionPlanDto[]>([]);
  protected readonly empty = EMPTY_STATES['plans'];
  protected readonly subscriptionProducts = signal<ProductDto[]>([]);

  protected readonly formOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly cycleLabel = CYCLE_LABEL;
  protected readonly cycles = Object.values(BillingCycle);
  protected readonly rules = Object.values(ProrationRule);

  draft = emptyDraft();

  ngOnInit(): void { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try {
      const [plans, products] = await Promise.all([
        firstValueFrom(this.api.get<SubscriptionPlanDto[]>('/subscription-plans')),
        firstValueFrom(this.api.get<ProductDto[]>('/products', { status: 'ACTIVE' })),
      ]);
      this.plans.set(plans ?? []);
      this.subscriptionProducts.set((products ?? []).filter((p) => p.isSubscription));
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load plans.');
    } finally {
      this.loading.set(false);
    }
  }

  create(): void {
    this.draft = emptyDraft();
    this.draft.productId = this.subscriptionProducts()[0]?.id ?? '';
    this.formOpen.set(true);
  }

  close(): void { this.formOpen.set(false); }

  async save(): Promise<void> {
    const body: UpsertSubscriptionPlanRequest = {
      name: this.draft.name.trim(),
      productId: this.draft.productId,
      cycle: this.draft.cycle,
      amount: money(Number(this.draft.amount) || 0),
      prorationRule: this.draft.prorationRule,
      cancellationRule: this.draft.cancellationRule,
    };
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.post<SubscriptionPlanDto>('/subscription-plans', body));
      this.close();
      this.toast.success('Plan created', `${saved.name} — ${CYCLE_LABEL[saved.cycle]}, invoiced at the start of each period.`);
      await this.load();
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }
}

/** Amount is a major in the form and integer cents on the wire. */
function emptyDraft() {
  return {
    name: '',
    productId: '',
    cycle: BillingCycle.MONTHLY as BillingCycle,
    amount: 0,
    prorationRule: ProrationRule.PRORATED as ProrationRule,
    cancellationRule: ProrationRule.PRORATED as ProrationRule,
  };
}
