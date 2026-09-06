import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApprovalStatus,
  ApprovalStepStatus,
  CATEGORY_LABEL,
  ROLE_LABEL,
  Role,
  type ReissuePortalLinkResponse,
} from '@dealflow/shared';
import { ApprovalStore } from '../../core/state/feature.stores';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';
import {
  ConfirmDialogComponent,
  ErrorStateComponent,
  LoadingComponent,
  LongDatePipe,
  ModalComponent,
  MoneyPipe,
  Step,
  StepperComponent,
  StatusChipComponent,
} from '../../shared/ui';

/**
 * SCREEN 6 — Approval Detail.
 *
 * The "Why This Quote Was Flagged" table is rendered VERBATIM from
 * `approval.risk.explanation`, which the risk engine produced at submit time.
 * The UI never recomputes any of those numbers: what the approver reads is
 * exactly what the engine decided on, which is the point.
 */
@Component({
  selector: 'df-approval-detail',
  standalone: true,
  imports: [
    RouterLink,
    StepperComponent,
    StatusChipComponent,
    ConfirmDialogComponent,
    ModalComponent,
    MoneyPipe,
    LongDatePipe,
    LoadingComponent,
    ErrorStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.loading()) {
      <df-loading [count]="6" label="Loading approval" />
    } @else if (store.error()) {
      <df-error-state [message]="store.error()!" (retry)="reload()" />
    } @else {
      @if (store.current(); as a) {
        <a routerLink="/app/approvals" class="text-sm text-slate-500 hover:text-slate-800"
          >← Approvals</a
        >

        <div class="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="df-h1">{{ a.quotationNumber }} · {{ a.customerName }}</h1>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <df-status-chip
                kind="risk"
                [value]="a.risk.riskLevel"
                [text]="'Blended Risk: ' + a.risk.riskLevel"
              />
              <df-status-chip kind="tier" [value]="a.tier" [text]="'Customer Tier: ' + a.tier" />
              <df-status-chip kind="approval" [value]="a.status" />
              <span class="df-muted"
                >Submitted by {{ a.ownerName }} · {{ a.amount | money: a.currency }}</span
              >
            </div>
          </div>
          <div class="flex gap-2">
            @if (a.status === 'APPROVED') {
              <button
                type="button"
                class="df-btn-ghost"
                [disabled]="reissuing()"
                (click)="reissueLink(a.quotationId)"
              >
                {{ reissuing() ? 'Generating…' : 'Reissue customer link' }}
              </button>
            }
            <a [routerLink]="['/app/quotations', a.quotationId]" class="df-btn-ghost"
              >Open the quotation</a
            >
          </div>
        </div>

        <!-- the stepper -->
        <div class="df-card mt-6 px-6 py-4">
          <df-stepper [steps]="steps()" />
        </div>

        <div class="mt-6 grid gap-6 lg:grid-cols-3">
          <!-- why it was flagged -->
          <section class="lg:col-span-2">
            <h2 class="df-h2">Why This Quote Was Flagged</h2>
            <p class="df-muted mt-1">Score {{ a.risk.riskScore }} — {{ a.risk.summary }}</p>

            <div class="df-card df-scroll-x mt-3">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="df-th">Line</th>
                    <th class="df-th text-right">Discount Given</th>
                    <th class="df-th text-right">Limit Allowed</th>
                    <th class="df-th text-right">Over By</th>
                    <th class="df-th text-right">Weight</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (row of a.risk.explanation; track row.lineId) {
                    <tr [class]="row.status === 'OVER' ? 'bg-rose-50' : ''">
                      <td class="df-td">
                        <span class="font-medium text-slate-800">{{ row.line }}</span>
                        <span class="text-slate-400"> / {{ categoryLabel(row.category) }}</span>
                      </td>
                      <td class="df-td text-right font-mono">{{ row.given }}%</td>
                      <td class="df-td text-right font-mono text-slate-500">{{ row.allowed }}%</td>
                      <td class="df-td text-right">
                        @if (row.status === 'OVER') {
                          <span class="font-mono font-semibold text-rose-700"
                            >{{ row.overBy }} pt OVER</span
                          >
                        } @else {
                          <span class="font-mono text-emerald-700">0 pt OK</span>
                        }
                      </td>
                      <td class="df-td text-right font-mono text-slate-400">
                        {{ (row.weight * 100).toFixed(0) }}%
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <p class="mt-2 text-xs leading-relaxed text-slate-500">
              The worst single line over its limit, plus the revenue-weighted pattern across the
              whole order, together set the blended score. One bad line is enough to require
              approval — and many small ones are too.
            </p>

            <!-- audit trail -->
            <h2 class="df-h2 mt-8">Audit trail</h2>
            <div class="df-card df-scroll-x mt-3">
              <table class="min-w-full divide-y divide-slate-200">
                <thead class="bg-slate-50">
                  <tr>
                    <th class="df-th">User</th>
                    <th class="df-th">Action</th>
                    <th class="df-th">Date</th>
                    <th class="df-th">Reason</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (entry of a.trail; track entry.at) {
                    <tr>
                      <td class="df-td font-medium text-slate-800">{{ entry.actorName }}</td>
                      <td class="df-td">{{ pretty(entry.action) }}</td>
                      <td class="df-td text-slate-500">{{ entry.at | longDate }}</td>
                      <td class="df-td text-slate-600">{{ entry.reason }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td class="df-td py-6 text-center text-slate-400" colspan="4">
                        No actions recorded yet.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <!-- actions -->
          <aside>
            <div class="df-card p-5">
              <h2 class="df-h2">Your decision</h2>
              @if (canAct()) {
                <p class="df-muted mt-1">
                  This quotation is waiting on {{ a.assignedToName ?? roleLabel(a.currentStage) }}.
                </p>
                <div class="mt-4 space-y-2">
                  <button type="button" class="df-btn-success w-full" (click)="ask('approve')">
                    Approve
                  </button>
                  <!-- Return for Revision is out of scope for now; hidden until it comes back in. -->
                  <button type="button" class="df-btn-danger w-full" (click)="ask('reject')">
                    Reject
                  </button>
                </div>
                <p class="mt-3 text-xs leading-relaxed text-slate-400">
                  Every decision is recorded with your name, the time and your reason.
                </p>
              } @else if (waitingOnSomeoneElse()) {
                <p class="df-muted mt-1">
                  This step is waiting on {{ a.assignedToName ?? roleLabel(a.currentStage) }}. You
                  will be able to act on it if it reaches your step.
                </p>
              } @else {
                <p class="df-muted mt-1">
                  This approval is {{ pretty(a.status) }}. There is nothing for you to do here.
                </p>
              }
            </div>

            @if (a.reEnteredFromNegotiation) {
              <div class="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                <p class="text-sm font-medium text-sky-900">Back from the customer</p>
                <p class="mt-1 text-sm leading-relaxed text-sky-800">
                  The customer changed the terms in the portal and the quotation re-entered approval
                  by itself. Nobody asked for this review.
                </p>
              </div>
            }
          </aside>
        </div>

        <df-confirm-dialog
          [open]="pendingAction() !== null"
          [title]="dialogTitle()"
          [message]="dialogMessage()"
          [confirmLabel]="dialogConfirm()"
          [tone]="dialogTone()"
          reasonLabel="Reason"
          reasonPlaceholder="This appears in the audit trail and, for a return, is what the rep sees."
          (confirmed)="commit($event)"
          (cancel)="pendingAction.set(null)"
        />

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
export class ApprovalDetailPage implements OnInit {
  protected readonly store = inject(ApprovalStore);
  private readonly session = inject(SessionStore);
  private readonly toast = inject(ToastStore);
  readonly id = input<string>('');

  protected readonly pendingAction = signal<'approve' | 'return' | 'reject' | null>(null);
  protected readonly reissuing = signal(false);
  protected readonly reissuedLink = signal<ReissuePortalLinkResponse | null>(null);

  ngOnInit(): void {
    void this.store.loadOne(this.id());
  }
  reload(): void {
    void this.store.loadOne(this.id());
  }

  categoryLabel(c: string): string {
    return CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c;
  }
  roleLabel(r?: string): string {
    return r ? (ROLE_LABEL[r as keyof typeof ROLE_LABEL] ?? r) : 'nobody';
  }
  pretty(action: string): string {
    return action
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Mirrors the server's `assertActiveStepRole`: only the role holding the ACTIVE
   * step may decide it, and an Admin may act on any step. A HIGH-risk quotation
   * chains SALES_MANAGER then FINANCE, so without the role check the Manager was
   * offered Approve/Return/Reject on a step that is sitting with Finance and only
   * found out when the API answered 403.
   */
  readonly canAct = computed(() => {
    const a = this.store.current();
    if (!a || a.status !== ApprovalStatus.PENDING) return false;
    const step = a.steps[a.currentStepIndex];
    if (!step || step.status !== ApprovalStepStatus.ACTIVE) return false;
    const role = this.session.role();
    return role === Role.ADMIN || role === step.role;
  });

  /** PENDING, but on somebody else's desk — the aside explains rather than offers buttons. */
  readonly waitingOnSomeoneElse = computed(
    () => this.store.current()?.status === ApprovalStatus.PENDING && !this.canAct(),
  );

  /** Submitted → each approver in the chain → Confirmed. */
  readonly steps = computed<Step[]>(() => {
    const a = this.store.current();
    if (!a) return [];
    const chain: Step[] = a.steps.map((s) => ({
      label: this.roleLabel(s.role),
      state:
        s.status === 'APPROVED'
          ? 'done'
          : s.status === 'ACTIVE'
            ? 'active'
            : s.status === 'REJECTED'
              ? 'failed'
              : s.status === 'RETURNED'
                ? 'failed'
                : 'pending',
      caption: s.actorName ?? undefined,
    }));
    return [
      { label: 'Submitted', state: 'done', caption: a.ownerName },
      ...chain,
      { label: 'Confirmed', state: a.status === 'APPROVED' ? 'done' : 'pending' },
    ];
  });

  ask(action: 'approve' | 'return' | 'reject'): void {
    this.pendingAction.set(action);
  }

  dialogTitle(): string {
    return {
      approve: 'Approve this quotation?',
      return: 'Return for revision?',
      reject: 'Reject this quotation?',
    }[this.pendingAction() ?? 'approve'];
  }
  dialogMessage(): string {
    const a = this.store.current();
    switch (this.pendingAction()) {
      case 'return':
        return `${a?.quotationNumber} goes back to ${a?.ownerName} as a draft. They will see your reason and can resubmit.`;
      case 'reject':
        return `${a?.quotationNumber} is closed for good. The rep would have to start a new quotation.`;
      default:
        return a?.steps.some((s) => s.status === 'PENDING')
          ? `${a?.quotationNumber} moves on to the next approver in the chain.`
          : `${a?.quotationNumber} is fully approved and goes to the customer's portal.`;
    }
  }
  dialogConfirm(): string {
    return { approve: 'Approve', return: 'Return for Revision', reject: 'Reject' }[
      this.pendingAction() ?? 'approve'
    ];
  }
  dialogTone(): 'success' | 'warn' | 'danger' {
    return { approve: 'success' as const, return: 'warn' as const, reject: 'danger' as const }[
      this.pendingAction() ?? 'approve'
    ];
  }

  async reissueLink(quotationId: string): Promise<void> {
    this.reissuing.set(true);
    try {
      this.reissuedLink.set(await this.store.reissuePortalLink(quotationId));
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

  async commit(reason: string): Promise<void> {
    const action = this.pendingAction();
    if (!action) return;
    this.pendingAction.set(null);
    try {
      await this.store.decide(this.id(), action, reason);
      this.toast.success('Recorded', `${this.dialogConfirm()} — written to the audit trail.`);
    } catch {
      /* the interceptor already toasted the reason (e.g. a 403 when you are not the active step's role) */
    }
  }
}
