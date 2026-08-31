import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let configService: { apiBaseUrl: ReturnType<typeof vi.fn>; setApiBaseUrl: ReturnType<typeof vi.fn> };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  function setup(initialUrl = ''): void {
    configService = { apiBaseUrl: vi.fn(() => initialUrl), setApiBaseUrl: vi.fn() };
    toastService = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfigService, useValue: configService },
        { provide: ToastService, useValue: toastService },
      ],
    });
    fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
  }

  function input(): HTMLInputElement {
    return fixture.nativeElement.querySelector('input');
  }

  function typeValue(text: string): void {
    input().value = text;
    input().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function save(): void {
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
  }

  it('initializes the field from the current config', () => {
    setup('https://example.com');
    expect(input().value).toBe('https://example.com');
  });

  it('saves a valid absolute URL', () => {
    setup();
    typeValue('https://example.com');
    save();

    expect(configService.setApiBaseUrl).toHaveBeenCalledWith('https://example.com');
    expect(toastService.success).toHaveBeenCalledWith('API base URL saved.');
  });

  it('saves an empty value without validation', () => {
    setup('https://example.com');
    typeValue('');
    save();

    expect(configService.setApiBaseUrl).toHaveBeenCalledWith('');
    expect(toastService.success).toHaveBeenCalled();
  });

  it('rejects an invalid URL and shows an error toast without saving', () => {
    setup();
    typeValue('not-a-url');
    save();

    expect(configService.setApiBaseUrl).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Enter a valid http(s) URL, or leave it empty to use this same origin.',
    );
  });

  it('rejects a non-http(s) URL scheme', () => {
    setup();
    typeValue('ftp://example.com');
    save();

    expect(configService.setApiBaseUrl).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalled();
  });

  it('clears the field via the Escape-clearable directive', () => {
    setup('https://example.com');

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(input().value).toBe('');
  });
});
