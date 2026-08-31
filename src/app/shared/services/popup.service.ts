import { Dialog, type DialogConfig, type DialogRef } from '@angular/cdk/dialog';
import type { ComponentType } from '@angular/cdk/portal';
import { Injectable, inject } from '@angular/core';
import { PopupCoordinatorService } from '../../core/services/popup-coordinator.service';
import { ConfirmDialog, type ConfirmDialogData } from '../components/confirm-dialog/confirm-dialog';

export interface PopupOptions<D> extends Omit<DialogConfig<D>, 'disableClose' | 'providers'> {
  /** When present and returns true, an Escape-driven close confirms discarding changes first. */
  isDirty?: () => boolean;
}

/**
 * Opens popups through `@angular/cdk/dialog` while registering them with the
 * PopupCoordinatorService, so the app's single document-level Escape handler can
 * close the topmost popup per SPEC.md's rule (confirming discard when dirty).
 */
@Injectable({ providedIn: 'root' })
export class PopupService {
  private readonly dialog = inject(Dialog);
  private readonly coordinator = inject(PopupCoordinatorService);

  open<R = unknown, D = unknown, C = unknown>(
    component: ComponentType<C>,
    options: PopupOptions<D> = {},
  ): DialogRef<R, C> {
    const { isDirty, ...dialogConfig } = options;
    const ref = this.dialog.open<R, D, C>(component, {
      ariaModal: true,
      ...dialogConfig,
      disableClose: true,
    } as DialogConfig<D, DialogRef<R, C>>);

    const unregister = this.coordinator.register({
      close: () => this.requestClose(ref, isDirty),
    });
    ref.closed.subscribe(() => unregister());

    return ref;
  }

  private requestClose<R, C>(ref: DialogRef<R, C>, isDirty?: () => boolean): void {
    if (!isDirty?.()) {
      ref.close();
      return;
    }

    const confirmRef = this.open<boolean, ConfirmDialogData>(ConfirmDialog, {
      role: 'alertdialog',
      data: { message: 'You have unsaved changes. Discard them?' },
    });
    confirmRef.closed.subscribe((discard) => {
      if (discard) {
        ref.close();
      }
    });
  }
}
