import { Injectable } from '@angular/core';

export interface PopupRegistration {
  /**
   * Invoked when Escape targets this popup. Implementations decide for themselves
   * whether to confirm discarding unsaved changes before actually closing.
   */
  close(): void;
}

/**
 * Tracks the stack of currently open popups so a single document-level Escape
 * handler can implement SPEC.md's rule: close the topmost popup, confirming
 * discard first when it has unsaved changes.
 */
@Injectable({ providedIn: 'root' })
export class PopupCoordinatorService {
  private readonly stack: PopupRegistration[] = [];

  get hasOpenPopup(): boolean {
    return this.stack.length > 0;
  }

  register(registration: PopupRegistration): () => void {
    this.stack.push(registration);
    return () => {
      const index = this.stack.indexOf(registration);
      if (index !== -1) {
        this.stack.splice(index, 1);
      }
    };
  }

  /** Returns true if a popup was open and handled the Escape key. */
  handleEscape(): boolean {
    const top = this.stack.at(-1);
    if (!top) {
      return false;
    }
    top.close();
    return true;
  }
}
