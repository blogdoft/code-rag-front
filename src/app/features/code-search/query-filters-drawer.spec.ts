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
      kind: signal(''),
      qualifiedName: signal({ operator: 'contains', value: '' }),
      qualifiedNameOperators: ['equals', 'contains', 'not_contains'],
      minSimilarity: signal(null),
      limit: signal(null),
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

  it('renders the qualified-name operator select with only its valid operator set', () => {
    setup();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(['equals', 'contains', 'not_contains']);
  });

  it('updates the kind signal immediately as a value is typed', () => {
    setup();
    const kindInput = fixture.nativeElement.querySelector('input[placeholder="e.g. method"]') as HTMLInputElement;

    kindInput.value = 'method';
    kindInput.dispatchEvent(new Event('input'));

    expect(data.kind()).toBe('method');
  });

  it('updates the qualifiedName signal immediately when the value or operator changes', () => {
    setup();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    const valueInput = fixture.nativeElement.querySelector(
      'input[placeholder="e.g. *Controller*"]',
    ) as HTMLInputElement;

    select.value = 'equals';
    select.dispatchEvent(new Event('change'));
    expect(data.qualifiedName()).toEqual({ operator: 'equals', value: '' });

    valueInput.value = 'PaymentService';
    valueInput.dispatchEvent(new Event('input'));
    expect(data.qualifiedName()).toEqual({ operator: 'equals', value: 'PaymentService' });
  });

  it('clears the kind field via Escape', () => {
    setup();
    data.kind.set('method');
    fixture.detectChanges();
    const kindInput = fixture.nativeElement.querySelector('input[placeholder="e.g. method"]') as HTMLInputElement;

    kindInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(data.kind()).toBe('');
  });

  it('updates minSimilarity and limit from their number inputs, treating a blank value as null', () => {
    setup();
    const minSimilarityInput = fixture.nativeElement.querySelector(
      'input[placeholder="0.0 - 1.0"]',
    ) as HTMLInputElement;
    const limitInput = fixture.nativeElement.querySelector('input[placeholder="10 (default)"]') as HTMLInputElement;

    minSimilarityInput.value = '0.5';
    minSimilarityInput.dispatchEvent(new Event('input'));
    expect(data.minSimilarity()).toBe(0.5);

    limitInput.value = '25';
    limitInput.dispatchEvent(new Event('input'));
    expect(data.limit()).toBe(25);

    minSimilarityInput.value = '';
    minSimilarityInput.dispatchEvent(new Event('input'));
    expect(data.minSimilarity()).toBeNull();
  });

  it('closes without altering the filters when Filter is clicked', () => {
    setup();
    data.kind.set('method');

    const filterButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Filter',
    ) as HTMLButtonElement;
    filterButton.click();

    expect(data.kind()).toBe('method');
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('resets all four fields to their default and closes when Clear is clicked', () => {
    setup();
    data.kind.set('method');
    data.qualifiedName.set({ operator: 'not_contains', value: 'Legacy' });
    data.minSimilarity.set(0.5);
    data.limit.set(25);

    const clearButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Clear',
    ) as HTMLButtonElement;
    clearButton.click();

    expect(data.kind()).toBe('');
    expect(data.qualifiedName()).toEqual({ operator: 'contains', value: '' });
    expect(data.minSimilarity()).toBeNull();
    expect(data.limit()).toBeNull();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('closes when the header close button is clicked', () => {
    setup();
    fixture.nativeElement.querySelector('button[aria-label="Close"]').click();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
