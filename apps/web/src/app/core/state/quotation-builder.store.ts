import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  calculateBlendedRisk,
  computeLinePricing,
  computeMargin,
  computeQuoteTotals,
  CustomerTier,
  isAutoApproved,
  QuoteStage,
  type ApprovalChainConfigDto,
  type LinePricingInput,
  type PricedLine,
  type ProductDto,
  type QuotationDto,
  type QuotationLineInput,
  type ReissuePortalLinkResponse,
  type RiskConfig,
  type SubmitQuotationResponse,
  type UpdateQuotationRequest,
  type UpsellSuggestionDto,
} from '@dealflow/shared';
import { ApiService } from '../api/api.service';

/**
 * SCREEN 4's BRAIN.
 *
 * Every total, the margin indicator, the per-line OK / OVER (+Npt) status and
 * the blended risk preview are `computed()` signals recalculated SYNCHRONOUSLY
 * on every quantity, discount or upsell change — no server round-trip, so the
 * numbers move the instant the rep tabs out of a field.
 *
 * They are computed by the SAME pure functions the API uses on save
 * (`computeLinePricing`, `computeQuoteTotals`, `calculateBlendedRisk` from
 * @dealflow/shared), which is why the optimistic preview can never disagree
 * with what the server ends up storing.
 */
@Injectable({ providedIn: 'root' })
export class QuotationBuilderStore {
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly quotation = signal<QuotationDto | null>(null);
  readonly config = signal<ApprovalChainConfigDto | null>(null);
  readonly products = signal<ProductDto[]>([]);
  readonly suggestions = signal<UpsellSuggestionDto[]>([]);

  /** The working copy. Edits land here first; the server sees them on save. */
  readonly draftLines = signal<LinePricingInput[]>([]);
  readonly tier = signal<CustomerTier>(CustomerTier.GOLD);

  /** Governance, in the shape the pure functions want. */
  readonly riskConfig = computed<RiskConfig>(() => {
    const cfg = this.config();
    return {
      tierCeilings: cfg?.tierCeilings ?? { BRONZE: 5, SILVER: 10, GOLD: 15 },
      categoryCeilings: cfg?.categoryCeilings ?? { HARDWARE: 15, SERVICES: 10, SUBSCRIPTION: 5 },
      thresholds: cfg?.thresholds,
      chains: cfg?.chains,
    };
  });

  /* ---- everything below recomputes synchronously on every mutation ---- */

  readonly pricedLines = computed<PricedLine[]>(() =>
    this.draftLines().map((line) => computeLinePricing(line, this.tier(), this.riskConfig())),
  );

  readonly totals = computed(() => computeQuoteTotals(this.pricedLines()));
  readonly subtotal = computed(() => this.totals().subtotal);
  readonly discountTotal = computed(() => this.totals().discountTotal);
  readonly taxTotal = computed(() => this.totals().taxTotal);
  readonly grandTotal = computed(() => this.totals().grandTotal);
  readonly oneTimeTotal = computed(() => this.totals().oneTimeTotal);
  readonly recurringTotal = computed(() => this.totals().recurringTotal);

  readonly margin = computed(() => computeMargin(this.pricedLines()));
  readonly marginAmount = computed(() => this.margin().marginAmount);
  readonly marginPct = computed(() => this.margin().marginPct);

  /** The live blended-risk preview. This is what makes "OVER (+8pt)" appear instantly. */
  readonly risk = computed(() =>
    calculateBlendedRisk(
      this.pricedLines().map((l) => ({
        id: l.id,
        productName: l.productName,
        category: l.category,
        qty: l.qty,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        allowedDiscountPct: l.allowedDiscountPct,
      })),
      this.tier(),
      this.riskConfig(),
    ),
  );

  readonly willAutoApprove = computed(() => isAutoApproved(this.risk()));
  readonly overLines = computed(() =>
    this.pricedLines().filter((l) => l.discountStatus === 'OVER'),
  );
  readonly isDirty = signal(false);

  /**
   * Set when a save/submit came back `409 STALE_VERSION` — someone else changed
   * this quotation while it was open here. Screen 4 shows a "reload the latest
   * version" dialog; the local edits stay on screen behind it until the rep
   * chooses. Cleared by `reloadFromServer()` or a successful save.
   */
  readonly staleConflict = signal(false);

  /** Only a DRAFT quotation accepts edits — the API enforces this too. */
  readonly editable = computed(
    () => (this.quotation()?.stage ?? QuoteStage.DRAFT) === QuoteStage.DRAFT,
  );

  /* ------------------------------------------------------------ loading */

