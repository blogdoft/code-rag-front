import { TestBed } from '@angular/core/testing';
import { PopupCoordinatorService } from './popup-coordinator.service';

describe('PopupCoordinatorService', () => {
  it('has no open popup initially', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    expect(service.hasOpenPopup).toBe(false);
  });

  it('reports an open popup after registering one', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    service.register({ close: vi.fn() });
    expect(service.hasOpenPopup).toBe(true);
  });

  it('handleEscape closes only the topmost popup and returns true', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    service.register({ close: closeFirst });
    service.register({ close: closeSecond });

    const handled = service.handleEscape();

    expect(handled).toBe(true);
    expect(closeSecond).toHaveBeenCalled();
    expect(closeFirst).not.toHaveBeenCalled();
  });

  it('handleEscape returns false when nothing is open', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    expect(service.handleEscape()).toBe(false);
  });

  it('unregister removes a popup from the stack', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    const unregister = service.register({ close: vi.fn() });

    unregister();

    expect(service.hasOpenPopup).toBe(false);
  });

  it('unregister is a no-op when called twice', () => {
    const service = TestBed.inject(PopupCoordinatorService);
    const unregister = service.register({ close: vi.fn() });
    unregister();

    expect(() => unregister()).not.toThrow();
    expect(service.hasOpenPopup).toBe(false);
  });
});
