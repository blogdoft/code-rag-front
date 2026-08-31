import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmDialog } from './confirm-dialog';

describe('ConfirmDialog', () => {
  let fixture: ComponentFixture<ConfirmDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    dialogRef = { close: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: { message: 'Discard unsaved changes?' } },
        { provide: DialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(ConfirmDialog);
    fixture.detectChanges();
  });

  function findButton(text: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const button = buttons.find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`No button with text "${text}"`);
    return button;
  }

  it('renders the confirmation message', () => {
    expect(fixture.nativeElement.textContent).toContain('Discard unsaved changes?');
  });

  it('closes with true when the discard button is clicked', () => {
    findButton('Discard changes').click();
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false when the cancel button is clicked', () => {
    findButton('Cancel').click();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
