import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, type WritableSignal } from '@angular/core';
import {
  DEFAULT_QUALIFIED_NAME_FILTER,
  type QualifiedNameFilter,
  type QualifiedNameFilterOperator,
} from '../../core/models/code-query-filters';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface QueryFiltersDrawerData {
  kind: WritableSignal<string>;
  qualifiedName: WritableSignal<QualifiedNameFilter>;
  qualifiedNameOperators: readonly QualifiedNameFilterOperator[];
  minSimilarity: WritableSignal<number | null>;
  limit: WritableSignal<number | null>;
}

@Component({
  selector: 'app-query-filters-drawer',
  imports: [EscClearableDirective],
  templateUrl: './query-filters-drawer.html',
})
export class QueryFiltersDrawer {
  protected readonly data = inject<QueryFiltersDrawerData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<void>);

  protected updateQualifiedName(patch: Partial<QualifiedNameFilter>): void {
    this.data.qualifiedName.update((current) => ({ ...current, ...patch }));
  }

  protected clearAll(): void {
    this.data.kind.set('');
    this.data.qualifiedName.set({ ...DEFAULT_QUALIFIED_NAME_FILTER });
    this.data.minSimilarity.set(null);
    this.data.limit.set(null);
    this.dialogRef.close();
  }

  protected apply(): void {
    this.dialogRef.close();
  }
}
