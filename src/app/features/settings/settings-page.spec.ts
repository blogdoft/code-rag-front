import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfigService } from '../../core/services/config.service';
import { ToastService } from '../../core/services/toast.service';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  let fixture: ComponentFixture<SettingsPage>;
  let configService: {
    apiBaseUrl: ReturnType<typeof vi.fn>;
    setApiBaseUrl: ReturnType<typeof vi.fn>;
    userName: ReturnType<typeof vi.fn>;
    setUserName: ReturnType<typeof vi.fn>;
    exportTimezone: ReturnType<typeof vi.fn>;
    setExportTimezone: ReturnType<typeof vi.fn>;
  };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  function setup(
    initialUrl = '',
    initialUserName = '',
    initialTimezone = 'America/Sao_Paulo',
  ): void {
    configService = {
      apiBaseUrl: vi.fn(() => initialUrl),
      setApiBaseUrl: vi.fn(),
      userName: vi.fn(() => initialUserName),
      setUserName: vi.fn(),
      exportTimezone: vi.fn(() => initialTimezone),
      setExportTimezone: vi.fn(),
    };
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

  function inputs(): HTMLInputElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('input'));
  }

  function urlInput(): HTMLInputElement {
    return inputs()[0];
  }

  function userNameInput(): HTMLInputElement {
    return inputs()[1];
  }

  function exportTimezoneInput(): HTMLInputElement {
    return inputs()[2];
  }

  function typeValue(el: HTMLInputElement, text: string): void {
    el.value = text;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('button'));
  }

  function saveUrl(): void {
    buttons()[0].click();
    fixture.detectChanges();
  }

  function saveUserName(): void {
    buttons()[1].click();
    fixture.detectChanges();
  }

  function saveExportTimezone(): void {
    buttons()[2].click();
    fixture.detectChanges();
  }

  it('initializes the field from the current config', () => {
    setup('https://example.com');
    expect(urlInput().value).toBe('https://example.com');
  });

  it('saves a valid absolute URL', () => {
    setup();
    typeValue(urlInput(), 'https://example.com');
    saveUrl();

    expect(configService.setApiBaseUrl).toHaveBeenCalledWith('https://example.com');
    expect(toastService.success).toHaveBeenCalledWith('API base URL saved.');
  });

  it('saves an empty value without validation', () => {
    setup('https://example.com');
    typeValue(urlInput(), '');
    saveUrl();

    expect(configService.setApiBaseUrl).toHaveBeenCalledWith('');
    expect(toastService.success).toHaveBeenCalled();
  });

  it('rejects an invalid URL and shows an error toast without saving', () => {
    setup();
    typeValue(urlInput(), 'not-a-url');
    saveUrl();

    expect(configService.setApiBaseUrl).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Enter a valid http(s) URL, or leave it empty to use this same origin.',
    );
  });

  it('rejects a non-http(s) URL scheme', () => {
    setup();
    typeValue(urlInput(), 'ftp://example.com');
    saveUrl();

    expect(configService.setApiBaseUrl).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalled();
  });

  it('clears the URL field via the Escape-clearable directive', () => {
    setup('https://example.com');

    urlInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(urlInput().value).toBe('');
  });

  it('initializes the name field from the current config', () => {
    setup('', 'Ada Lovelace');
    expect(userNameInput().value).toBe('Ada Lovelace');
  });

  it('saves the name', () => {
    setup();
    typeValue(userNameInput(), 'Ada Lovelace');
    saveUserName();

    expect(configService.setUserName).toHaveBeenCalledWith('Ada Lovelace');
    expect(toastService.success).toHaveBeenCalledWith('Name saved.');
  });

  it('clears the name field via the Escape-clearable directive', () => {
    setup('', 'Ada Lovelace');

    userNameInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(userNameInput().value).toBe('');
  });

  it('initializes the export timezone field from the current config', () => {
    setup('', '', 'America/Manaus');
    expect(exportTimezoneInput().value).toBe('America/Manaus');
  });

  it('saves a valid IANA export timezone', () => {
    setup();
    typeValue(exportTimezoneInput(), 'America/Rio_Branco');
    saveExportTimezone();

    expect(configService.setExportTimezone).toHaveBeenCalledWith('America/Rio_Branco');
    expect(toastService.success).toHaveBeenCalledWith('Export timezone saved.');
  });

  it('saves an empty export timezone without validation', () => {
    setup('', '', 'America/Sao_Paulo');
    typeValue(exportTimezoneInput(), '');
    saveExportTimezone();

    expect(configService.setExportTimezone).toHaveBeenCalledWith('');
    expect(toastService.success).toHaveBeenCalled();
  });

  it('rejects an export timezone that clearly is not an IANA name', () => {
    setup();
    typeValue(exportTimezoneInput(), 'brt');
    saveExportTimezone();

    expect(configService.setExportTimezone).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalledWith(
      'Enter a valid IANA timezone name (e.g. America/Sao_Paulo), or leave it empty for UTC.',
    );
  });

  it('clears the export timezone field via the Escape-clearable directive', () => {
    setup('', '', 'America/Manaus');

    exportTimezoneInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();

    expect(exportTimezoneInput().value).toBe('');
  });
});
