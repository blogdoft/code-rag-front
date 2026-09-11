import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CodeQueryResult } from '../../core/models/code-query-result';
import { ResultDetailDialog } from './result-detail-dialog';

describe('ResultDetailDialog', () => {
  let fixture: ComponentFixture<ResultDetailDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const result: CodeQueryResult = {
    id: 1,
    kind: 'method',
    symbolContainer: 'Billing.Services',
    symbolName: 'RetryPayment',
    symbolQualifiedName: 'Billing.Services.PaymentService.RetryPayment',
    symbolCanonicalName: 'RetryPayment(int, bool)',
    sourceFile: 'src/foo.ts',
    gitUrl: null,
    gitRawUrl: null,
    embeddingText: 'function bar() {\n  return 1;\n}',
    similarity: 0.876,
    rerankScore: 0.912,
    relations: [],
  };

  function setup(data: CodeQueryResult): void {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(ResultDetailDialog);
    fixture.detectChanges();
  }

  it('renders the source file, kind, container, name, canonical name, similarity, and rerank score', () => {
    setup(result);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('src/foo.ts');
    expect(text).toContain('method');
    expect(text).toContain('Billing.Services');
    expect(text).toContain('RetryPayment');
    expect(text).toContain('RetryPayment(int, bool)');
    expect(text).toContain('0.876');
    expect(text).toContain('0.912');
  });

  it('falls back to "Unknown file" when sourceFile is null', () => {
    setup({ ...result, sourceFile: null });
    expect(fixture.nativeElement.textContent).toContain('Unknown file');
  });

  it('omits the container and name segments when absent', () => {
    setup({ ...result, symbolContainer: null, symbolName: null, symbolCanonicalName: null });
    expect(fixture.nativeElement.textContent).not.toContain('Billing.Services');
    expect(fixture.nativeElement.textContent).not.toContain('RetryPayment');
  });

  it('omits the canonical name when it matches the short name', () => {
    setup({ ...result, symbolName: 'RetryPayment', symbolCanonicalName: 'RetryPayment' });
    const text = fixture.nativeElement.textContent as string;
    expect(text.match(/RetryPayment/g)?.length).toBe(1);
  });

  it('omits the rerank score segment when null', () => {
    setup({ ...result, rerankScore: null });
    expect(fixture.nativeElement.textContent).not.toContain('rerank');
  });

  it('preserves embedding text whitespace via a <pre> element', () => {
    setup(result);
    const pre = fixture.nativeElement.querySelector('pre');
    expect(pre?.textContent).toContain('function bar()');
  });

  it('renders no Relations section when there are none', () => {
    setup(result);
    expect(fixture.nativeElement.textContent).not.toContain('Relations');
  });

  it('renders a relation per entry, marking direction relative to this match', () => {
    setup({
      ...result,
      relations: [
        { fromId: 1, toId: 42, relationType: 'calls', targetSymbol: 'Charge', resolutionOrigin: 'static' },
        { fromId: 7, toId: 1, relationType: 'calls', targetSymbol: 'RetryPayment', resolutionOrigin: 'static' },
      ],
    });

    const items = fixture.nativeElement.querySelectorAll('ul li');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('→');
    expect(items[0].textContent).toContain('calls');
    expect(items[0].textContent).toContain('Charge');
    expect(items[1].textContent).toContain('←');
    expect(items[1].textContent).toContain('RetryPayment');
  });

  it('closes the dialog when the close button is clicked', () => {
    setup(result);
    fixture.nativeElement.querySelector('button[aria-label="Close"]').click();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('closes the dialog when the OK button is clicked', () => {
    setup(result);
    const okButton = Array.from(fixture.nativeElement.querySelectorAll('footer button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'OK',
    ) as HTMLButtonElement;

    okButton.click();

    expect(dialogRef.close).toHaveBeenCalled();
  });
});
