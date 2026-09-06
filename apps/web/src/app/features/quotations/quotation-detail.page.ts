import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CATEGORY_LABEL, formatMoney, STAGE_LABEL,
  type ProductDto, type ReissuePortalLinkResponse,
} from '@dealflow/shared';
import { QuotationBuilderStore } from '../../core/state/quotation-builder.store';
import { ToastStore } from '../../core/state/toast.store';
import { liveRefresh, watchQuotation } from '../../core/realtime/live-refresh';
import { SocketEvent } from '@dealflow/shared';
import {
  ErrorStateComponent,
  LoadingComponent,
  LongDatePipe,
  ModalComponent,
  MoneyPipe,
  SearchSelectComponent,
  StatusChipComponent,
  type SearchSelectPage,
} from '../../shared/ui';

/**
 * SCREEN 4 — the Quotation Builder. The most-watched screen in the demo.
 *
 * Every number on this page comes from `QuotationBuilderStore`'s computed
 * signals, which recompute synchronously through the shared pure functions.
 * Change a discount and the line status, the margin indicator and the blended
 * risk preview all move in the same frame — no request, no spinner.
 */
@Component({
  selector: 'df-quotation-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MoneyPipe,
    LongDatePipe,
    StatusChipComponent,
    LoadingComponent,
    ErrorStateComponent,
    ModalComponent,
    SearchSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="6" label="Loading quotation" />
    } @else if (store.error()) {
      <df-error-state [message]="store.error()!" (retry)="reload()" />
    } @else {
      @if (store.quotation(); as q) {
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <a routerLink="/app/quotations" class="text-sm text-slate-500 hover:text-slate-800"
              >← All quotations</a
            >
            <h1 class="df-h1 mt-1">{{ q.number }} · {{ q.customerName }}</h1>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <df-status-chip kind="stage" [value]="q.stage" />
              <df-status-chip kind="tier" [value]="q.tier" />
              <span class="df-muted">Price list: {{ q.tier }}</span>
            </div>
          </div>
          @if (store.editable()) {
            <div class="flex gap-2">
              <button
                type="button"
                class="df-btn-ghost"
                [disabled]="!store.isDirty() || store.saving()"
                (click)="store.reset()"
              >
                Discard changes
              </button>
              <button
                type="button"
                class="df-btn-ghost"
                [disabled]="store.saving()"
                (click)="saveDraft()"
              >
                {{ store.saving() ? 'Saving…' : 'Save Draft' }}
              </button>
              <button
                type="button"
                class="df-btn-primary"
                [disabled]="store.saving() || !store.pricedLines().length"
                (click)="submit()"
              >
                {{ store.saving() ? 'Submitting…' : 'Submit for Approval' }}
              </button>
            </div>
          } @else {
            <div class="flex flex-col items-end gap-2">
              <p class="rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                This quotation is {{ stageLabel(q.stage) }} and read-only. Line edits only apply to
                a draft.
              </p>
              @if (canReissue(q.stage)) {
                <button
                  type="button"
                  class="df-btn-ghost !py-1.5 text-xs"
                  [disabled]="reissuing()"
                  (click)="reissueLink()"
                >
                  {{ reissuing() ? 'Generating…' : 'Reissue customer link' }}
                </button>
              }
            </div>
          }
        </div>

        <div class="mt-6 grid gap-6 xl:grid-cols-3">
          <!-- lines -->
          <section class="xl:col-span-2">
            <div class="df-card df-scroll-x">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="df-th">Product</th>
                    <th class="df-th text-right" style="width:6rem">Qty</th>
                    <th class="df-th text-right" style="width:8rem">Price</th>
                    <th class="df-th text-right" style="width:7rem">Discount</th>
                    <th class="df-th text-right" style="width:6rem">Limit</th>
                    <th class="df-th" style="width:9rem">Status</th>
                    <th class="df-th text-right" style="width:9rem">Total</th>
                    <th class="df-th" style="width:3rem"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (line of store.pricedLines(); track line.id) {
                    <tr [class]="line.discountStatus === 'OVER' ? 'bg-rose-50' : ''">
                      <td class="df-td">
                        <p class="font-medium text-slate-800">{{ line.productName }}</p>
                        <p class="text-xs text-slate-400">
                          {{ categoryLabel(line.category) }}
                          @if (line.addedFromUpsell) {
                            <span
                              class="ml-1 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700"
                              >from upsell</span
                            >
                          }
                        </p>
                      </td>
                      <td class="df-td text-right">
                        @if (store.editable()) {
                          <input
                            class="df-input !w-20 text-right"
                            type="number"
                            min="1"
                            [ngModel]="line.qty"
                            (ngModelChange)="store.setQty(line.id, +$event)"
                            [attr.aria-label]="'Quantity for ' + line.productName"
                          />
                        } @else {
                          {{ line.qty }}
                        }
                      </td>
                      <td class="df-td text-right font-mono">{{ line.unitPrice | money }}</td>
                      <td class="df-td text-right">
                        @if (store.editable()) {
                          <div class="flex items-center justify-end gap-1">
                            <input
                              class="df-input !w-16 text-right"
                              type="number"
                              min="0"
                              max="100"
                              [ngModel]="line.discountPct"
                              (ngModelChange)="store.setDiscount(line.id, +$event)"
                              [attr.aria-label]="'Discount for ' + line.productName"
                            />
                            <span class="text-xs text-slate-400">%</span>
                          </div>
                        } @else {
                          {{ line.discountPct }}%
                        }
                      </td>
                      <td class="df-td text-right font-mono text-slate-500">
                        {{ line.allowedDiscountPct }}%
                      </td>
                      <td class="df-td">
                        @if (line.discountStatus === 'OVER') {
                          <span class="df-chip border-rose-200 bg-rose-100 text-rose-800"
                            >OVER (+{{ line.overByPts }}pt)</span
                          >
                        } @else {
                          <span class="df-chip border-emerald-200 bg-emerald-100 text-emerald-800"
                            >OK</span
                          >
                        }
                      </td>
                      <td class="df-td text-right font-semibold">{{ line.lineTotal | money }}</td>
                      <td class="df-td text-right">
                        @if (store.editable()) {
                          <button
                            type="button"
                            class="text-slate-300 hover:text-rose-600"
                            [attr.aria-label]="'Remove ' + line.productName"
                            (click)="store.removeLine(line.id)"
                          >
                            ✕
                          </button>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td class="df-td py-10 text-center text-slate-400" colspan="8">
                        No lines yet. Add a product to get started.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <p class="mt-2 text-xs leading-relaxed text-slate-500">
              Each line's discount is checked against <em>its own</em> limit — the stricter of the
              customer's tier ceiling and the product category's ceiling — as soon as you enter it,
              not only when you submit.
            </p>

            <!-- add a product -->
            @if (store.editable()) {
              <div class="mt-4 flex items-end gap-2">
                <label class="flex-1">
                  <span class="df-label">Add a product</span>
                  <df-search-select
                    [fetchPage]="fetchProducts"
                    [displayWith]="productLabel"
                    placeholder="Choose a product…"
                    searchPlaceholder="Search products by name or SKU…"
                    emptyText="No products match"
                    [(ngModel)]="pickedProductId"
                  />
                </label>
                <button
                  type="button"
                  class="df-btn-ghost"
                  [disabled]="!pickedProductId"
                  (click)="addPicked()"
                >
                  Add line
                </button>
              </div>
            }
          </section>

          <!-- totals, risk, upsell -->
          <aside class="space-y-4">
            <!-- live margin indicator -->
            <div class="df-card p-5">
              <h2 class="df-h2">Live totals</h2>
              <dl class="mt-3 space-y-1.5 text-sm">
                <div class="flex justify-between">
                  <dt class="text-slate-500">Subtotal</dt>
                  <dd class="font-medium">{{ store.subtotal() | money }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-slate-500">Discount</dt>
                  <dd class="font-medium text-rose-600">−{{ store.discountTotal() | money }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-slate-500">Tax</dt>
                  <dd class="font-medium">{{ store.taxTotal() | money }}</dd>
                </div>
                <div class="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base">
                  <dt class="font-semibold text-slate-700">Total</dt>
                  <dd class="font-semibold text-slate-900">{{ store.grandTotal() | money }}</dd>
                </div>
                @if (store.recurringTotal() > 0) {
                  <div class="flex justify-between pt-1 text-xs">
                    <dt class="text-slate-400">of which recurring, per cycle</dt>
                    <dd class="text-slate-500">{{ store.recurringTotal() | money }}</dd>
                  </div>
                }
              </dl>
              <div
                class="mt-4 rounded-lg p-3"
                [class]="
                  store.marginPct() >= 20
                    ? 'bg-emerald-50'
                    : store.marginPct() >= 10
                      ? 'bg-amber-50'
                      : 'bg-rose-50'
                "
              >
                <p
                  class="text-xs font-medium uppercase tracking-wide"
                  [class]="
                    store.marginPct() >= 20
                      ? 'text-emerald-700'
                      : store.marginPct() >= 10
                        ? 'text-amber-700'
                        : 'text-rose-700'
                  "
                >
                  Margin
                </p>
                <p
                  class="mt-0.5 text-2xl font-semibold"
                  [class]="
                    store.marginPct() >= 20
                      ? 'text-emerald-800'
                      : store.marginPct() >= 10
                        ? 'text-amber-800'
                        : 'text-rose-800'
                  "
                >
                  {{ store.marginAmount() | money }}
                  <span class="text-base font-normal">({{ store.marginPct().toFixed(1) }}%)</span>
                </p>
              </div>
            </div>

            <!-- live blended risk preview -->
            <div class="df-card p-5">
              <div class="flex items-center justify-between">
                <h2 class="df-h2">Blended risk</h2>
                <df-status-chip
                  kind="risk"
                  [value]="store.risk().riskLevel"
                  [text]="store.risk().riskLevel + ' · ' + store.risk().riskScore"
                />
              </div>
              <p class="mt-2 text-sm leading-relaxed text-slate-600">{{ store.risk().summary }}</p>
              @if (store.willAutoApprove()) {
                <p class="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Submitting now would go straight to the customer — no approval needed.
                </p>
              } @else {
                <p class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Submitting now routes to {{ store.risk().requiredChain.join(', then ') }}.
                </p>
              }
            </div>

            <!-- upsell panel -->
            <div class="df-card p-5">
              <h2 class="df-h2">Upsell and cross-sell suggestions</h2>
              @if (store.suggestions().length) {
                <ul class="mt-3 space-y-2">
                  @for (s of store.suggestions(); track s.productId) {
                    <li class="rounded-lg border border-slate-200 p-3">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="truncate text-sm font-medium text-slate-800">{{ s.name }}</p>
                          <p class="text-xs text-emerald-600">
                            Margin +{{ s.marginDelta | money }}
                          </p>
                          @if (s.promoTag) {
                            <p class="text-xs text-brand-600">{{ s.promoTag }}</p>
                          }
                          <p class="mt-1 text-[11px] leading-snug text-slate-400">{{ s.reason }}</p>
                        </div>
                        @if (store.editable()) {
                          <div class="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              class="df-btn-primary !px-2 !py-1 text-xs"
                              (click)="store.addSuggestion(s)"
                            >
                              Add to Quote
                            </button>
                            <button
                              type="button"
                              class="text-xs text-slate-400 hover:text-slate-600"
                              (click)="store.dismissSuggestion(s.productId)"
                            >
                              Dismiss
                            </button>
                          </div>
                        }
                      </div>
                    </li>
                  }
                </ul>
              } @else {
                <p class="mt-3 text-sm leading-relaxed text-slate-500">
                  Nothing to suggest yet — add a line, and any product bought alongside it in past
                  deals will be ranked here.
                </p>
              }
            </div>
          </aside>
        </div>

        <!-- stale-version conflict: someone else changed this quote while it was open here -->
        <df-modal
          [open]="store.staleConflict()"
          title="This quotation changed while you were editing it"
          subtitle="Another user saved a newer version. Your unsaved edits are still on screen behind this dialog."
          (close)="dismissStale()"
        >
          <p class="text-sm leading-relaxed text-slate-600">
            Reload to pull in the latest version — this discards the changes you have made here
            since opening it. Or keep editing and copy anything you need first; your next save will
            keep asking until you reload.
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <button type="button" class="df-btn-ghost" (click)="dismissStale()">
              Keep editing
            </button>
            <button type="button" class="df-btn-primary" (click)="reloadLatest()">
              Reload latest
            </button>
          </div>
        </df-modal>

        <!-- reissued customer link -->
        <df-modal
          [open]="!!reissuedLink()"
          title="New customer link"
          subtitle="Any earlier link for this quotation has been revoked."
          (close)="reissuedLink.set(null)"
        >
          @if (reissuedLink(); as link) {
            <label class="df-label">Share this with the customer</label>
            <div class="mt-1 flex gap-2">
              <input
                class="df-input flex-1 font-mono text-xs"
                [value]="link.url"
                readonly
                (focus)="selectAll($event)"
                aria-label="Customer portal link"
              />
              <button type="button" class="df-btn-ghost shrink-0" (click)="copyLink(link.url)">
                Copy
              </button>
            </div>
            <p class="mt-3 text-xs text-slate-500">
              Expires {{ link.expiresAt | longDate }}.
              @if (link.revokedCount > 0) {
                {{ link.revokedCount }} earlier link{{
                  link.revokedCount === 1 ? '' : 's'
                }}
                revoked.
              }
            </p>
          }
        </df-modal>
      }
    }
  `,
})
export class QuotationDetailPage implements OnInit {
  protected readonly store = inject(QuotationBuilderStore);
  private readonly toast = inject(ToastStore);
  /** Bound from the route by `withComponentInputBinding()`. */
  readonly id = input<string>('');

  pickedProductId = '';
  readonly reissuing = signal(false);
  readonly reissuedLink = signal<ReissuePortalLinkResponse | null>(null);

  /**
   * Client-side search + pagination for the "Add a product" picker.
   * `store.products()` is already the full active catalogue in memory (the
   * upsell panel needs it resolvable by id too), so there's no server round
   * trip to make here — but a plain `<select>` still had to hand the browser
   * every option's DOM node at once. This filters and pages that same array
   * instead, so typing narrows it and only one page of `<li>`s ever renders.
   */
  protected readonly fetchProducts = async (q: string, page: number, pageSize: number): Promise<SearchSelectPage<ProductDto>> => {
    const term = q.trim().toLowerCase();
    const all = this.store.products();
    const matches = term
      ? all.filter((p) => p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term))
      : all;
    const start = (page - 1) * pageSize;
    return { items: matches.slice(start, start + pageSize), total: matches.length };
  };
  protected readonly productLabel = (p: ProductDto): string => `${p.name} — ${formatMoney(p.unitPrice)}`;

  constructor() {
    // Watch this one deal, then re-read it whenever the other side moves it —
    // the customer comments, counters or confirms, or an approver decides.
    watchQuotation(computed(() => this.store.quotation()?.id ?? this.id()));
    liveRefresh(
      [SocketEvent.QUOTATION_UPDATED, SocketEvent.NEGOTIATION_EVENT, SocketEvent.APPROVAL_UPDATED],
      () => this.reload(),
      {
        // The socket is a firehose of every deal this session can see; only the
        // one on screen should reload it.
        when: (e) => !e.quotationId || e.quotationId === (this.store.quotation()?.id ?? this.id()),
      },
    );
  }

  ngOnInit(): void {
    void this.store.load(this.id());
  }
  reload(): void {
    // Never overwrite work in progress. An edited-but-unsaved builder keeps its
    // lines; the save itself already detects the version conflict and offers
    // "reload the latest version", which is the honest way to resolve it.
    if (this.store.isDirty()) {
      this.store.staleConflict.set(true);
      return;
    }
    void this.store.load(this.id());
  }

  /** A customer link only makes sense once the quote has left DRAFT and is not rejected. */
  canReissue(stage: string): boolean {
    return stage !== 'DRAFT' && stage !== 'REJECTED';
  }

  dismissStale(): void {
    this.store.staleConflict.set(false);
  }

  async reloadLatest(): Promise<void> {
    await this.store.reloadFromServer();
    this.toast.info('Reloaded', 'You are now editing the latest version of this quotation.');
  }

  async reissueLink(): Promise<void> {
    const q = this.store.quotation();
    if (!q) return;
    this.reissuing.set(true);
    try {
      this.reissuedLink.set(await this.store.reissuePortalLink(q.id));
    } catch {
      /* the interceptor already toasted the reason */
    } finally {
      this.reissuing.set(false);
    }
  }

  selectAll(event: Event): void {
    (event.target as HTMLInputElement).select();
  }

  async copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.success('Copied', 'The customer link is on your clipboard.');
    } catch {
      this.toast.info(
        'Copy it manually',
        'Your browser blocked clipboard access — select the link and copy it.',
      );
    }
  }

  categoryLabel(category: string): string {
    return CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL] ?? category;
  }

  stageLabel(stage: string): string {
    return STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage;
  }

  addPicked(): void {
    const product = this.store.products().find((p) => p.id === this.pickedProductId);
    if (product) this.store.addProduct(product);
    this.pickedProductId = '';
  }

  async saveDraft(): Promise<void> {
    try {
      const ok = await this.store.save();
      if (ok)
        this.toast.success(
          'Draft saved',
          'Every total, margin and risk figure is exactly what the server now has too.',
        );
    } catch {
      /* the interceptor already toasted the reason — a stale version says "reload and try again" */
    }
  }

  /**
   * The rep never chooses what happens next — the server decides, from the
   * SAME blended risk score this screen has been showing all along.
   */
  async submit(): Promise<void> {
    try {
      const result = await this.store.submit();
      if (!result) return;
      if (result.autoApproved) {
        this.toast.success(
          'Submitted',
          'Every line was within its own limit — this quotation went straight to Approved. No approval needed.',
        );
      } else {
        this.toast.info(
          'Routed for approval',
          `Blended risk ${result.risk.riskScore} (${result.risk.riskLevel}) — this needs ${result.risk.requiredChain.join(', then ')}.`,
        );
      }
    } catch {
      /* the interceptor already toasted the reason */
    }
  }
}
