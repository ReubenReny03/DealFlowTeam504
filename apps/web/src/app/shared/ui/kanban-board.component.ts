import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { STATUS_COLORS, type KanbanBoardDto, type QuotationSummaryDto } from '@dealflow/shared';
import { MoneyPipe } from '../pipes/money.pipe';
import { AgoPipe } from '../pipes/date.pipes';
import { StatusChipComponent } from './status-chip.component';

/** Screen 3's pipeline view. Clicking a card opens the quotation builder. */
@Component({
  selector: 'df-kanban-board',
  standalone: true,
  imports: [MoneyPipe, AgoPipe, StatusChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="df-scroll-x pb-2">
      <div class="flex min-w-max gap-4">
        @for (column of board().columns; track column.stage) {
          <section class="w-72 shrink-0">
            <header class="mb-2 flex items-baseline justify-between px-1">
              <h3 class="text-sm font-semibold text-slate-700">
                {{ column.label }}
                <span class="ml-1.5 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{{ column.cardCount }}</span>
              </h3>
              <span class="text-xs text-slate-500">{{ column.total | money }}</span>
            </header>
            <div class="min-h-[6rem] space-y-2 rounded-xl bg-slate-100/70 p-2">
              @for (card of column.cards; track card.id) {
                <button type="button" class="df-card w-full p-3 text-left transition hover:border-brand-300 hover:shadow-md" (click)="cardClick.emit(card)">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-semibold text-slate-800">{{ card.customerName }}</p>
                      <p class="font-mono text-xs text-slate-400">{{ card.number }}</p>
                    </div>
                    <df-status-chip kind="tier" [value]="card.tier" />
                  </div>
                  <p class="mt-2 text-lg font-semibold text-slate-900">{{ card.grandTotal | money: card.currency }}</p>
                  <div class="mt-2 flex items-center justify-between gap-2">
                    @if (card.riskScore > 0) {
                      <df-status-chip kind="risk" [value]="card.riskLevel" [text]="'Risk ' + card.riskScore" />
                    } @else {
                      <span class="text-xs text-emerald-600">Within limits</span>
                    }
                    <span class="text-[11px] text-slate-400">{{ card.lastActivityAt | ago }}</span>
                  </div>
                </button>
              } @empty {
                <p class="px-2 py-6 text-center text-xs text-slate-400">Nothing at this stage.</p>
              }
              <!-- The column is capped so it stays scannable; say so rather than
                   quietly showing a subset. -->
              @if (column.cardCount > column.cards.length) {
                <p class="px-2 py-2 text-center text-[11px] text-slate-500">
                  Showing {{ column.cards.length }} of {{ column.cardCount }} — search or switch to Table view for the rest.
                </p>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
})
export class KanbanBoardComponent {
  readonly board = input.required<KanbanBoardDto>();
  readonly cardClick = output<QuotationSummaryDto>();
  protected readonly colors = STATUS_COLORS;
}
