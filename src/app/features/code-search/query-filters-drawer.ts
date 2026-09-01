import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, type WritableSignal } from '@angular/core';
import { DEFAULT_FIELD_FILTER, type CodeQueryFieldFilter, type FilterOperator } from '../../core/models/code-query-filters';
import { EscClearableDirective } from '../../shared/directives/esc-clearable.directive';

export interface QueryFiltersDrawerData {
  namespaceFilter: WritableSignal<CodeQueryFieldFilter>;
  kindFilter: WritableSignal<CodeQueryFieldFilter>;
  typeNameFilter: WritableSignal<CodeQueryFieldFilter>;
  namespaceOperators: readonly FilterOperator[];
  kindOperators: readonly FilterOperator[];
  typeNameOperators: readonly FilterOperator[];
}

@Component({
  selector: 'app-query-filters-drawer',
  imports: [EscClearableDirective],
  templateUrl: './query-filters-drawer.html',
})
export class QueryFiltersDrawer {
  protected readonly data = inject<QueryFiltersDrawerData>(DIALOG_DATA);
  private readonly dialogRef = inject(DialogRef<void>);

  protected updateFilter(filter: WritableSignal<CodeQueryFieldFilter>, patch: Partial<CodeQueryFieldFilter>): void {
    filter.update((current) => ({ ...current, ...patch }));
  }

  protected clearAll(): void {
    this.data.namespaceFilter.set({ ...DEFAULT_FIELD_FILTER });
    this.data.kindFilter.set({ ...DEFAULT_FIELD_FILTER });
    this.data.typeNameFilter.set({ ...DEFAULT_FIELD_FILTER });
    this.dialogRef.close();
  }

  protected apply(): void {
    this.dialogRef.close();
  }
}
