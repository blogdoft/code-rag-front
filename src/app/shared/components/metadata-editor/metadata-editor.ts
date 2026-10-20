import { Component, OnInit, computed, effect, input, model, signal } from '@angular/core';

type ValueType = 'text' | 'number' | 'boolean' | 'json';

interface Row {
  id: number;
  key: string;
  type: ValueType;
  /** Raw text of a `text`, `number` or `json` value. */
  text: string;
  /** Value of a `boolean` row. */
  bool: boolean;
}

type Result = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
type RowResult = { ok: true; value: unknown } | { ok: false; error: string };

const TYPE_OPTIONS: readonly { value: ValueType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'json', label: 'JSON' },
];

let nextRowId = 0;

/**
 * Edits a free-form JSON object as a list of fields instead of raw JSON. Every field carries an
 * explicit type, so a value keeps the exact type it has in the object - `57` stays a number and
 * `"57"` stays text - and nothing is guessed from what the user typed. Objects, arrays and `null`
 * are edited as JSON in their own field, and "Edit as JSON" swaps the whole editor for a textarea.
 *
 * `value` always holds the last valid object; `validationError` is set (and `value` left alone)
 * while the fields don't form one.
 */
@Component({
  selector: 'app-metadata-editor',
  templateUrl: './metadata-editor.html',
  host: { class: 'block' },
})
export class MetadataEditor implements OnInit {
  readonly label = input('Metadata');
  readonly disabled = input(false);
  readonly value = model<Record<string, unknown>>({});
  readonly validationError = model<string | null>(null);

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly rows = signal<Row[]>([]);
  protected readonly mode = signal<'fields' | 'json'>('fields');
  protected readonly jsonText = signal('');
  /** Inputs only arrive after construction, so nothing is emitted before the initial value is read. */
  private readonly initialized = signal(false);

  private readonly result = computed<Result>(() =>
    this.mode() === 'fields' ? fromRows(this.rows()) : fromJson(this.jsonText()),
  );

  protected readonly error = computed(() => {
    const result = this.result();
    return result.ok ? null : result.error;
  });

  constructor() {
    effect(() => {
      if (!this.initialized()) {
        return;
      }
      const result = this.result();
      if (result.ok) {
        this.value.set(result.value);
        this.validationError.set(null);
      } else {
        this.validationError.set(result.error);
      }
    });
  }

  ngOnInit(): void {
    this.rows.set(Object.entries(this.value()).map(([key, value]) => toRow(key, value)));
    this.initialized.set(true);
  }

  protected addRow(): void {
    this.rows.update((rows) => [
      ...rows,
      { id: nextRowId++, key: '', type: 'text', text: '', bool: false },
    ]);
  }

  protected removeRow(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }

  protected patchRow(id: number, patch: Partial<Row>): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  /** Re-expresses the current value in the new type where it can, so switching doesn't lose it. */
  protected changeType(row: Row, type: ValueType): void {
    const current = rowValue(row);
    if (type === 'json') {
      this.patchRow(row.id, {
        type,
        text: current.ok ? JSON.stringify(current.value, null, 2) : row.text,
      });
    } else if (type === 'boolean') {
      this.patchRow(row.id, { type, bool: current.ok && current.value === true });
    } else {
      const scalar = current.ok && typeof current.value !== 'object';
      this.patchRow(row.id, { type, text: scalar ? String(current.value) : '' });
    }
  }

  protected toggleMode(): void {
    const result = this.result();
    if (this.mode() === 'fields') {
      if (result.ok) {
        this.jsonText.set(
          Object.keys(result.value).length ? JSON.stringify(result.value, null, 2) : '',
        );
        this.mode.set('json');
      }
      return;
    }
    if (result.ok) {
      this.rows.set(Object.entries(result.value).map(([key, value]) => toRow(key, value)));
      this.mode.set('fields');
    }
  }
}

function toRow(key: string, value: unknown): Row {
  const base = { id: nextRowId++, key, bool: false };
  switch (typeof value) {
    case 'string':
      return { ...base, type: 'text', text: value };
    case 'number':
      return { ...base, type: 'number', text: String(value) };
    case 'boolean':
      return { ...base, type: 'boolean', text: '', bool: value };
    default:
      return { ...base, type: 'json', text: JSON.stringify(value, null, 2) ?? 'null' };
  }
}

function rowValue(row: Row): RowResult {
  switch (row.type) {
    case 'text':
      return { ok: true, value: row.text };
    case 'boolean':
      return { ok: true, value: row.bool };
    case 'number': {
      const text = row.text.trim();
      const number = Number(text);
      return text !== '' && Number.isFinite(number)
        ? { ok: true, value: number }
        : { ok: false, error: `Value of "${row.key}" must be a number.` };
    }
    case 'json':
      try {
        return { ok: true, value: JSON.parse(row.text) as unknown };
      } catch {
        return { ok: false, error: `Value of "${row.key}" is not valid JSON.` };
      }
  }
}

function fromRows(rows: Row[]): Result {
  const value: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (!key) {
      return { ok: false, error: 'Every metadata field needs a Key.' };
    }
    if (key in value) {
      return { ok: false, error: `Key "${key}" is used more than once.` };
    }
    const parsed = rowValue({ ...row, key });
    if (!parsed.ok) {
      return parsed;
    }
    value[key] = parsed.value;
  }
  return { ok: true, value };
}

function fromJson(text: string): Result {
  if (!text.trim()) {
    return { ok: true, value: {} };
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: 'Metadata must be a JSON object.' };
    }
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, error: 'Metadata is not valid JSON.' };
  }
}
