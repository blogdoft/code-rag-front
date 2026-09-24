const apiUrlInput = () => cy.get('input[placeholder="https://code-ciir-api.home.arpa"]');
const nameInput = () => cy.get('input[placeholder="Ada Lovelace"]');
const timezoneInput = () => cy.get('input[placeholder="America/Sao_Paulo"]');
const stored = (key: string) => cy.window().its('localStorage').invoke('getItem', key);

describe('Settings page', () => {
  beforeEach(() => {
    cy.stubBackend();
  });

  it('renders the API, Feedback and Appearance sections with their fields', () => {
    cy.visit('/settings');
    cy.contains('h1', 'API settings').should('be.visible');
    cy.contains('h1', 'Feedback').should('be.visible');
    cy.contains('h1', 'Appearance').should('be.visible');
    apiUrlInput().should('be.visible');
    nameInput().should('be.visible');
    timezoneInput().should('be.visible');
    cy.get('[role="radiogroup"][aria-label="Theme"] [role="radio"]').should('have.length', 3);
  });

  describe('API base URL', () => {
    it('defaults to empty (same origin) in dev', () => {
      cy.visit('/settings');
      apiUrlInput().should('have.value', '');
    });

    it('saves a valid URL on blur, toasts, and persists it', () => {
      cy.visit('/settings');
      apiUrlInput().type('https://api.example.com/');
      nameInput().click();
      cy.toast('API base URL saved.').should('be.visible');
      // trailing slash is stripped
      stored('code-rag.apiBaseUrl').should('eq', 'https://api.example.com');
    });

    it('saves on Enter', () => {
      cy.visit('/settings');
      apiUrlInput().type('http://localhost:5002{enter}');
      cy.toast('API base URL saved.').should('be.visible');
    });

    it('rejects a non-http(s) URL with an error toast and does not persist', () => {
      cy.visit('/settings');
      apiUrlInput().type('ftp://nope{enter}');
      cy.toast('Enter a valid http(s) URL').should('be.visible');
      stored('code-rag.apiBaseUrl').should('be.null');
    });

    it('rejects free text', () => {
      cy.visit('/settings');
      apiUrlInput().type('not a url{enter}');
      cy.toast('Enter a valid http(s) URL').should('be.visible');
    });

    it('does not toast when the value did not change', () => {
      cy.visit('/settings');
      apiUrlInput().focus().blur();
      cy.get('[role="status"]').should('not.exist');
    });

    it('Escape clears the field and persists the empty value', () => {
      cy.visit('/settings', {
        onBeforeLoad: (win) =>
          win.localStorage.setItem('code-rag.apiBaseUrl', 'https://api.example.com'),
      });
      apiUrlInput().should('have.value', 'https://api.example.com');
      apiUrlInput().type('{esc}');
      apiUrlInput().should('have.value', '');
      cy.toast('API base URL saved.').should('be.visible');
    });

    it('a saved base URL is applied to subsequent API calls', () => {
      cy.intercept('GET', 'https://api.example.com/api/indexer/projects*', {
        fixture: 'projects.json',
      }).as('remoteProjects');
      cy.visit('/settings');
      apiUrlInput().type('https://api.example.com{enter}');
      cy.toast('API base URL saved.').should('be.visible');
      cy.get('aside a[href="/projects"]').click();
      cy.wait('@remoteProjects');
      cy.get('tbody tr').should('have.length', 3);
    });
  });

  describe('Feedback identity', () => {
    it('saves the user name and toasts', () => {
      cy.visit('/settings');
      nameInput().type('Ada Lovelace{enter}');
      cy.toast('Name saved.').should('be.visible');
      stored('code-rag.userName').should('eq', 'Ada Lovelace');
    });

    it('trims the name', () => {
      cy.visit('/settings');
      nameInput().type('  Ada  ');
      timezoneInput().click();
      stored('code-rag.userName').should('eq', 'Ada');
    });

    it('is pre-filled from storage and Escape clears + saves', () => {
      cy.visit('/settings', {
        onBeforeLoad: (win) => win.localStorage.setItem('code-rag.userName', 'Grace'),
      });
      nameInput().should('have.value', 'Grace');
      nameInput().type('{esc}');
      nameInput().should('have.value', '');
      cy.toast('Name saved.').should('be.visible');
    });

    it('defaults the export timezone to America/Sao_Paulo', () => {
      cy.visit('/settings');
      timezoneInput().should('have.value', 'America/Sao_Paulo');
    });

    it('saves a valid IANA timezone', () => {
      cy.visit('/settings');
      timezoneInput().clear().type('America/Manaus{enter}');
      cy.toast('Export timezone saved.').should('be.visible');
      stored('code-rag.exportTimezone').should('eq', 'America/Manaus');
    });

    it('accepts UTC', () => {
      cy.visit('/settings');
      timezoneInput().clear().type('UTC{enter}');
      cy.toast('Export timezone saved.').should('be.visible');
    });

    ['brt', '-03:00', 'America', 'Sao Paulo'].forEach((bad) => {
      it(`rejects "${bad}" as a timezone`, () => {
        cy.visit('/settings');
        timezoneInput().clear().type(`${bad}{enter}`);
        cy.toast('Enter a valid IANA timezone name').should('be.visible');
      });
    });

    it('Escape clears the timezone (meaning UTC) and persists', () => {
      cy.visit('/settings');
      timezoneInput().type('{esc}');
      timezoneInput().should('have.value', '');
      cy.toast('Export timezone saved.').should('be.visible');
      stored('code-rag.exportTimezone').should('eq', '');
    });
  });

  describe('Appearance', () => {
    const radio = (label: string) => cy.contains('[role="radio"]', label);

    it('defaults to "Match device"', () => {
      cy.visit('/settings');
      radio('Match device').should('have.attr', 'aria-checked', 'true');
      radio('Light').should('have.attr', 'aria-checked', 'false');
    });

    it('Dark applies the dark class immediately and persists', () => {
      cy.visit('/settings');
      radio('Dark').click();
      cy.get('html').should('have.class', 'dark');
      radio('Dark').should('have.attr', 'aria-checked', 'true');
      cy.toast('Theme updated.').should('be.visible');
      stored('code-rag.theme').should('eq', 'dark');
    });

    it('Light removes the dark class', () => {
      cy.visit('/settings', {
        onBeforeLoad: (win) => win.localStorage.setItem('code-rag.theme', 'dark'),
      });
      cy.get('html').should('have.class', 'dark');
      radio('Light').click();
      cy.get('html').should('not.have.class', 'dark');
    });

    it('the choice survives a reload', () => {
      cy.visit('/settings');
      radio('Dark').click();
      cy.reload();
      cy.get('html').should('have.class', 'dark');
      radio('Dark').should('have.attr', 'aria-checked', 'true');
    });
  });
});
