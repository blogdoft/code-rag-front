import { Component, ElementRef, computed, model, output, signal, input, viewChild } from '@angular/core';
import { EscClearableDirective } from '../../directives/esc-clearable.directive';

export interface ComboboxOption {
  id: number;
  label: string;
}

let nextComboboxId = 0;

@Component({
  selector: 'app-combobox',
  imports: [EscClearableDirective],
  templateUrl: './combobox.html',
  host: {
    class: 'block relative',
  },
})
export class Combobox {
  readonly options = input<ComboboxOption[]>([]);
  readonly label = input('');
  readonly placeholder = input('Type to search...');
  readonly disabled = input(false);

  readonly value = model<number | null>(null);
  readonly selected = output<ComboboxOption>();

  private readonly inputElement = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly isOpen = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly listboxId = `combobox-listbox-${nextComboboxId++}`;

  protected readonly filteredOptions = computed(() => {
    const search = this.query().trim().toLowerCase();
    if (!search) {
      return this.options();
    }
    return this.options().filter((option) => option.label.toLowerCase().includes(search));
  });

  protected readonly displayValue = computed(() => {
    if (this.isOpen()) {
      return this.query();
    }
    const selected = this.options().find((option) => option.id === this.value());
    return selected?.label ?? '';
  });

  protected onFocus(): void {
    // Start from an empty query so the full option list is browsable again on
    // refocus, instead of being pre-filtered down to the current selection.
    this.query.set('');
    this.isOpen.set(true);
    this.activeIndex.set(0);
  }

  protected onInput(text: string): void {
    this.query.set(text);
    this.isOpen.set(true);
    this.activeIndex.set(0);
  }

  protected onBlur(): void {
    // Deferred so a click on an option (which also fires blur) can commit first.
    setTimeout(() => {
      this.isOpen.set(false);
      this.query.set(this.selectedLabel());
    });
  }

  protected onArrowDown(event: Event): void {
    event.preventDefault();
    const count = this.filteredOptions().length;
    if (count === 0) return;
    this.isOpen.set(true);
    this.activeIndex.update((index) => (index + 1) % count);
  }

  protected onArrowUp(event: Event): void {
    event.preventDefault();
    const count = this.filteredOptions().length;
    if (count === 0) return;
    this.isOpen.set(true);
    this.activeIndex.update((index) => (index - 1 + count) % count);
  }

  protected onEnter(event: Event): void {
    const option = this.filteredOptions()[this.activeIndex()];
    if (!option) return;
    event.preventDefault();
    this.select(option);
  }

  protected select(option: ComboboxOption): void {
    this.value.set(option.id);
    this.query.set(option.label);
    this.isOpen.set(false);
    this.selected.emit(option);
  }

  focus(): void {
    this.inputElement().nativeElement.focus();
  }

  protected clear(): void {
    this.value.set(null);
    this.query.set('');
  }

  private selectedLabel(): string {
    return this.options().find((option) => option.id === this.value())?.label ?? '';
  }
}
