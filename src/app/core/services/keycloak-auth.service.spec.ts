import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import type { AuthConfig } from './auth-config.service';
import { AuthConfigService } from './auth-config.service';
import { KeycloakAuthService } from './keycloak-auth.service';

const { keycloakConstructor, keycloakInstance } = vi.hoisted(() => {
  const keycloakInstance = {
    init: vi.fn().mockResolvedValue(true),
    logout: vi.fn(),
    login: vi.fn().mockResolvedValue(undefined),
    updateToken: vi.fn().mockResolvedValue(true),
    token: 'the-access-token',
    tokenParsed: { preferred_username: 'jdoe' } as Record<string, unknown>,
    onTokenExpired: undefined as (() => void) | undefined,
  };
  const keycloakConstructor = vi.fn().mockImplementation(function () {
    return keycloakInstance;
  });
  return { keycloakConstructor, keycloakInstance };
});

vi.mock('keycloak-js', () => ({ default: keycloakConstructor }));

describe('KeycloakAuthService', () => {
  let authConfigService: { get: ReturnType<typeof vi.fn> };

  function configure(config: AuthConfig): KeycloakAuthService {
    authConfigService = { get: vi.fn(() => of(config)) };
    TestBed.configureTestingModule({
      providers: [{ provide: AuthConfigService, useValue: authConfigService }],
    });
    return TestBed.inject(KeycloakAuthService);
  }

  beforeEach(() => {
    keycloakConstructor.mockClear();
    keycloakInstance.init.mockClear();
    keycloakInstance.logout.mockClear();
    keycloakInstance.login.mockClear();
    keycloakInstance.updateToken.mockReset().mockResolvedValue(true);
  });

  it('stays disabled and never constructs Keycloak when the config says disabled', async () => {
    const service = configure({ enabled: false, url: '', realm: '', clientId: '' });

    await service.init();

    expect(keycloakConstructor).not.toHaveBeenCalled();
    expect(service.enabled()).toBe(false);
    expect(service.token()).toBeUndefined();
  });

  it('initializes Keycloak with login-required + PKCE and exposes the username when enabled', async () => {
    const service = configure({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });

    await service.init();

    expect(keycloakConstructor).toHaveBeenCalledWith({
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
    expect(keycloakInstance.init).toHaveBeenCalledWith({
      onLoad: 'login-required',
      pkceMethod: 'S256',
      checkLoginIframe: false,
    });
    expect(service.enabled()).toBe(true);
    expect(service.username()).toBe('jdoe');
    expect(service.token()).toBe('the-access-token');
  });

  it('delegates logout() to the underlying Keycloak instance', async () => {
    const service = configure({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
    await service.init();

    service.logout();

    expect(keycloakInstance.logout).toHaveBeenCalled();
  });

  it('login() redirects through Keycloak once, however many 401s call it', async () => {
    const service = configure({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
    await service.init();

    service.login();
    service.login();

    expect(keycloakInstance.login).toHaveBeenCalledTimes(1);
  });

  it('login() is a no-op when Keycloak is disabled', async () => {
    const service = configure({ enabled: false, url: '', realm: '', clientId: '' });
    await service.init();

    service.login();

    expect(keycloakInstance.login).not.toHaveBeenCalled();
  });

  it('refreshToken() forces an update and shares one in-flight refresh', async () => {
    const service = configure({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
    await service.init();

    const [a, b] = await Promise.all([service.refreshToken(), service.refreshToken()]);

    expect(keycloakInstance.updateToken).toHaveBeenCalledTimes(1);
    expect(keycloakInstance.updateToken).toHaveBeenCalledWith(-1);
    expect(a).toBe('the-access-token');
    expect(b).toBe('the-access-token');
  });

  it('refreshToken() resolves undefined when the refresh fails', async () => {
    const service = configure({
      enabled: true,
      url: 'https://sso.example.com',
      realm: 'code-brain',
      clientId: 'front',
    });
    await service.init();
    keycloakInstance.updateToken.mockRejectedValue(new Error('session expired'));

    expect(await service.refreshToken()).toBeUndefined();
  });
});
