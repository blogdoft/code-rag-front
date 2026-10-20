import { Component, inject, input, model } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { DocumentLanguagesService } from '../../../core/services/document-languages.service';
import { Combobox, type ComboboxOption, type ComboboxSearch } from '../combobox/combobox';

/**
 * Lookup combobox over the document-language master data. `value` is the selected language's id;
 * options are labelled with the BCP 47 code. Same cached in-memory search as the type combobox.
 */
@Component({
  selector: 'app-document-language-combobox',
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
export class DocumentLanguageCombobox {
  private readonly languages = inject(DocumentLanguagesService);

  readonly label = input('Language');
  readonly placeholder = input('Search languages...');
  readonly disabled = input(false);
  readonly value = model<string | null>(null);

  protected readonly labels = toSignal(
    this.languages.list().pipe(
      map((items) => items.map(toOption)),
      // A failed load is already toasted globally; the field just falls back to showing no label.
      catchError(() => of([] as ComboboxOption[])),
    ),
    { initialValue: [] as ComboboxOption[] },
  );

  protected readonly search: ComboboxSearch = (query) =>
    this.languages.search(query).pipe(map((items) => items.map(toOption)));
}

function toOption(language: { id: string; code: string }): ComboboxOption {
  return { id: language.id, label: language.code };
}
