import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { SessionStore } from '../core/state/session.store';
import { PortalStore } from './portal.store';

/** The portal's Profile tab. Deliberately minimal — this is a customer surface. */
@Component({
  selector: 'df-portal-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="df-h1">Profile</h1>
    <div class="df-card mt-6 divide-y divide-slate-100">
      <div class="flex justify-between px-4 py-3">
        <span class="text-sm text-slate-500">Name</span>
        <span class="text-sm font-medium text-slate-800">{{ session.user()?.name ?? 'Guest' }}</span>
      </div>
      <div class="flex justify-between px-4 py-3">
        <span class="text-sm text-slate-500">Email</span>
        <span class="text-sm font-medium text-slate-800">{{ session.user()?.email || '—' }}</span>
      </div>
      <div class="flex justify-between px-4 py-3">
        <span class="text-sm text-slate-500">Company</span>
        <span class="text-sm font-medium text-slate-800">{{ store.data()?.customer?.name ?? '—' }}</span>
      </div>
      <div class="flex justify-between px-4 py-3">
        <span class="text-sm text-slate-500">Access</span>
        <span class="text-sm text-slate-600">This account can only open quotations belonging to your company.</span>
      </div>
    </div>
  `,
})
export class PortalProfilePage implements OnInit {
  protected readonly session = inject(SessionStore);
  protected readonly store = inject(PortalStore);
  ngOnInit(): void { if (!this.store.data()) void this.store.load(); }
}
