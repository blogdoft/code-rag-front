import { Component, inject, input, model } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { DocumentTypesService } from '../../../core/services/document-types.service';
import { Combobox, type ComboboxOption, type ComboboxSearch } from '../combobox/combobox';

/**
 * Lookup combobox over the document-type master data. `value` is the selected type's id. The
 * catalog is small and has no server-side name filter, so the service searches its cached copy.
 */
@Component({
  selector: 'app-document-type-combobox',
  imports: [Combobox],
  host: { class: 'block' },
  template: `<app-combobox
    [label]="label()"
    [placeholder]="placeholder()"
    [disabled]="disabled()"
    [search]="search"
    [labelHints]="labels()"
    [(value)]="value"
  />`,
})
export class DocumentTypeCombobox {
  private readonly types = inject(DocumentTypesService);

  readonly label = input('Type');
  readonly placeholder = input('Search types...');
  readonly disabled = input(false);
  readonly value = model<string | null>(null);

  /** Resolves the label of a preset `value` without waiting for the user to open the list. */
  protected readonly labels = toSignal(
    this.types.list().pipe(
      map((items) => items.map(toOption)),
      // A failed load is already toasted globally; the field just falls back to showing no label.
      catchError(() => of([] as ComboboxOption[])),
    ),
    { initialValue: [] as ComboboxOption[] },
  );

  protected readonly search: ComboboxSearch = (query) =>
    this.types.search(query).pipe(map((items) => items.map(toOption)));
}

function toOption(type: { id: string; name: string }): ComboboxOption {
  return { id: type.id, label: type.name };
}
