import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  APPROVAL_STATUS_LABEL, CATEGORY_LABEL, CYCLE_LABEL, FULFILLMENT_STATUS_LABEL,
  INVOICE_STATUS_LABEL, RISK_LEVEL_LABEL, STAGE_LABEL, STATUS_COLORS, SUBSCRIPTION_STATUS_LABEL, TIER_LABEL,
} from '@dealflow/shared';

type ChipKind = 'stage' | 'risk' | 'tier' | 'invoice' | 'subscription' | 'fulfillment' | 'approval' | 'category' | 'cycle' | 'plain';

const NEUTRAL = 'bg-slate-100 text-slate-700 border-slate-200';

/**
 * Every coloured status pill in the app. One component, so "HIGH" is the same
 * red everywhere and a new status can never be introduced with a stray colour.
 */
@Component({
  selector: 'df-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="df-chip" [class]="classes()">{{ label() }}</span>`,
})
export class StatusChipComponent {
  readonly kind = input<ChipKind>('plain');
  readonly value = input.required<string>();
  /** Overrides the automatic label. */
  readonly text = input<string | null>(null);

  readonly label = computed(() => {
    const v = this.value();
    if (this.text()) return this.text()!;
    switch (this.kind()) {
      case 'stage': return STAGE_LABEL[v as keyof typeof STAGE_LABEL] ?? v;
      case 'risk': return RISK_LEVEL_LABEL[v as keyof typeof RISK_LEVEL_LABEL] ?? v;
      case 'tier': return TIER_LABEL[v as keyof typeof TIER_LABEL] ?? v;
      case 'invoice': return INVOICE_STATUS_LABEL[v as keyof typeof INVOICE_STATUS_LABEL] ?? v;
      case 'subscription': return SUBSCRIPTION_STATUS_LABEL[v as keyof typeof SUBSCRIPTION_STATUS_LABEL] ?? v;
      case 'fulfillment': return FULFILLMENT_STATUS_LABEL[v as keyof typeof FULFILLMENT_STATUS_LABEL] ?? v;
      case 'approval': return APPROVAL_STATUS_LABEL[v as keyof typeof APPROVAL_STATUS_LABEL] ?? v;
      case 'category': return CATEGORY_LABEL[v as keyof typeof CATEGORY_LABEL] ?? v;
      case 'cycle': return CYCLE_LABEL[v as keyof typeof CYCLE_LABEL] ?? v;
      default: return v;
    }
  });

  readonly classes = computed(() => {
    const v = this.value();
    switch (this.kind()) {
      case 'stage': return STATUS_COLORS.stage[v as keyof typeof STATUS_COLORS.stage] ?? NEUTRAL;
      case 'risk': return STATUS_COLORS.risk[v as keyof typeof STATUS_COLORS.risk] ?? NEUTRAL;
      case 'tier': return STATUS_COLORS.tier[v as keyof typeof STATUS_COLORS.tier] ?? NEUTRAL;
      case 'invoice': return STATUS_COLORS.invoice[v as keyof typeof STATUS_COLORS.invoice] ?? NEUTRAL;
      case 'subscription':
        return v === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : v === 'PAUSED' ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-slate-100 text-slate-600 border-slate-200';
      case 'fulfillment':
        return v === 'BACKORDER' ? 'bg-rose-100 text-rose-800 border-rose-200'
          : v === 'CONSOLIDATION_AVAILABLE' ? 'bg-sky-100 text-sky-800 border-sky-200'
          : v === 'SHIPPED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : 'bg-amber-100 text-amber-800 border-amber-200';
      case 'approval':
        return v === 'APPROVED' || v === 'NOT_REQUIRED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
          : v === 'RETURNED' ? 'bg-amber-100 text-amber-800 border-amber-200'
          : v === 'REJECTED' ? 'bg-rose-100 text-rose-800 border-rose-200'
          : 'bg-sky-100 text-sky-800 border-sky-200';
      default: return NEUTRAL;
    }
  });
}
