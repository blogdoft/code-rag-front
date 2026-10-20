import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MetadataEditor } from './metadata-editor';

describe('MetadataEditor', () => {
  let fixture: ComponentFixture<MetadataEditor>;
  let el: HTMLElement;

  function setup(value: Record<string, unknown>) {
    fixture = TestBed.createComponent(MetadataEditor);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const current = () => fixture.componentInstance.value();
  const error = () => fixture.componentInstance.validationError();
  const keys = () => Array.from(el.querySelectorAll<HTMLInputElement>('input[aria-label="Key"]'));
  const values = () =>
    Array.from(el.querySelectorAll<HTMLInputElement>('input[aria-label="Value"]'));
  const button = (text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

  function type(input: HTMLInputElement | HTMLTextAreaElement, text: string) {
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function changeType(select: HTMLSelectElement, value: string) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('shows each existing value in a field of its own type and leaves the object untouched', () => {
    const value = { name: 'x', year: 2024, active: true, nested: { a: [1, 2] }, none: null };
    setup(value);

    expect(keys().map((k) => k.value)).toEqual(['name', 'year', 'active', 'nested', 'none']);
    const types = Array.from(el.querySelectorAll<HTMLSelectElement>('select[aria-label="Type"]'));
    expect(types.map((t) => t.value)).toEqual(['text', 'number', 'boolean', 'json', 'json']);
    expect(current()).toEqual(value);
    expect(error()).toBeNull();
  });

  it('keeps a numeric string as text and a number as a number', () => {
    setup({ code: '57', model: 57 });

    expect(current()).toEqual({ code: '57', model: 57 });
    expect(typeof current()['code']).toBe('string');
    expect(typeof current()['model']).toBe('number');
  });

  it('adds a typed field', () => {
    setup({});

    button('Add field').click();
    fixture.detectChanges();
    type(keys()[0], 'edition');
    changeType(el.querySelector<HTMLSelectElement>('select[aria-label="Type"]')!, 'number');
    type(values()[0], '4.5');

    expect(current()).toEqual({ edition: 4.5 });
  });

  it('removes a field', () => {
    setup({ a: 1, b: 2 });

    el.querySelector<HTMLButtonElement>('button[aria-label="Remove field"]')!.click();
    fixture.detectChanges();

    expect(current()).toEqual({ b: 2 });
  });

  it('flags an invalid number and keeps the last valid value', () => {
    setup({ year: 2024 });

    type(values()[0], 'abc');

    expect(error()).toBe('Value of "year" must be a number.');
    expect(current()).toEqual({ year: 2024 });
  });

  it('flags duplicate and blank keys', () => {
    setup({ a: 1, b: 2 });

    type(keys()[1], 'a');
    expect(error()).toBe('Key "a" is used more than once.');

    type(keys()[1], ' ');
    expect(error()).toBe('Every metadata field needs a Key.');
  });

  it('round-trips through the JSON mode without changing types', () => {
    const value = { name: 'x', year: 2024, nested: { a: 1 } };
    setup(value);

    button('Edit as JSON').click();
    fixture.detectChanges();
    const textarea = el.querySelector('textarea')!;
    expect(JSON.parse(textarea.value)).toEqual(value);

    type(textarea, '{ "extra": false }');
    expect(current()).toEqual({ extra: false });

    button('Edit as fields').click();
    fixture.detectChanges();
    expect(keys().map((k) => k.value)).toEqual(['extra']);
  });

  it('rejects JSON that is not an object', () => {
    setup({});
    button('Edit as JSON').click();
    fixture.detectChanges();

    type(el.querySelector('textarea')!, '[1, 2]');

    expect(error()).toBe('Metadata must be a JSON object.');
  });
});
