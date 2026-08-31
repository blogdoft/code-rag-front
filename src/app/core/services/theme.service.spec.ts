import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

type MatchMediaStub = {
  matches: boolean;
  addEventListener: (type: string, listener: (event: { matches: boolean }) => void) => void;
};

describe('ThemeService', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    // @ts-expect-error cleanup of a test-only stub
    delete window.matchMedia;
  });

  function stubMatchMedia(matches: boolean): { changeHandler?: (event: { matches: boolean }) => void } {
    const state: { changeHandler?: (event: { matches: boolean }) => void } = {};
    const stub: MatchMediaStub = {
      matches,
      addEventListener: (_type, listener) => {
        state.changeHandler = listener;
      },
    };
    window.matchMedia = vi.fn().mockReturnValue(stub) as unknown as typeof window.matchMedia;
    return state;
  }

  it('applies the dark class when the OS prefers dark', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    service.init();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not apply the dark class when the OS prefers light', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    service.init();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts to OS theme changes registered after init', () => {
    const state = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.init();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    state.changeHandler?.({ matches: true });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does nothing when matchMedia is unavailable', () => {
    // jsdom does not implement matchMedia by default; init() must not throw.
    const service = TestBed.inject(ThemeService);

    expect(() => service.init()).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