  async load(quotationId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [quotation, config, products] = await Promise.all([
        firstValueFrom(this.api.get<QuotationDto>(`/quotations/${quotationId}`)),
        firstValueFrom(this.api.get<ApprovalChainConfigDto>('/config')),
        firstValueFrom(
          this.api.get<ProductDto[]>('/products', { status: 'ACTIVE', pageSize: 200 }),
        ),
      ]);
      this.quotation.set(quotation);
      this.config.set(config);
      this.products.set(products ?? []);
      this.tier.set(quotation.tier);
      this.draftLines.set(quotation.lines.map(toInput));
      this.isDirty.set(false);
      void this.loadSuggestions(quotationId);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load this quotation.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadSuggestions(quotationId: string): Promise<void> {
    try {
      this.suggestions.set(
        await firstValueFrom(
          this.api.get<UpsellSuggestionDto[]>('/upsell/suggestions', { quotationId }),
        ),
      );
    } catch {
      // No suggestions for this quote (e.g. every product is already on it) — the panel shows its own empty hint.
      this.suggestions.set([]);
    }
  }

  /* ------------------------------------------------------------ mutations */

  setQty(lineId: string, qty: number): void {
    this.draftLines.update((lines) =>
      lines.map((l) => (l.id === lineId ? { ...l, qty: Math.max(1, qty) } : l)),
    );
    this.isDirty.set(true);
  }

  setDiscount(lineId: string, discountPct: number): void {
    this.draftLines.update((lines) =>
      lines.map((l) =>
        l.id === lineId ? { ...l, discountPct: Math.min(100, Math.max(0, discountPct)) } : l,
      ),
    );
    this.isDirty.set(true);
  }

  removeLine(lineId: string): void {
    this.draftLines.update((lines) => lines.filter((l) => l.id !== lineId));
    this.isDirty.set(true);
  }

  /** Adding an upsell is an ordinary line add — the margin moves in the same tick. */
  addProduct(product: ProductDto, qty = 1, fromUpsell = false): void {
    // A plain Date.now() suffix can collide if the same product is added twice
    // within the same millisecond (a fast double-click, or "Add to Quote" plus a
    // manual add) — setDiscount()/setQty() match by id and update every line that
    // shares it, so a collision here silently links two unrelated lines together.
    const id = `tmp-${product.id}-${crypto.randomUUID()}`;
    this.draftLines.update((lines) => [
      ...lines,
      {
        id,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        category: product.category,
        qty,
        unitPrice: product.unitPrice,
        costPrice: product.costPrice,
        discountPct: 0,
        taxPct: product.taxPct,
        isSubscription: product.isSubscription,
        recurringCycle: product.recurringCycle,
        addedFromUpsell: fromUpsell,
      },
    ]);
    this.isDirty.set(true);
    this.suggestions.update((list) => list.filter((s) => s.productId !== product.id));
  }

  addSuggestion(suggestion: UpsellSuggestionDto): void {
    const product = this.products().find((p) => p.id === suggestion.productId);
    if (product) this.addProduct(product, 1, true);
  }

  dismissSuggestion(productId: string): void {
    this.suggestions.update((list) => list.filter((s) => s.productId !== productId));
  }

  reset(): void {
    const q = this.quotation();
    this.draftLines.set(q ? q.lines.map(toInput) : []);
    this.isDirty.set(false);
  }

  /**
   * PATCH the draft with the version last read. A line the rep added locally
   * (its id still carries the `tmp-` scratch prefix `addProduct()` gives it)
   * is sent WITHOUT an id, so the server assigns the canonical one; every
   * other line keeps the id the server already knows it by.
   */
  async save(): Promise<boolean> {
    const q = this.quotation();
    if (!q) return false;
    const body: UpdateQuotationRequest = {
      version: q.version,
      lines: this.draftLines().map((l): QuotationLineInput => ({
        id: l.id.startsWith('tmp-') ? undefined : l.id,
        productId: l.productId,
        qty: l.qty,
        discountPct: l.discountPct,
        selectedVariants: l.selectedVariants,
        addedFromUpsell: l.addedFromUpsell,
      })),
    };
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.patch<QuotationDto>(`/quotations/${q.id}`, body));
      this.quotation.set(saved);
      this.draftLines.set(saved.lines.map(toInput));
      this.isDirty.set(false);
      this.staleConflict.set(false);
      return true;
    } catch (err: any) {
      if (err?.error?.error?.code === 'STALE_VERSION') {
        this.staleConflict.set(true);
        return false;
      }
      throw err;
    } finally {
      this.saving.set(false);
    }
  }

  /** `POST /quotations/:id/portal-link` — revoke any live customer link and mint a fresh one. */
  async reissuePortalLink(
    quotationId: string,
    reason?: string,
  ): Promise<ReissuePortalLinkResponse> {
    return firstValueFrom(
      this.api.post<ReissuePortalLinkResponse>(`/quotations/${quotationId}/portal-link`, {
        reason,
      }),
    );
  }

  /** Discard local edits and re-read the quotation the server actually has now. */
  async reloadFromServer(): Promise<void> {
    const q = this.quotation();
    this.staleConflict.set(false);
    if (q) await this.load(q.id);
  }

  /**
   * The single most important write in the product. Saves the draft first
   * (so what gets submitted is exactly what is on screen), then submits —
   * the server recomputes the blended risk and either auto-approves the
   * quotation or opens the approval chain. The rep never chooses.
   */
  async submit(): Promise<SubmitQuotationResponse | null> {
    const q = this.quotation();
    if (!q) return null;
    if (this.isDirty()) {
      const ok = await this.save();
      if (!ok) return null;
    }
    const current = this.quotation()!;
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.api.post<SubmitQuotationResponse>(`/quotations/${current.id}/submit`, {}),
      );
      this.quotation.set(result.quotation);
      this.draftLines.set(result.quotation.lines.map(toInput));
      return result;
    } finally {
      this.saving.set(false);
    }
  }
}

function toInput(line: QuotationDto['lines'][number]): LinePricingInput {
  return {
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    sku: line.sku,
    category: line.category,
    qty: line.qty,
    unitPrice: line.unitPrice,
    costPrice: line.costPrice,
    discountPct: line.discountPct,
    taxPct: line.taxPct,
    isSubscription: line.isSubscription,
    recurringCycle: line.recurringCycle,
    addedFromUpsell: line.addedFromUpsell,
  };
}
