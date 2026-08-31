import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the nav bar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')?.textContent).toContain('CodeRAG');
    expect(compiled.querySelector('nav')?.textContent).toContain('Settings');
  });

  it('delegates document-level Escape key presses to the popup coordinator', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const coordinator = TestBed.inject(PopupCoordinatorService);
    const handleEscapeSpy = vi.spyOn(coordinator, 'handleEscape');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(handleEscapeSpy).toHaveBeenCalled();
  });
});
