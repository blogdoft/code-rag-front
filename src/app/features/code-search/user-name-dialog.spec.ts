import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { UserNameDialog, type UserNameDialogData } from './user-name-dialog';

describe('UserNameDialog', () => {
  let fixture: ComponentFixture<UserNameDialog>;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let data: UserNameDialogData;

  function setup(): void {
    data = { name: signal('') };
    dialogRef = { close: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef },
      ],
    });
    fixture = TestBed.createComponent(UserNameDialog);
    fixture.detectChanges();
  }

  function confirmButton(): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Confirm',
    ) as HTMLButtonElement;
  }

  function cancelButton(): HTMLButtonElement {
    return Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (button) => (button as HTMLButtonElement).textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
  }

  it('renders the title', () => {
    setup();
    expect(fixture.nativeElement.querySelector('h2').textContent).toContain("What's your name?");
  });

  it('updates the injected signal as the name is typed', () => {
    setup();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = 'Ada Lovelace';
    input.dispatchEvent(new Event('input'));

    expect(data.name()).toBe('Ada Lovelace');
  });

  it('clears the name via Escape', () => {
    setup();
    data.name.set('Ada Lovelace');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(data.name()).toBe('');
  });

  it('disables Confirm while the name is blank or whitespace', () => {
    setup();
    expect(confirmButton().disabled).toBe(true);

    data.name.set('   ');
    fixture.detectChanges();
    expect(confirmButton().disabled).toBe(true);

    data.name.set('Ada Lovelace');
    fixture.detectChanges();
    expect(confirmButton().disabled).toBe(false);
  });

  it('closes with true when Confirm is clicked with a non-blank name', () => {
    setup();
    data.name.set('Ada Lovelace');
    fixture.detectChanges();

    confirmButton().click();

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('closes with false when Cancel is clicked', () => {
    setup();
    cancelButton().click();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
