import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PopupCoordinatorService } from '../../core/services/popup-coordinator.service';
import { ConfirmDialog } from '../components/confirm-dialog/confirm-dialog';
import { PopupService } from './popup.service';

@Component({ template: '<p>dummy</p>' })
class DummyDialogComponent {}

describe('PopupService', () => {
  let service: PopupService;
  let coordinator: PopupCoordinatorService;
  let dialog: Dialog;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PopupService);
    coordinator = TestBed.inject(PopupCoordinatorService);
    dialog = TestBed.inject(Dialog);
  });

  afterEach(() => {
    dialog.closeAll();
  });

  it('registers the popup with the coordinator when opened', () => {
    service.open(DummyDialogComponent);
    expect(coordinator.hasOpenPopup).toBe(true);
  });

  it('unregisters the popup once it closes', () => {
    const ref = service.open(DummyDialogComponent);

    ref.close();

    expect(coordinator.hasOpenPopup).toBe(false);
  });

  it('closes immediately on Escape when not dirty', () => {
    const ref = service.open(DummyDialogComponent);
    const closeSpy = vi.spyOn(ref, 'close');

    coordinator.handleEscape();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('opens a confirm dialog on Escape when dirty, instead of closing right away', () => {
    const ref = service.open(DummyDialogComponent, { isDirty: () => true });
    const closeSpy = vi.spyOn(ref, 'close');

    coordinator.handleEscape();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(dialog.openDialogs.length).toBe(2);
  });

  it('closes the original popup once the discard confirmation is accepted', () => {
    const ref = service.open(DummyDialogComponent, { isDirty: () => true });
    const closeSpy = vi.spyOn(ref, 'close');

    coordinator.handleEscape();
    const confirmDialogRef = dialog.openDialogs.at(-1);
    (confirmDialogRef?.componentInstance as ConfirmDialog | null)?.['confirm']();

    expect(closeSpy).toHaveBeenCalled();
  });

  it('keeps the original popup open when the discard confirmation is cancelled', () => {
    const ref = service.open(DummyDialogComponent, { isDirty: () => true });
    const closeSpy = vi.spyOn(ref, 'close');

    coordinator.handleEscape();
    const confirmDialogRef = dialog.openDialogs.at(-1);
    (confirmDialogRef?.componentInstance as ConfirmDialog | null)?.['cancel']();

    expect(closeSpy).not.toHaveBeenCalled();
  });
});
