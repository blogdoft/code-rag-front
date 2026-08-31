import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CodeQueryResult } from '../../core/models/code-query-result';
import { ResultDetailDialog } from './result-detail-dialog';

describe('ResultDetailDialog', () => {
  let fixture: ComponentFixture<ResultDetailDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  const result: CodeQueryResult = {
    id: 1,
    sourceFile: 'src/foo.ts',
    kind: 'method',
    typeName: 'Foo',
    member: 'bar',
    embeddingText: 'function bar() {\n  return 1;\n}',
    similarity: 0.876,
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

  it('renders the source file, kind, type name, member, and similarity', () => {
    setup(result);
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('src/foo.ts');
    expect(text).toContain('method');
    expect(text).toContain('Foo');
    expect(text).toContain('bar');
    expect(text).toContain('0.876');
  });

  it('falls back to "Unknown file" when sourceFile is null', () => {
    setup({ ...result, sourceFile: null });
    expect(fixture.nativeElement.textContent).toContain('Unknown file');
  });

  it('omits the type name and member segments when absent', () => {
    setup({ ...result, typeName: null, member: null });
    expect(fixture.nativeElement.textContent).not.toContain('Foo');
  });

  it('preserves embedding text whitespace via a <pre> element', () => {
    setup(result);
    const pre = fixture.nativeElement.querySelector('pre');
    expect(pre?.textContent).toContain('function bar()');
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
