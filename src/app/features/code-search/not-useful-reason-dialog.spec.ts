import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NotUsefulReasonDialog, type NotUsefulReasonDialogData } from './not-useful-reason-dialog';

describe('NotUsefulReasonDialog', () => {
  let fixture: ComponentFixture<NotUsefulReasonDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let data: NotUsefulReasonDialogData;

  function setup(): void {
    data = { reason: signal('') };
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(NotUsefulReasonDialog);
    fixture.detectChanges();
  }

  it('renders the title', () => {
    setup();
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain(
      "Why weren't these results helpful?",
    );
  });

  it('updates the injected signal as the reason is typed', () => {
    setup();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    textarea.value = 'Wrong file';
    textarea.dispatchEvent(new Event('input'));

    expect(data.reason()).toBe('Wrong file');
  });

  it('clears the reason via Escape', () => {
    setup();
    data.reason.set('Wrong file');
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(data.reason()).toBe('');
  });

  it('closes with true when Confirm is clicked', () => {
    setup();
    const confirmButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Confirm',
    ) as HTMLButtonElement;

    confirmButton.click();

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false when Cancel is clicked', () => {
    setup();
    const cancelButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;

    cancelButton.click();

    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
