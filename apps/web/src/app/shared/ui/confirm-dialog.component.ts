import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalComponent } from './modal.component';

/**
 * Confirmation with a mandatory reason.
 * Approve / Return / Reject / Manual Override / Cancel Subscription all use it,
 * because every one of those actions must land in the audit trail with a reason.
 */
@Component({
  selector: 'df-confirm-dialog',
  standalone: true,
  imports: [ModalComponent, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <df-modal [open]="open()" [title]="title()" [subtitle]="subtitle()" (close)="cancel.emit()">
      <p class="text-sm leading-relaxed text-slate-600">{{ message() }}</p>
      @if (requireReason()) {
        <label class="mt-4 block">
          <span class="df-label">{{ reasonLabel() }}</span>
          <textarea class="df-input min-h-[5rem]" [(ngModel)]="reason" [placeholder]="reasonPlaceholder()"></textarea>
          <span class="mt-1 block text-xs text-slate-400">This is written to the audit trail with your name and the time.</span>
        </label>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="df-btn-ghost" (click)="cancel.emit()">Cancel</button>
        <button type="button" [class]="confirmClass()" [disabled]="requireReason() && !reason.trim()" (click)="submit()">
          {{ confirmLabel() }}
        </button>
      </div>
    </df-modal>
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('Are you sure?');
  readonly subtitle = input<string | null>(null);
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly tone = input<'primary' | 'success' | 'warn' | 'danger'>('primary');
  readonly requireReason = input(true);
  readonly reasonLabel = input('Reason');
  readonly reasonPlaceholder = input('Why are you doing this?');

  readonly confirmed = output<string>();
  readonly cancel = output<void>();

  reason = '';

  confirmClass(): string {
    return { primary: 'df-btn-primary', success: 'df-btn-success', warn: 'df-btn-warn', danger: 'df-btn-danger' }[this.tone()];
  }

  submit(): void {
    this.confirmed.emit(this.reason.trim());
    this.reason = '';
  }
}
