import { ChangeDetectionStrategy, Component, OnChanges, OnInit, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CATEGORY_LABEL } from '@dealflow/shared';
import { ToastStore } from '../core/state/toast.store';
import { LoadingComponent, MoneyPipe, ShortDatePipe, StatusChipComponent } from '../shared/ui';
import { PortalStore } from './portal.store';

/**
 * SCREEN 11 — Customer Portal Negotiation.
 *
 * A genuinely separate surface: its own shell, its own guard, its own token, and
 * no route into the internal app. What the customer can do here is exactly three
 * things — ask about a line, counter the terms, or confirm.
 *
 * One of possibly many: the company's other quotations sit one tap away in the
 * switcher below the heading (screen 11a).
 */
@Component({
  selector: 'df-portal-quotation',
  standalone: true,
  imports: [FormsModule, RouterLink, MoneyPipe, ShortDatePipe, StatusChipComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="4" label="Loading your quotation" />
    } @else if (store.error()) {
      <div class="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h1 class="text-lg font-semibold text-amber-900">
          @switch (store.errorCode()) {
            @case ('PORTAL_TOKEN_EXPIRED') { This link has expired }
            @case ('PORTAL_TOKEN_INVALID') { This link is not valid }
            @case ('FORBIDDEN') { This quotation is not yours }
            @default { We could not open this quotation }
          }
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-amber-800">{{ store.error() }}</p>
        <p class="mt-4 text-sm text-amber-700">
          Ask your account manager to send you a fresh link, or sign in with the account they set up for you.
        </p>
      </div>
    } @else {
      @if (store.quotation(); as q) {
      @if (store.hasMultiple()) {
        <a routerLink="/portal/quotations" class="text-sm text-slate-500 hover:text-slate-800">&larr; All quotations</a>
      }
      <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-mono text-xs text-slate-400">{{ q.number }}</p>
          <h1 class="df-h1 mt-0.5">Quotation for {{ q.customerName }}</h1>
          <p class="df-muted mt-1">Valid until {{ q.validUntil | shortDate }}</p>
        </div>
        <df-status-chip kind="stage" [value]="q.stage" />
      </div>

      <!-- one company, many quotations: the others are one tap away -->
      @if (store.list().length > 1) {
        <div class="df-scroll-x mt-4 flex gap-2 pb-1">
          @for (item of store.list(); track item.id) {
            <a [routerLink]="['/portal/q', item.number]"
               class="df-chip whitespace-nowrap border transition"
               [class]="item.number === q.number
                 ? 'border-slate-900 bg-slate-900 text-white'
                 : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'">
              {{ item.number }}
            </a>
          }
        </div>
      }

      <!-- lines -->
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="df-th">Item</th><th class="df-th text-right">Qty</th>
              <th class="df-th text-right">Unit price</th><th class="df-th text-right">Your discount</th><th class="df-th text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (line of q.lines; track line.id) {
              <tr>
                <td class="df-td">
                  <p class="font-medium text-slate-800">{{ line.productName }}</p>
                  <p class="text-xs text-slate-400">{{ categoryLabel(line.category) }}</p>
                </td>
                <td class="df-td text-right font-mono">{{ line.qty }}</td>
                <td class="df-td text-right font-mono">{{ line.unitPrice | money: q.currency }}</td>
                <td class="df-td text-right font-mono text-emerald-600">{{ line.discountPct }}%</td>
                <td class="df-td text-right font-semibold">{{ line.lineTotal | money: q.currency }}</td>
              </tr>
            }
            <tr class="bg-slate-50">
              <td class="df-td font-semibold" colspan="4">Total</td>
              <td class="df-td text-right text-lg font-semibold">{{ q.totals.grandTotal | money: q.currency }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- line-level comments and counter -->
      <section class="mt-8">
        <h2 class="df-h2">Ask about a line, or propose different terms</h2>
        <div class="df-card mt-3 divide-y divide-slate-100">
          @for (line of q.lines; track line.id) {
            <div class="p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-slate-800">{{ line.productName }}</p>
                <span class="text-xs text-slate-400">currently {{ line.discountPct }}% off</span>
              </div>
              <div class="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
                <input class="df-input" [(ngModel)]="comments[line.id]"
                       [placeholder]="'e.g. Can this be 15% off instead of ' + line.discountPct + '%?'"
                       [attr.aria-label]="'Comment on ' + line.productName" />
                <div class="flex items-center gap-1">
                  <input class="df-input text-right" type="number" min="0" max="100" [(ngModel)]="counters[line.id]"
                         placeholder="—" [attr.aria-label]="'Counter discount for ' + line.productName" />
                  <span class="text-sm text-slate-400">%</span>
                </div>
              </div>
              @for (event of eventsFor(line.id); track event.id) {
                <p class="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <span class="font-medium">{{ event.authorName }}:</span> {{ event.comment }}
                  @if (event.counterDiscountPct != null) { <span class="text-slate-400"> (proposed {{ event.counterDiscountPct }}%)</span> }
                </p>
              }
            </div>
          }
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <label class="block">
            <span class="df-label">Requested delivery date</span>
            <input class="df-input" type="date" [(ngModel)]="requestedDeliveryDate" />
          </label>
          <label class="block">
            <span class="df-label">Anything else?</span>
            <input class="df-input" [(ngModel)]="note" placeholder="A note for your account manager" />
          </label>
        </div>
      </section>

      <!-- the notice that makes the loop honest -->
      <p class="mt-6 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-900">
        {{ store.negotiationNoticeText() }}
      </p>

      <div class="mt-5 flex flex-wrap gap-2">
        <button type="button" class="df-btn-primary" [disabled]="store.submitting()" (click)="submitRequest()">Submit Request</button>
        <button type="button" class="df-btn-success" [disabled]="store.submitting() || !store.canConfirm()" (click)="confirm()">Confirm Quotation</button>
      </div>
      }
    }
  `,
})
export class PortalQuotationPage implements OnInit, OnChanges {
  protected readonly store = inject(PortalStore);
  private readonly toast = inject(ToastStore);
  readonly number = input<string>('');

  comments: Record<string, string> = {};
  counters: Record<string, number | null> = {};
  requestedDeliveryDate = '';
  note = '';

  /** `undefined` = nothing opened yet; `null` = "whichever quotation the session defaults to". */
  private openedFor: string | null | undefined = undefined;

  // The switcher navigates between /portal/q/:number without leaving the page,
  // so the route parameter — not just the first render — drives what is loaded.
  ngOnInit(): void { this.open(); }
  ngOnChanges(): void { this.open(); }

  private open(): void {
    const target = this.number() || null;
    if (this.openedFor === target) return;
    this.openedFor = target;
    this.comments = {};
    this.counters = {};
    this.requestedDeliveryDate = '';
    this.note = '';
    void this.store.load(target ?? undefined);
    void this.store.loadList();
  }

  categoryLabel(c: string): string { return CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c; }

  eventsFor(lineId: string) {
    return this.store.events().filter((e) => e.lineId === lineId && e.comment);
  }

  async submitRequest(): Promise<void> {
    const lines = Object.keys({ ...this.comments, ...this.counters })
      .filter((id) => this.comments[id]?.trim() || this.counters[id] != null)
      .map((lineId) => ({
        lineId,
        comment: this.comments[lineId]?.trim() || undefined,
        counterDiscountPct: this.counters[lineId] ?? undefined,
      }));

    if (lines.length === 0 && !this.note.trim() && !this.requestedDeliveryDate) {
      this.toast.info('Nothing to send', 'Add a comment or a counter discount first.');
      return;
    }

    try {
      const result = await this.store.counter({
        lines,
        requestedDeliveryDate: this.requestedDeliveryDate ? new Date(this.requestedDeliveryDate).toISOString() : undefined,
        note: this.note.trim() || undefined,
      });
      this.comments = {};
      this.counters = {};
      this.toast.success(
        'Request sent',
        result.reEnteredApproval
          ? 'Your proposal goes beyond what your account manager can approve alone, so it has gone back for internal approval automatically.'
          : 'Your account manager can approve these terms directly.',
      );
    } catch {
      /* the interceptor already toasted the reason */
    }
  }

  async confirm(): Promise<void> {
    try {
      await this.store.confirm();
      this.toast.success('Confirmed', 'Your order is being prepared. You will get an invoice once it ships.');
    } catch {
      /* the interceptor already toasted the reason */
    }
  }
}
