import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { baseUrlInterceptor } from './core/interceptors/base-url.interceptor';
import { errorToastInterceptor } from './core/interceptors/error-toast.interceptor';
import { KeycloakAuthService } from './core/services/keycloak-auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([baseUrlInterceptor, errorToastInterceptor, authInterceptor]),
    ),
    // Blocks bootstrap on Keycloak login when enabled (redirects away and back); resolves
    // immediately when disabled - see .specs/2026-09-21-keycloak-conditional-login.md.
    provideAppInitializer(() => inject(KeycloakAuthService).init()),
  ],
};
