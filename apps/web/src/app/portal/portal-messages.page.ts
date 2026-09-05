import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { LoadingComponent, ShortDatePipe } from '../shared/ui';
import { PortalStore } from './portal.store';

/** The portal's Messages tab: the whole negotiation, in order. */
@Component({
  selector: 'df-portal-messages',
  standalone: true,
  imports: [ShortDatePipe, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Messages</h1>
    <p class="df-muted mt-1">Everything you and your account manager have said about this quotation.</p>

    @if (store.loading()) {
      <div class="mt-6"><df-loading [count]="3" label="Loading messages" /></div>
    } @else if (store.events().length) {
      <ul class="mt-6 space-y-3">
        @for (event of store.events(); track event.id) {
          <li class="flex" [class.justify-end]="event.fromCustomer">
            <div class="max-w-lg rounded-2xl px-4 py-3" [class]="event.fromCustomer ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'">
              @if (event.lineName) {
                <p class="text-xs font-medium" [class]="event.fromCustomer ? 'text-slate-300' : 'text-slate-500'">About: {{ event.lineName }}</p>
              }
              @if (event.comment) { <p class="mt-0.5 text-sm leading-relaxed">{{ event.comment }}</p> }
              @if (event.counterDiscountPct != null) {
                <p class="mt-1 text-sm font-medium">Proposed discount: {{ event.counterDiscountPct }}%</p>
              }
              <p class="mt-1.5 text-[11px]" [class]="event.fromCustomer ? 'text-slate-400' : 'text-slate-400'">
                {{ event.authorName }} · {{ event.createdAt | shortDate }}
              </p>
            </div>
          </li>
        }
      </ul>
    } @else {
      <p class="mt-6 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No messages yet. Anything you write on the quotation page appears here.
      </p>
    }
  `,
})
export class PortalMessagesPage implements OnInit {
  protected readonly store = inject(PortalStore);
  ngOnInit(): void { if (!this.store.data()) void this.store.load(); }
}
