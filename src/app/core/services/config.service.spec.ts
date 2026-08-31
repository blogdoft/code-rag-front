import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to an empty base URL when nothing is stored', () => {
    const service = TestBed.inject(ConfigService);
    expect(service.apiBaseUrl()).toBe('');
  });

  it('reads a previously stored base URL on construction', () => {
    localStorage.setItem('code-rag.apiBaseUrl', 'https://example.com');
    const service = TestBed.inject(ConfigService);
    expect(service.apiBaseUrl()).toBe('https://example.com');
  });

  it('trims whitespace and trailing slashes when saving', () => {
    const service = TestBed.inject(ConfigService);
    service.setApiBaseUrl('  https://example.com/// ');
    expect(service.apiBaseUrl()).toBe('https://example.com');
    expect(localStorage.getItem('code-rag.apiBaseUrl')).toBe('https://example.com');
  });

  it('persists an empty value', () => {
    const service = TestBed.inject(ConfigService);
    service.setApiBaseUrl('   ');
    expect(service.apiBaseUrl()).toBe('');
    expect(localStorage.getItem('code-rag.apiBaseUrl')).toBe('');
  });
});
