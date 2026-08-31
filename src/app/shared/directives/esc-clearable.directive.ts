import { Directive, input, output } from '@angular/core';

/**
 * Implements the field-level half of SPEC.md's Escape rule: when the host field
 * currently holds a value, Escape clears it and stops the event from bubbling to
 * the document-level popup handler. When the field is already empty (or disabled),
 * the event is left alone so it can bubble up and be treated as "not editable".
 */
@Directive({
  selector: '[appEscClearable]',
  host: {
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class EscClearableDirective {
  readonly value = input<unknown>(null, { alias: 'appEscClearable' });
  readonly disabled = input(false, { alias: 'appEscClearableDisabled' });
  readonly cleared = output<void>();

  onEscape(event: Event): void {
    if (this.disabled() || isEmpty(this.value())) {
      return;
    }
    event.stopPropagation();
    this.cleared.emit();
  }
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}
