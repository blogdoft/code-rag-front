import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no toasts', () => {
    const service = TestBed.inject(ToastService);
    expect(service.toasts()).toEqual([]);
  });

  it('adds a success toast', () => {
    const service = TestBed.inject(ToastService);
    service.success('Saved!');
    expect(service.toasts()).toEqual([{ id: 0, kind: 'success', message: 'Saved!' }]);
  });

  it('adds an error toast', () => {
    const service = TestBed.inject(ToastService);
    service.error('Boom');
    expect(service.toasts()).toEqual([{ id: 0, kind: 'error', message: 'Boom' }]);
  });

  it('assigns increasing ids to successive toasts', () => {
    const service = TestBed.inject(ToastService);
    service.success('first');
    service.error('second');
    expect(service.toasts().map((toast) => toast.id)).toEqual([0, 1]);
  });

  it('dismisses a toast by id without touching the others', () => {
    const service = TestBed.inject(ToastService);
    service.success('first');
    service.error('second');
    const [first] = service.toasts();

    service.dismiss(first.id);

    expect(service.toasts()).toEqual([{ id: 1, kind: 'error', message: 'second' }]);
  });

  it('auto-dismisses a toast after 5 seconds', () => {
    const service = TestBed.inject(ToastService);
    service.success('temp');
    expect(service.toasts().length).toBe(1);

    vi.advanceTimersByTime(5000);

    expect(service.toasts().length).toBe(0);
  });
});
