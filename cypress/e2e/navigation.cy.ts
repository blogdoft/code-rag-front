describe('Shell & navigation', () => {
  beforeEach(() => {
    cy.stubBackend();
  });

  it('boots without console errors and renders the top bar + home', () => {
    cy.visit('/', {
      onBeforeLoad: (win) => cy.spy(win.console, 'error').as('consoleError'),
    });
    cy.contains('nav a', 'code-brain').should('be.visible');
    cy.contains('h1', 'Welcome to code-brain').should('be.visible');
    cy.get('@consoleError').should('not.have.been.called');
  });

  it('shows front and API versions in the sidebar footer', () => {
    cy.visit('/');
    cy.get('aside').should('contain.text', '1.2.3-front').and('contain.text', '9.8.7-api');
  });

  it('degrades silently when /version fails', () => {
    cy.intercept('GET', '/version', { statusCode: 401 });
    cy.visit('/');
    cy.get('aside').should('contain.text', '1.2.3-front').and('not.contain.text', '9.8.7-api');
    cy.get('[role="status"]').should('not.exist');
  });

  it('does not show the logout button when Keycloak is disabled', () => {
    cy.visit('/');
    cy.contains('button', 'Sair').should('not.exist');
  });

  const pages = [
    { link: 'Rag', path: '/rag', marker: 'Question' },
    { link: 'Projects', path: '/projects', marker: 'Add project' },
    { link: 'Upload', path: '/uploads', marker: 'Upload CIIR file' },
    { link: 'Reports', path: '/reports', marker: 'Feedback stats' },
    { link: 'Settings', path: '/settings', marker: 'API settings' },
  ];

  pages.forEach(({ link, path, marker }) => {
    it(`sidebar link "${link}" navigates to ${path}`, () => {
      cy.visit('/');
      cy.get('aside').contains('a', link).click();
      cy.location('pathname').should('eq', path);
      cy.contains(marker).should('be.visible');
      cy.get('aside a[href="' + path + '"]').should('have.class', 'bg-sky-50');
    });

    it(`home quick link "${link}" navigates to ${path}`, () => {
      cy.visit('/');
      cy.get('main a[href="' + path + '"]').click();
      cy.location('pathname').should('eq', path);
      cy.contains(marker).should('be.visible');
    });

    it(`deep link ${path} loads directly`, () => {
      cy.visit(path);
      cy.contains(marker).should('be.visible');
    });
  });

  it('redirects unknown routes to home', () => {
    cy.visit('/does-not-exist');
    cy.location('pathname').should('eq', '/');
    cy.contains('h1', 'Welcome to code-brain').should('be.visible');
  });

  it('brand link returns to home', () => {
    cy.visit('/settings');
    cy.contains('nav a', 'code-brain').click();
    cy.location('pathname').should('eq', '/');
  });

  describe('sidebar toggle', () => {
    it('collapses to icons when the menu button is toggled and when clicking outside', () => {
      cy.visit('/');
      cy.get('aside').contains('span', 'Settings').should('be.visible');
      cy.get('button[aria-label="Toggle navigation menu"]').click();
      cy.get('aside').contains('span', 'Settings').should('not.exist');
      cy.get('button[aria-label="Toggle navigation menu"]').click();
      cy.get('aside').contains('span', 'Settings').should('be.visible');
      cy.contains('h1', 'Welcome to code-brain').click();
      cy.get('aside').contains('span', 'Settings').should('not.exist');
    });

    it('starts collapsed on a phone-sized viewport and closes after navigating', () => {
      cy.viewport(390, 800);
      cy.visit('/');
      cy.get('aside').contains('span', 'Settings').should('not.exist');
      cy.get('button[aria-label="Toggle navigation menu"]').click();
      cy.get('aside').contains('a', 'Projects').click();
      cy.location('pathname').should('eq', '/projects');
      cy.get('aside').contains('span', 'Projects').should('not.exist');
    });
  });

  describe('theme', () => {
    it('applies the stored dark theme on boot', () => {
      cy.visit('/', {
        onBeforeLoad: (win) => win.localStorage.setItem('code-rag.theme', 'dark'),
      });
      cy.get('html').should('have.class', 'dark');
    });

    it('applies the stored light theme on boot', () => {
      cy.visit('/', {
        onBeforeLoad: (win) => win.localStorage.setItem('code-rag.theme', 'light'),
      });
      cy.get('html').should('not.have.class', 'dark');
    });
  });
});

describe('auth-config.json', () => {
  it('falls back to disabled (app still renders) when auth-config.json is broken', () => {
    cy.stubBackend();
    cy.intercept('GET', '**/auth-config.json', { statusCode: 500, body: 'nope' });
    cy.visit('/');
    cy.contains('h1', 'Welcome to code-brain').should('be.visible');
  });

  it('the checked-in public/auth-config.json is well-formed (unstubbed dev asset)', () => {
    // NOTE: with `enabled: true` a plain `npm start` sends the browser to Keycloak before the app
    // renders; every other spec stubs this file so the suite never depends on a login.
    cy.request('/auth-config.json')
      .its('body')
      .then((body) => {
        expect(body).to.have.all.keys('enabled', 'url', 'realm', 'clientId');
        expect(body.enabled).to.be.a('boolean');
        if (body.enabled) {
          expect(body.url, 'keycloak url').to.match(/^https?:\/\//);
          expect(body.realm, 'realm').to.not.be.empty;
          expect(body.clientId, 'clientId').to.not.be.empty;
        }
      });
  });
});
