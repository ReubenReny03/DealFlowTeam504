import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Currency, EMPTY_STATES, PriceRuleType, type PriceListDto, type UpdatePriceListRequest } from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ToastStore } from '../../core/state/toast.store';
import { EmptyStateComponent, ErrorStateComponent, LoadingComponent, ModalComponent } from '../../shared/ui';

/** Tier price lists (the pricing half of screen 17's Pricelists block). */
@Component({
  selector: 'df-pricelists',
  standalone: true,
  imports: [FormsModule, LoadingComponent, ErrorStateComponent, EmptyStateComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Price Lists</h1>
    <p class="df-muted mt-1">What each tier actually pays. Separate from the discount ceilings, which govern how much more can be given away.</p>

    @if (loading()) { <div class="mt-6"><df-loading [count]="3" label="Loading price lists" /></div> }
    @else if (error()) { <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div> }
    @else if (!lists().length) {
      <div class="mt-6"><df-empty-state [title]="empty.title" [body]="empty.body" /></div>
    }
    @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="df-th">Tier</th><th class="df-th">Currencies</th><th class="df-th">Price Rule</th>
              <th class="df-th text-right">Overrides</th><th class="df-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (pl of lists(); track pl.id) {
              <tr>
                <td class="df-td font-medium text-slate-800">{{ pl.name }}</td>
                <td class="df-td text-slate-600">{{ pl.currencies.join(', ') }}</td>
                <td class="df-td text-slate-600">{{ rule(pl) }}</td>
                <td class="df-td text-right font-mono text-slate-500">{{ pl.entries.length }}</td>
                <td class="df-td text-right">
                  <button type="button" class="text-sm font-medium text-brand-700 hover:text-brand-800" (click)="edit(pl)">Edit rule</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs leading-relaxed text-slate-400">
        Changing a rule changes what that tier pays on every line priced from here on — it does not change the tier's discount ceiling.
      </p>

      @if (editingList(); as pl) {
        <df-modal [open]="true" [title]="pl.name + ' price rule'" [subtitle]="'What every ' + pl.tier + ' customer pays'" (close)="close()">
          <div class="space-y-3">
            <label class="block">
              <span class="df-label">Rule</span>
              <select class="df-input" [(ngModel)]="draft.ruleType">
                <option [value]="ruleTypes.NONE">Base price, no adjustment</option>
                <option [value]="ruleTypes.PERCENT_OFF_BASE">Percent off the base price</option>
                <option [value]="ruleTypes.FIXED_PRICE">Fixed price override</option>
              </select>
            </label>
            @if (draft.ruleType === ruleTypes.PERCENT_OFF_BASE) {
              <label class="block">
                <span class="df-label">Percent off base</span>
                <span class="flex items-center gap-1">
                  <input class="df-input !w-24 text-right" type="number" min="0" max="100" [(ngModel)]="draft.ruleValue" />
                  <span class="text-sm text-slate-400">%</span>
                </span>
                <span class="mt-1 block text-xs text-slate-400">
                  10 means "base minus 10 percent" — a $1,200 laptop prices at $1,080 for this tier.
                </span>
              </label>
            }
            <fieldset>
              <span class="df-label">Currencies</span>
              <div class="flex gap-4">
                @for (c of currencies; track c) {
                  <label class="flex items-center gap-2">
                    <input type="checkbox" class="h-4 w-4 rounded border-slate-300" [checked]="draft.currencies.includes(c)" (change)="toggleCurrency(c)" />
                    <span class="text-sm text-slate-700">{{ c }}</span>
                  </label>
                }
              </div>
            </fieldset>
            <label class="block">
              <span class="df-label">Reason for this change (required)</span>
              <input class="df-input" [(ngModel)]="draft.reason" placeholder="e.g. Q4 Gold repricing" />
              <span class="mt-1 block text-xs text-slate-400">This is written to the audit trail with your name and the time.</span>
            </label>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="df-btn-ghost" (click)="close()">Cancel</button>
              <button type="button" class="df-btn-primary" [disabled]="saving() || !draft.reason.trim() || !draft.currencies.length" (click)="save()">
                {{ saving() ? 'Saving…' : 'Save price rule' }}
              </button>
            </div>
          </div>
        </df-modal>
      }
    }
  `,
})
export class PriceListsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lists = signal<PriceListDto[]>([]);
  protected readonly empty = EMPTY_STATES['pricelists'];

  protected readonly editingList = signal<PriceListDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly ruleTypes = PriceRuleType;
  protected readonly currencies = Object.values(Currency);

  draft: { ruleType: PriceRuleType; ruleValue: number; currencies: Currency[]; reason: string } = {
    ruleType: PriceRuleType.NONE, ruleValue: 0, currencies: [], reason: '',
  };

  ngOnInit(): void { void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.lists.set(await firstValueFrom(this.api.get<PriceListDto[]>('/pricelists'))); }
    catch (err: any) { this.error.set(err?.error?.error?.message ?? 'Could not load price lists.'); }
    finally { this.loading.set(false); }
  }

  edit(pl: PriceListDto): void {
    this.draft = { ruleType: pl.ruleType, ruleValue: pl.ruleValue, currencies: [...pl.currencies], reason: '' };
    this.editingList.set(pl);
  }

  close(): void { this.editingList.set(null); }

  toggleCurrency(c: Currency): void {
    this.draft.currencies = this.draft.currencies.includes(c)
      ? this.draft.currencies.filter((x) => x !== c)
      : [...this.draft.currencies, c];
  }

  async save(): Promise<void> {
    const pl = this.editingList();
    if (!pl) return;
    const body: UpdatePriceListRequest = {
      ruleType: this.draft.ruleType,
      ruleValue: Number(this.draft.ruleValue) || 0,
      currencies: this.draft.currencies,
      reason: this.draft.reason.trim(),
    };
    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.put<PriceListDto>(`/pricelists/${pl.id}`, body));
      this.lists.update((list) => list.map((x) => (x.id === saved.id ? saved : x)));
      this.close();
      this.toast.success('Price rule saved', `${saved.name} customers now pay ${this.rule(saved)}.`);
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }

  rule(pl: PriceListDto): string {
    switch (pl.ruleType) {
      case 'PERCENT_OFF_BASE': return `price minus ${pl.ruleValue} percent base`;
      case 'FIXED_PRICE': return 'fixed price';
      default: return 'price, no adjustment';
    }
  }
}
