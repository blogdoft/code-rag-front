import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  input,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap, type Observable } from 'rxjs';

export interface ComboboxOption {
  id: string;
  label: string;
}

/** Given the text the user typed so far, returns the matching options (SPEC.md 7.1). */
export type ComboboxSearch = (query: string) => Observable<ComboboxOption[]>;

/** How long typing pauses before a search request is fired (SPEC.md 7.1's "debounce"). */
const SEARCH_DEBOUNCE_MS = 300;

let nextComboboxId = 0;

@Component({
  selector: 'app-combobox',
  templateUrl: './combobox.html',
  host: {
    class: 'block relative',
  },
})
export class Combobox {
  readonly search = input.required<ComboboxSearch>();
  /** Options always offered alongside search results (e.g. an "All projects" entry). */
  readonly seedOptions = input<ComboboxOption[]>([]);
  readonly label = input('');
  readonly placeholder = input('Type to search...');
  readonly disabled = input(false);

  readonly value = model<string | null>(null);
  readonly selected = output<ComboboxOption>();

  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly query$ = new Subject<string>();
  // Labels survive past the search response that produced them, so a value set before this
  // conversation (or a value the current search no longer matches) can still be displayed.
  private readonly knownLabels = signal<Record<string, string>>({});

  protected readonly query = signal('');
  protected readonly isOpen = signal(false);
  protected readonly isSearching = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly listboxId = `combobox-listbox-${nextComboboxId++}`;
  protected readonly searchResults = signal<ComboboxOption[]>([]);

  protected readonly options = computed(() => [...this.seedOptions(), ...this.searchResults()]);

  protected readonly displayValue = computed(() =>
    this.isOpen() ? this.query() : this.currentValueLabel(),
  );

  constructor() {
    effect(() => this.rememberLabels(this.seedOptions()));

    this.query$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((query) => this.search()(query)),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((results) => {
        this.searchResults.set(results);
        this.rememberLabels(results);
        this.isSearching.set(false);
      });
  }

  protected onFocus(): void {
    // Start from an empty query so the full option list is browsable again on
    // refocus, instead of being pre-filtered down to the current selection.
    this.query.set('');
    this.isOpen.set(true);
    this.activeIndex.set(0);
    this.runSearch('');
  }

  protected onInput(text: string): void {
    // Once the text is edited, it no longer represents the previously selected
    // option. A blank input is therefore an explicit "no selection" state too.
    this.value.set(null);
    this.query.set(text);
    this.isOpen.set(true);
    this.activeIndex.set(0);
    this.runSearch(text);
  }

  protected onBlur(): void {
    // Deferred so a click on an option (which also fires blur) can commit first.
    setTimeout(() => {
      this.isOpen.set(false);
      this.query.set(this.currentValueLabel());
    });
  }

  protected onArrowDown(event: Event): void {
    event.preventDefault();
    const count = this.options().length;
    if (count === 0) return;
    this.isOpen.set(true);
    this.activeIndex.update((index) => (index + 1) % count);
  }

  protected onArrowUp(event: Event): void {
    event.preventDefault();
    const count = this.options().length;
    if (count === 0) return;
    this.isOpen.set(true);
    this.activeIndex.update((index) => (index - 1 + count) % count);
  }

  protected onEnter(event: Event): void {
    const option = this.options()[this.activeIndex()];
    if (!option) return;
    event.preventDefault();
    this.select(option);
  }

  protected select(option: ComboboxOption): void {
    this.value.set(option.id);
    this.rememberLabels([option]);
    this.query.set(option.label);
    this.isOpen.set(false);
    this.selected.emit(option);
  }

  /**
   * SPEC.md 7.1: a single Escape press closes the options list (if open) and
   * clears the value, together, rather than needing two separate presses.
   * When there's nothing open and nothing to clear, the event is left alone so
   * it bubbles up to the document-level popup handler (SPEC.md section 4).
   */
  protected onEscape(event: Event): void {
    if (this.disabled()) {
      return;
    }
    const hasSomethingToClear = this.value() !== null || this.query() !== '';
    if (!this.isOpen() && !hasSomethingToClear) {
      return;
    }
    event.stopPropagation();
    this.isOpen.set(false);
    this.clear();
  }

  focus(): void {
    this.inputElement().nativeElement.focus();
  }

  protected clear(): void {
    this.value.set(null);
    this.query.set('');
  }

  private runSearch(query: string): void {
    this.isSearching.set(true);
    // Cleared eagerly, not just replaced once results arrive, so a still-pending debounced request
    // never leaves the previous query's now-stale results on screen.
    this.searchResults.set([]);
    this.query$.next(query);
  }

  private currentValueLabel(): string {
    const id = this.value();
    return id === null ? '' : (this.knownLabels()[id] ?? '');
  }

  private rememberLabels(options: ComboboxOption[]): void {
    if (options.length === 0) {
      return;
    }
    this.knownLabels.update((labels) => {
      const next = { ...labels };
      for (const option of options) {
        next[option.id] = option.label;
      }
      return next;
    });
  }
}
