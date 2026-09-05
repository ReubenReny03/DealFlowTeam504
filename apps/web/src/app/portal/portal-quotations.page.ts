import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EMPTY_STATES } from '@dealflow/shared';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingComponent,
  MoneyPipe,
  PaginatorComponent,
  SearchBoxComponent,
  ShortDatePipe,
  StatusChipComponent,
} from '../shared/ui';
import { PortalStore } from './portal.store';

/**
 * SCREEN 11a — the customer's quotation list.
 *
 * One company is quoted many times, so the portal opens on the list rather than
 * on whichever quotation happened to be linked last. A magic-link session still
 * only ever sees the single quotation its link was minted for.
 */
@Component({
  selector: 'df-portal-quotations',
  standalone: true,
  imports: [
    RouterLink,
    MoneyPipe,
    ShortDatePipe,
    StatusChipComponent,
    LoadingComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    PaginatorComponent,
    SearchBoxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="df-h1">Your quotations</h1>
        <p class="df-muted mt-1">
          @if (store.company(); as company) {
            Everything we have sent {{ company.name }}, most recent first.
          } @else {
            Everything your account manager has sent you, most recent first.
          }
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <df-search-box
          [value]="store.listQuery.q()"
          placeholder="Search by number or item"
          width="15rem"
          (search)="store.searchList($event)"
        />
        @if (store.listQuery.total()) {
          <span class="df-chip bg-slate-100 text-slate-700 border-slate-200">
            {{ store.listQuery.total() }}
            {{ store.listQuery.total() === 1 ? 'quotation' : 'quotations' }}
          </span>
        }
      </div>
    </div>

    @if (store.scopedToSingle()) {
      <p class="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-900">
        You opened this page with a shared link, which unlocks one quotation. Sign in with
        the account your account manager set up to see everything else we have sent you.
      </p>
    }

    @if (store.listLoading() && !store.list().length) {
      <div class="mt-6"><df-loading [count]="4" label="Loading your quotations" /></div>
    } @else if (store.listError()) {
      <div class="mt-6"><df-error-state [message]="store.listError()!" (retry)="reload()" /></div>
    } @else if (!store.list().length) {
      <div class="mt-6">
        <df-empty-state
          [title]="empty.title"
          [body]="empty.body"
          icon="📄"
          [filtered]="store.listQuery.isFiltered()"
          [searchTerm]="store.listQuery.q()"
          (clearSearch)="store.searchList('')"
        />
      </div>
    } @else {
      <ul class="mt-6 space-y-3">
        @for (q of store.list(); track q.id) {
          <li>
            <a
              [routerLink]="['/portal/q', q.number]"
              class="df-card block px-4 py-4 transition hover:border-slate-300 hover:shadow-sm"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-mono text-xs text-slate-400">{{ q.number }}</p>
                  <p class="mt-0.5 text-base font-semibold text-slate-900">
                    {{ q.grandTotal | money: q.currency }}
                  </p>
                  <p class="df-muted mt-1 text-xs">
                    {{ q.lineCount }} {{ q.lineCount === 1 ? 'item' : 'items' }}
                    @if (q.validUntil) { · valid until {{ q.validUntil | shortDate }} }
                    @if (q.messageCount) { · {{ q.messageCount }} message{{ q.messageCount === 1 ? '' : 's' }} }
                  </p>
                </div>
                <div class="flex flex-col items-end gap-1.5">
                  <df-status-chip kind="stage" [value]="q.stage" />
                  <span class="text-xs text-slate-400">
                    Last activity {{ q.lastActivityAt | shortDate }}
                  </span>
                </div>
              </div>
              <p class="mt-2 text-xs" [class]="q.canConfirm ? 'text-emerald-600' : 'text-slate-400'">
                @if (q.canConfirm) {
                  Ready for you to review and confirm.
                } @else if (q.awaitingApproval) {
                  With your account manager's team for internal approval.
                } @else {
                  Open it to see the lines and the conversation.
                }
              </p>
            </a>
          </li>
        }
      </ul>
      <df-paginator
        [page]="store.listQuery.page()"
        [pageSize]="store.listQuery.pageSize()"
        [total]="store.listQuery.total()"
        (go)="store.goToListPage($event)"
      />
    }
  `,
})
export class PortalQuotationsPage implements OnInit {
  protected readonly store = inject(PortalStore);
  protected readonly empty = EMPTY_STATES.portal;

  ngOnInit(): void {
    void this.store.loadList();
  }

  reload(): void {
    void this.store.loadList(true);
  }
}
