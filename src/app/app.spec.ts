import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';
import { VersionService } from './core/services/version.service';

describe('App', () => {
  let versionService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    versionService = { get: vi.fn(() => of('v1.2.3')) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: VersionService, useValue: versionService }],
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

  it('shows the app version fetched from VersionService, anchored to the top-right corner of the window', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(versionService.get).toHaveBeenCalled();
    const compiled = fixture.nativeElement as HTMLElement;
    const versionEl = Array.from(compiled.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('v1.2.3'),
    ) as HTMLElement;

    expect(versionEl.textContent?.trim()).toBe('Versão: v1.2.3');
    expect(versionEl.className).toContain('fixed');
    expect(versionEl.className).toContain('right-0');
    expect(versionEl.className).toContain('top-0');
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
