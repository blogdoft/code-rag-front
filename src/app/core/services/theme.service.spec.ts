import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

type MatchMediaStub = {
  matches: boolean;
  addEventListener: (type: string, listener: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, listener: (event: { matches: boolean }) => void) => void;
};

describe('ThemeService', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark');
    // @ts-expect-error cleanup of a test-only stub
    delete window.matchMedia;
  });

  function stubMatchMedia(matches: boolean): {
    changeHandler?: (event: { matches: boolean }) => void;
    removeEventListener: ReturnType<typeof vi.fn>;
  } {
    const state: {
      changeHandler?: (event: { matches: boolean }) => void;
      removeEventListener: ReturnType<typeof vi.fn>;
    } = {
      removeEventListener: vi.fn(() => {
        state.changeHandler = undefined;
      }),
    };
    const stub: MatchMediaStub = {
      matches,
      addEventListener: (_type, listener) => {
        state.changeHandler = listener;
      },
      removeEventListener: state.removeEventListener as MatchMediaStub['removeEventListener'],
    };
    window.matchMedia = vi.fn().mockReturnValue(stub) as unknown as typeof window.matchMedia;
    return state;
  }

  it('applies dark for the "dark" preference regardless of the OS setting', () => {
    stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);

    service.apply('dark');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies light for the "light" preference regardless of the OS setting', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    service.apply('light');

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('follows the OS preference for "system"', () => {
    stubMatchMedia(true);
    const service = TestBed.inject(ThemeService);

    service.apply('system');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('reacts to OS theme changes while "system" is selected', () => {
    const state = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.apply('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    state.changeHandler?.({ matches: true });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stops reacting to OS theme changes after switching away from "system"', () => {
    const state = stubMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.apply('system');

    service.apply('light');

    expect(state.removeEventListener).toHaveBeenCalled();
    state.changeHandler?.({ matches: true });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('does nothing when matchMedia is unavailable', () => {
    // jsdom does not implement matchMedia by default; apply() must not throw.
    const service = TestBed.inject(ThemeService);

    expect(() => service.apply('system')).not.toThrow();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
