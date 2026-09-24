/// <reference types="cypress" />

export const PROJECT_IDS = {
  billing: '11111111-1111-4111-8111-111111111111',
  orders: '22222222-2222-4222-8222-222222222222',
  legacy: '33333333-3333-4333-8333-333333333333',
} as const;

export interface BackendStubs {
  /** Body for GET /api/indexer/projects; defaults to the `projects` fixture. */
  projects?: object;
  /** Status code for GET /api/indexer/projects (default 200). */
  projectsStatus?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Stubs every backend call the app can make, so specs never depend on the real gateway. */
      stubBackend(stubs?: BackendStubs): Chainable<void>;
      /** Types into a project combobox and picks the option with the given label. */
      pickProject(label: string): Chainable<void>;
      /** Returns the toast (role=status) that contains `text`. */
      toast(text: string | RegExp): Chainable<JQuery<HTMLElement>>;
      /** Returns the CDK dialog/overlay panel currently on top. */
      dialog(): Chainable<JQuery<HTMLElement>>;
    }
  }
}

Cypress.Commands.add('stubBackend', (stubs: BackendStubs = {}) => {
  // Registered first = lowest priority: Cypress matches the most recently defined intercept first.
  // Anything the spec forgot to stub fails loudly instead of leaking to the real gateway.
  cy.intercept({ pathname: '/api/**' }, (req) => {
    req.reply({
      statusCode: 599,
      headers: { 'content-type': 'application/problem+json' },
      body: {
        title: 'UNSTUBBED',
        detail: `E2E: unstubbed request ${req.method} ${req.url}`,
        status: 599,
      },
    });
  }).as('unstubbed');

  cy.intercept('GET', '**/auth-config.json', {
    body: { enabled: false, url: '', realm: '', clientId: '' },
  }).as('authConfig');
  cy.intercept('GET', '**/version.json', { body: { version: '1.2.3-front' } }).as('frontVersion');
  cy.intercept('GET', '/version', { body: { version: '9.8.7-api' } }).as('apiVersion');

  const projectsReply = stubs.projects
    ? { statusCode: stubs.projectsStatus ?? 200, body: stubs.projects }
    : stubs.projectsStatus
      ? {
          statusCode: stubs.projectsStatus,
          headers: { 'content-type': 'application/problem+json' },
          body: { title: 'Boom', detail: 'projects exploded', status: stubs.projectsStatus },
        }
      : { fixture: 'projects.json' };
  cy.intercept({ method: 'GET', pathname: '/api/indexer/projects' }, projectsReply).as('projects');
});

Cypress.Commands.add('pickProject', (label: string) => {
  cy.get('input[role="combobox"]').first().clear().type(label);
  cy.get('[role="listbox"] [role="option"]').contains(label).click();
});

Cypress.Commands.add('toast', (text: string | RegExp) =>
  cy.get('[role="status"]').contains(text).parents('[role="status"]').first(),
);

Cypress.Commands.add('dialog', () => cy.get('.cdk-overlay-container .cdk-dialog-container').last());

export {};
