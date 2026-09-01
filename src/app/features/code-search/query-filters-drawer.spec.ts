import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { QueryFiltersDrawer, type QueryFiltersDrawerData } from './query-filters-drawer';

describe('QueryFiltersDrawer', () => {
  let fixture: ComponentFixture<QueryFiltersDrawer>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let data: QueryFiltersDrawerData;

  function setup(): void {
    data = {
      kindFilter: signal({ operator: 'contains', value: '' }),
      namespaceFilter: signal({ operator: 'contains', value: '' }),
      typeNameFilter: signal({ operator: 'contains', value: '' }),
      kindOperators: ['contains', 'equals', 'not_equals'],
      namespaceOperators: ['contains', 'not_contains', 'equals', 'not_equals'],
      typeNameOperators: ['contains', 'not_contains', 'equals'],
    };
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(QueryFiltersDrawer);
    fixture.detectChanges();
  }

  it('renders each field with only its valid operator set', () => {
    setup();
    const selects = fixture.nativeElement.querySelectorAll('select');

    const optionValues = (select: HTMLSelectElement) => Array.from(select.options).map((o) => o.value);
    expect(optionValues(selects[0])).toEqual(['contains', 'not_contains', 'equals', 'not_equals']);
    expect(optionValues(selects[1])).toEqual(['contains', 'equals', 'not_equals']);
    expect(optionValues(selects[2])).toEqual(['contains', 'not_contains', 'equals']);
  });

  it('updates the injected signal immediately as a value is typed', () => {
    setup();
    const kindInput = fixture.nativeElement.querySelector('input[placeholder="e.g. fun*"]') as HTMLInputElement;

    kindInput.value = 'method';
    kindInput.dispatchEvent(new Event('input'));

    expect(data.kindFilter()).toEqual({ operator: 'contains', value: 'method' });
  });

  it('updates the injected signal immediately when the operator changes', () => {
    setup();
    const kindSelect = fixture.nativeElement.querySelectorAll('select')[1] as HTMLSelectElement;

    kindSelect.value = 'equals';
    kindSelect.dispatchEvent(new Event('change'));

    expect(data.kindFilter()).toEqual({ operator: 'equals', value: '' });
  });

  it('clears a field value via Escape', () => {
    setup();
    data.kindFilter.set({ operator: 'contains', value: 'method' });
    fixture.detectChanges();
    const kindInput = fixture.nativeElement.querySelector('input[placeholder="e.g. fun*"]') as HTMLInputElement;

    kindInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(data.kindFilter()).toEqual({ operator: 'contains', value: '' });
  });

  it('closes without altering the filters when Filter is clicked', () => {
    setup();
    data.kindFilter.set({ operator: 'equals', value: 'method' });

    const filterButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Filter',
    ) as HTMLButtonElement;
    filterButton.click();

    expect(data.kindFilter()).toEqual({ operator: 'equals', value: 'method' });
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('resets all three filters to their default and closes when Clear is clicked', () => {
    setup();
    data.kindFilter.set({ operator: 'equals', value: 'method' });
    data.namespaceFilter.set({ operator: 'not_contains', value: 'Legacy' });
    data.typeNameFilter.set({ operator: 'contains', value: '*Controller' });

    const clearButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Clear',
    ) as HTMLButtonElement;
    clearButton.click();

    expect(data.kindFilter()).toEqual({ operator: 'contains', value: '' });
    expect(data.namespaceFilter()).toEqual({ operator: 'contains', value: '' });
    expect(data.typeNameFilter()).toEqual({ operator: 'contains', value: '' });
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('closes when the header close button is clicked', () => {
    setup();
    fixture.nativeElement.querySelector('button[aria-label="Close"]').click();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
