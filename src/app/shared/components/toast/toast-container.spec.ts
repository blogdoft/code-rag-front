import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ToastService } from '../../../core/services/toast.service';
import { ToastContainer } from './toast-container';

describe('ToastContainer', () => {
  let fixture: ComponentFixture<ToastContainer>;
  let toastService: ToastService;

  beforeEach(() => {
    fixture = TestBed.createComponent(ToastContainer);
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it('renders nothing when there are no toasts', () => {
    expect(fixture.nativeElement.querySelectorAll('[role="status"]').length).toBe(0);
  });

  it('renders a toast for each entry with success/error styling', () => {
    toastService.success('Saved!');
    toastService.error('Failed!');
    fixture.detectChanges();

    const toasts = fixture.nativeElement.querySelectorAll('[role="status"]');
    expect(toasts.length).toBe(2);
    expect(toasts[0].textContent).toContain('Saved!');
    expect(toasts[0].classList.contains('bg-emerald-600')).toBe(true);
    expect(toasts[1].textContent).toContain('Failed!');
    expect(toasts[1].classList.contains('bg-rose-600')).toBe(true);
  });

  it('dismisses a toast when its close button is clicked', () => {
    toastService.success('Saved!');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button[aria-label="Dismiss notification"]').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('[role="status"]').length).toBe(0);
  });
});
