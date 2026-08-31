import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Combobox, type ComboboxOption } from './combobox';

@Component({
  imports: [Combobox],
  template: `<app-combobox
    label="Project"
    [options]="options()"
    [disabled]="disabled()"
    [(value)]="value"
    (selected)="onSelected($event)"
  />`,
})
class HostComponent {
  readonly options = signal<ComboboxOption[]>([
    { id: 1, label: 'alpha' },
    { id: 2, label: 'beta' },
  ]);
  readonly disabled = signal(false);
  value: number | null = null;
  selectedOption: ComboboxOption | null = null;

  onSelected(option: ComboboxOption): void {
    this.selectedOption = option;
  }
}

describe('Combobox', () => {
  let fixture: ComponentFixture<HostComponent>;
  let input: HTMLInputElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });

  function options(): HTMLLIElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('li[role="option"]'));
  }

  function focus(): void {
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
  }

  function type(text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function pressKey(key: string): void {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    fixture.detectChanges();
  }

  it('renders the label', () => {
    expect(fixture.nativeElement.querySelector('label').textContent).toContain('Project');
  });

  it('shows all options on focus', () => {
    focus();
    expect(options().length).toBe(2);
  });

  it('filters options as the user types', () => {
    focus();
    type('be');
    expect(options().length).toBe(1);
    expect(options()[0].textContent?.trim()).toBe('beta');
  });

  it('shows "No matches" when nothing matches the query', () => {
    focus();
    type('zzz');
    expect(fixture.nativeElement.textContent).toContain('No matches');
  });

  it('selects an option via mousedown and closes the list', () => {
    focus();
    options()[1].dispatchEvent(new Event('mousedown', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.value).toBe(2);
    expect(options().length).toBe(0);
  });

  it('navigates with ArrowDown and commits with Enter', () => {
    focus();
    pressKey('ArrowDown');
    pressKey('Enter');

    expect(fixture.componentInstance.value).toBe(2);
  });

  it('navigates backward with ArrowUp, wrapping to the last option', () => {
    focus();
    pressKey('ArrowUp');
    pressKey('Enter');

    expect(fixture.componentInstance.value).toBe(2);
  });

  it('reverts the query to the selected label on blur', async () => {
    focus();
    options()[0].dispatchEvent(new Event('mousedown', { bubbles: true }));
    fixture.detectChanges();

    focus();
    type('garbage');
    input.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(input.value).toBe('alpha');
  });

  it('clears the value via the Escape-clearable directive', () => {
    focus();
    options()[0].dispatchEvent(new Event('mousedown', { bubbles: true }));
    fixture.detectChanges();
    expect(input.value).toBe('alpha');

    pressKey('Escape');

    expect(fixture.componentInstance.value).toBeNull();
  });

  it('emits selected when an option is chosen via mousedown', () => {
    focus();
    options()[1].dispatchEvent(new Event('mousedown', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOption).toEqual({ id: 2, label: 'beta' });
  });

  it('emits selected when an option is chosen via keyboard', () => {
    focus();
    pressKey('ArrowDown');
    pressKey('Enter');

    expect(fixture.componentInstance.selectedOption).toEqual({ id: 2, label: 'beta' });
  });

  it('exposes a focus() method that focuses the input', () => {
    const combobox = fixture.debugElement.children[0].componentInstance as Combobox;
    combobox.focus();

    expect(document.activeElement).toBe(input);
  });

  it('marks the input disabled when the disabled input is true', () => {
    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    expect(input.disabled).toBe(true);
  });

  it('ignores ArrowDown/ArrowUp/Enter when no options match the query', () => {
    focus();
    type('zzz');

    pressKey('ArrowDown');
    pressKey('ArrowUp');
    pressKey('Enter');

    expect(fixture.componentInstance.value).toBeNull();
    expect(options().length).toBe(0);
  });
});
