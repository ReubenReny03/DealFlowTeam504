import { ChangeDetectionStrategy, Component, input, output, TemplateRef, contentChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

export interface ColumnDef<T = any> {
  key: string;
  header: string;
  /** Cell text. Omit and supply a `cell` template for anything richer. */
  value?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Rendered in a monospace face — document numbers, quantities. */
  mono?: boolean;
}

/**
 * The one table in the app. Wide content scrolls inside its own box, so the
 * page body never scrolls sideways.
 */
@Component({
  selector: 'df-data-table',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="df-card df-scroll-x">
      <table class="min-w-full divide-y divide-slate-200">
        <thead class="bg-slate-50">
          <tr>
            @for (col of columns(); track col.key) {
              <th scope="col" class="df-th" [style.width]="col.width" [class.text-right]="col.align === 'right'" [class.text-center]="col.align === 'center'">
                {{ col.header }}
              </th>
            }
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          @for (row of rows(); track trackRow(row, $index)) {
            <tr
              class="transition"
              [class.cursor-pointer]="clickable()"
              [class.hover:bg-slate-50]="clickable()"
              (click)="clickable() && rowClick.emit(row)"
            >
              @for (col of columns(); track col.key) {
                <td class="df-td" [class.text-right]="col.align === 'right'" [class.text-center]="col.align === 'center'" [class.font-mono]="col.mono">
                  @if (cellTemplate()) {
                    <ng-container *ngTemplateOutlet="cellTemplate()!; context: { $implicit: row, col: col }" />
                  } @else {
                    {{ col.value?.(row) ?? '—' }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td class="df-td py-10 text-center text-slate-400" [attr.colspan]="columns().length">{{ emptyText() }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class DataTableComponent<T = any> {
  readonly columns = input.required<ColumnDef<T>[]>();
  readonly rows = input.required<T[]>();
  readonly clickable = input(false);
  readonly emptyText = input('Nothing to show yet.');
  readonly trackBy = input<(row: T) => string | number>();
  readonly rowClick = output<T>();

  readonly cellTemplate = contentChild<TemplateRef<{ $implicit: T; col: ColumnDef<T> }>>('cell');

  trackRow(row: T, index: number): string | number {
    const fn = this.trackBy();
    return fn ? fn(row) : ((row as any)?.id ?? index);
  }
}
