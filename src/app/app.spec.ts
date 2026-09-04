import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { ApiVersionService } from './core/services/api-version.service';
import { PopupCoordinatorService } from './core/services/popup-coordinator.service';
import { VersionService } from './core/services/version.service';

@Component({ selector: 'app-stub-page', template: '' })
class StubPage {}

describe('App', () => {
  let versionService: { get: ReturnType<typeof vi.fn> };
  let apiVersionService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    versionService = { get: vi.fn(() => of('v1.2.3')) };
    apiVersionService = { get: vi.fn(() => of('0.1.3-1')) };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: 'rag', component: StubPage },
          { path: 'projects', component: StubPage },
          { path: 'reports', component: StubPage },
          { path: 'settings', component: StubPage },
        ]),
        { provide: VersionService, useValue: versionService },
        { provide: ApiVersionService, useValue: apiVersionService },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand name and a navigation menu toggle button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('nav')?.textContent).toContain('CodeRAG');
    expect(compiled.querySelector('nav button[aria-label="Toggle navigation menu"]')).not.toBeNull();
  });

  it('renders the sidebar expanded (with labels) by default', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-56');
    expect(aside.textContent).toContain('Rag');
  });

  it('collapses the sidebar to icons-only when the toggle button is clicked', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const toggleButton = fixture.nativeElement.querySelector(
      'button[aria-label="Toggle navigation menu"]',
    ) as HTMLButtonElement;

    toggleButton.click();
    await fixture.whenStable();

    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-16');
    expect(aside.querySelector('nav')?.textContent?.trim()).toBe('');
  });

  it('collapses the sidebar when clicking anywhere outside it', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-16');
  });

  it('does not collapse the sidebar when clicking a link inside it', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const link = fixture.nativeElement.querySelector('aside nav a') as HTMLAnchorElement;
    link.click();
    await fixture.whenStable();

    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.className).toContain('w-56');
  });

  it('passes the front and API versions fetched from their services down to the sidebar', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(versionService.get).toHaveBeenCalled();
    expect(apiVersionService.get).toHaveBeenCalled();
    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
    expect(aside.textContent).toContain('v1.2.3');
    expect(aside.textContent).toContain('0.1.3-1');
  });

  it('delegates document-level Escape key presses to the popup coordinator', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const coordinator = TestBed.inject(PopupCoordinatorService);
    const handleEscapeSpy = vi.spyOn(coordinator, 'handleEscape');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

    expect(handleEscapeSpy).toHaveBeenCalled();
  });

  describe('on a mobile viewport', () => {
    function stubMobileMatchMedia(): void {
      window.matchMedia = vi
        .fn()
        .mockReturnValue({ matches: true, addEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
    }

    afterEach(() => {
      // @ts-expect-error cleanup of a test-only stub
      delete window.matchMedia;
    });

    it('starts with the sidebar hidden', async () => {
      stubMobileMatchMedia();
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();

      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      expect(aside.className).toContain('hidden');
    });

    it('shows the sidebar as a full-screen overlay when the toggle button is clicked', async () => {
      stubMobileMatchMedia();
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const toggleButton = fixture.nativeElement.querySelector(
        'button[aria-label="Toggle navigation menu"]',
      ) as HTMLButtonElement;

      toggleButton.click();
      await fixture.whenStable();

      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      expect(aside.className).not.toContain('hidden');
      expect(aside.className).toContain('fixed');
      expect(aside.className).toContain('inset-x-0');
      expect(aside.className).toContain('w-full');
    });

    it('hides the sidebar again after navigating to a link', async () => {
      stubMobileMatchMedia();
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      fixture.nativeElement.querySelector('button[aria-label="Toggle navigation menu"]').click();
      await fixture.whenStable();

      const link = fixture.nativeElement.querySelector('aside nav a') as HTMLAnchorElement;
      link.click();
      await fixture.whenStable();

      const aside = fixture.nativeElement.querySelector('aside') as HTMLElement;
      expect(aside.className).toContain('hidden');
    });
  });
});
