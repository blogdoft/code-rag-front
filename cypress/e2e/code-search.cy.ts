import { PROJECT_IDS } from '../support/commands';

const projectInput = () => cy.get('input[role="combobox"]');
const questionBox = () => cy.get('textarea[placeholder^="Where is the retry logic"]');
const askButton = () => cy.contains('button', /^\s*(Ask|Asking\.\.\.)\s*$/);
const filtersButton = () => cy.contains('button', 'Filters');
const entries = () => cy.get('section article');

const visitRag = () => {
  cy.visit('/rag');
  cy.wait('@projects');
  // the open combobox list overlaps the question box; focus is only released on blur
  cy.get('[role="listbox"] [role="option"]').should('have.length.greaterThan', 0);
};

const closeCombobox = () => {
  projectInput().blur();
  cy.get('[role="listbox"]').should('not.exist');
};

const visitWithProject = (project = 'billing-service') => {
  cy.visit('/rag');
  cy.wait('@projects');
  cy.pickProject(project);
};

const asStoredUser = (name = 'Grace') => visitRagAs(name);

const visitRagAs = (name: string) => {
  cy.visit('/rag', { onBeforeLoad: (win) => win.localStorage.setItem('code-rag.userName', name) });
  cy.wait('@projects');
  cy.pickProject('billing-service');
};

const ask = (question = 'where is the retry logic?') => {
  questionBox().clear().type(question);
  askButton().click();
};

describe('Code search page (/rag)', () => {
  beforeEach(() => {
    cy.stubBackend();
    cy.intercept('POST', '/api/code-queries', { fixture: 'code-query.json' }).as('ask');
  });

  describe('initial state', () => {
    it('focuses the project combobox and disables Ask until there is a question', () => {
      visitRag();
      projectInput().should('have.focus');
      askButton().should('be.disabled');
      closeCombobox();
      questionBox().type('   ');
      askButton().should('be.disabled');
      questionBox().type('real question');
      askButton().should('be.enabled');
    });

    it('shows no history and no filter badge', () => {
      visitRag();
      closeCombobox();
      entries().should('not.exist');
      filtersButton().find('span').should('not.exist');
    });
  });

  describe('project combobox', () => {
    it('opens on focus listing all projects', () => {
      visitRag();
      cy.get('[role="listbox"] [role="option"]').should('have.length', 3);
    });

    it('filters options by substring (case-insensitive)', () => {
      visitRag();
      projectInput().type('ORD');
      cy.get('[role="option"]').should('have.length', 1).and('contain.text', 'orders-api');
    });

    it('shows "No matches" when nothing matches', () => {
      visitRag();
      projectInput().type('zzz');
      cy.contains('No matches').should('be.visible');
    });

    it('selecting an option by click fills the field and moves focus to the question', () => {
      visitWithProject('orders-api');
      projectInput().should('have.value', 'orders-api');
      questionBox().should('have.focus');
    });

    it('supports keyboard selection (ArrowDown + Enter)', () => {
      visitRag();
      projectInput().type('{downarrow}{enter}');
      projectInput().should('have.value', 'orders-api');
    });

    it('reverts free text that is not a real option on blur', () => {
      visitRag();
      projectInput().type('not-a-project');
      questionBox().click();
      projectInput().should('have.value', '');
    });

    it('Escape clears a chosen project', () => {
      visitWithProject();
      projectInput().focus();
      cy.get('[role="listbox"]').should('exist');
      projectInput().type('bill');
      projectInput().type('{esc}');
      projectInput().should('have.value', '');
    });
  });

  describe('asking a question', () => {
    it('POSTs camelCase body with the selected project UUID and shows a history card', () => {
      visitWithProject();
      ask();
      cy.wait('@ask').its('request.body').should('deep.equal', {
        question: 'where is the retry logic?',
        projectId: PROJECT_IDS.billing,
      });
      entries().should('have.length', 1);
      entries()
        .first()
        .should('contain.text', 'billing-service')
        .and('contain.text', 'where is the retry logic?');
    });

    it('renders a row per result with kind, qualified name and rerank percentage', () => {
      visitWithProject();
      ask();
      cy.get('tbody tr').should('have.length', 2);
      cy.contains('tbody tr', 'Billing.PaymentGateway')
        .should('contain.text', 'class')
        .and('contain.text', '88%');
      cy.contains('tbody tr', 'RetryFailedPayments')
        .should('contain.text', 'method')
        .and('contain.text', '42%');
    });

    // CLAUDE.md: "Results arrive pre-sorted by the API ... CodeQueriesService.ask() must not re-sort
    // them; doing so would silently discard reranking."
    it('keeps the order the API returned (does not re-sort by rerankScore)', () => {
      visitWithProject();
      ask();
      cy.get('tbody tr').eq(0).should('contain.text', 'RetryFailedPayments');
      cy.get('tbody tr').eq(1).should('contain.text', 'Billing.PaymentGateway');
    });

    it('omits projectId and labels the card "All projects" when no project is chosen', () => {
      visitRag();
      closeCombobox();
      ask();
      cy.wait('@ask')
        .its('request.body')
        .should('deep.equal', { question: 'where is the retry logic?' });
      entries().first().should('contain.text', 'All projects');
      entries().first().should('not.contain.text', 'Was this helpful?');
    });

    it('Ctrl+Enter submits from the question box', () => {
      visitWithProject();
      questionBox().type('via shortcut{ctrl}{enter}');
      cy.wait('@ask');
      entries().should('have.length', 1);
    });

    it('Ctrl+Enter does nothing when the question is blank', () => {
      visitRag();
      closeCombobox();
      questionBox().type('{ctrl}{enter}');
      cy.get('@ask.all').should('have.length', 0);
    });

    it('shows "Asking..." and disables the button while the request is in flight', () => {
      cy.intercept('POST', '/api/code-queries', (req) => {
        req.reply({ fixture: 'code-query.json', delay: 800 });
      }).as('slowAsk');
      visitWithProject();
      ask();
      askButton().should('contain.text', 'Asking...').and('be.disabled');
      cy.wait('@slowAsk');
      askButton().should('contain.text', 'Ask').and('not.be.disabled');
    });

    it('stacks the newest question on top and keeps older ones', () => {
      visitWithProject();
      ask('first question');
      entries().should('have.length', 1);
      ask('second question');
      entries().should('have.length', 2);
      entries().eq(0).should('contain.text', 'second question');
      entries().eq(1).should('contain.text', 'first question');
    });

    it('closes a single history card with its × button', () => {
      visitWithProject();
      ask('first question');
      ask('second question');
      entries().eq(0).find('button[aria-label="Close"]').click();
      entries().should('have.length', 1).and('contain.text', 'first question');
    });

    it('shows "No results." for an empty match list', () => {
      cy.intercept('POST', '/api/code-queries', { body: { matches: [], graph: {} } });
      visitWithProject();
      ask();
      cy.contains('No results.').should('be.visible');
    });

    it('tolerates matches: null', () => {
      cy.intercept('POST', '/api/code-queries', { body: { matches: null } });
      visitWithProject();
      ask();
      cy.contains('No results.').should('be.visible');
    });

    it('toasts the API detail on a 404 and re-enables Ask', () => {
      cy.intercept('POST', '/api/code-queries', {
        statusCode: 404,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'Not found', detail: 'Project not found.', status: 404 },
      });
      visitWithProject();
      ask();
      cy.toast('Project not found.').should('be.visible');
      askButton().should('be.enabled');
      entries().should('not.exist');
    });

    it('toasts a generic message on a network error', () => {
      cy.intercept('POST', '/api/code-queries', { forceNetworkError: true });
      visitWithProject();
      ask();
      cy.toast('Something went wrong talking to the API').should('be.visible');
    });

    it('Escape in the question box clears it', () => {
      visitRag();
      closeCombobox();
      questionBox().type('draft');
      questionBox().type('{esc}');
      questionBox().should('have.value', '');
      askButton().should('be.disabled');
    });

    it('links to the repository only for projects with a git url', () => {
      visitWithProject('billing-service');
      ask();
      entries()
        .first()
        .find('a[aria-label="Open repository in a new tab"]')
        .should('have.attr', 'href', 'https://forgejo.home.arpa/acme/billing-service')
        .and('have.attr', 'target', '_blank');
      cy.pickProject('orders-api');
      ask('other');
      entries().first().find('a[aria-label="Open repository in a new tab"]').should('not.exist');
    });

    it('renders the raw-file link only for results that have one, without opening the dialog', () => {
      visitWithProject();
      ask();
      cy.contains('tbody tr', 'RetryFailedPayments')
        .find('a')
        .should('have.attr', 'href')
        .and('include', '/raw/branch/main/src/Billing/PaymentRetryService.cs');
      cy.contains('tbody tr', 'Billing.PaymentGateway').find('a').should('not.exist');
      // stop the new tab from actually opening
      cy.contains('tbody tr', 'RetryFailedPayments')
        .find('a')
        .invoke('attr', 'target', '_self')
        .invoke('attr', 'href', '#raw')
        .click();
      cy.get('.cdk-dialog-container').should('not.exist');
    });
  });

  describe('filters drawer', () => {
    it('opens with the four controls and no badge', () => {
      visitRag();
      closeCombobox();
      filtersButton().click();
      cy.dialog().within(() => {
        cy.contains('p', 'Filters');
        cy.get('input[placeholder="e.g. method"]').should('exist');
        cy.get('select').should('exist');
        cy.get('input[placeholder="e.g. *Controller*"]').should('exist');
        cy.get('input[placeholder="0.0 - 1.0"]').should('exist');
        cy.get('input[placeholder="10 (default)"]').should('exist');
      });
    });

    it('offers the three qualified-name operators, defaulting to "contains"', () => {
      visitRag();
      closeCombobox();
      filtersButton().click();
      cy.dialog()
        .find('select option')
        .then(($o) => {
          expect([...$o].map((o) => o.textContent?.trim())).to.deep.equal([
            'equals',
            'contains',
            'not contains',
          ]);
        });
      cy.dialog().find('select').should('have.value', 'contains');
    });

    it('applies every filter to the request body and shows chips + badge', () => {
      visitWithProject();
      filtersButton().click();
      cy.dialog().within(() => {
        cy.get('input[placeholder="e.g. method"]').type('method');
        cy.get('select').select('not contains');
        cy.get('input[placeholder="e.g. *Controller*"]').type('*Test*');
        cy.get('input[placeholder="0.0 - 1.0"]').type('0.35');
        cy.get('input[placeholder="10 (default)"]').type('5');
        cy.contains('button', 'Filter').click();
      });
      cy.get('.cdk-dialog-container').should('not.exist');
      filtersButton().should('contain.text', '2');
      ask();
      cy.wait('@ask')
        .its('request.body')
        .should('deep.equal', {
          question: 'where is the retry logic?',
          projectId: PROJECT_IDS.billing,
          kind: 'method',
          qualifiedName: { operator: 'notContains', value: '*Test*' },
          minSimilarity: 0.35,
          limit: 5,
        });
      entries()
        .first()
        .should('contain.text', 'kind "method"')
        .and('contain.text', 'qualified name not contains "*Test*"');
    });

    it('the header × also applies/closes, keeping the values', () => {
      visitWithProject();
      filtersButton().click();
      cy.dialog().find('input[placeholder="e.g. method"]').type('class');
      cy.dialog().find('button[aria-label="Close"]').click();
      filtersButton().click();
      cy.dialog().find('input[placeholder="e.g. method"]').should('have.value', 'class');
    });

    it('Clear resets everything and closes', () => {
      visitWithProject();
      filtersButton().click();
      cy.dialog().find('input[placeholder="e.g. method"]').type('method');
      cy.dialog().find('input[placeholder="10 (default)"]').type('7');
      cy.dialog().contains('button', 'Clear').click();
      cy.get('.cdk-dialog-container').should('not.exist');
      ask();
      cy.wait('@ask').its('request.body').should('deep.equal', {
        question: 'where is the retry logic?',
        projectId: PROJECT_IDS.billing,
      });
    });

    it('Escape clears the focused field first, then closes the drawer', () => {
      visitRag();
      closeCombobox();
      filtersButton().click();
      cy.dialog().find('input[placeholder="e.g. method"]').type('method');
      cy.dialog().find('input[placeholder="e.g. method"]').type('{esc}');
      cy.dialog().find('input[placeholder="e.g. method"]').should('have.value', '');
      cy.dialog().find('input[placeholder="e.g. method"]').type('{esc}');
      cy.get('.cdk-dialog-container').should('not.exist');
    });

    it('does not send blank/whitespace filters', () => {
      visitWithProject();
      filtersButton().click();
      cy.dialog().find('input[placeholder="e.g. method"]').type('   ');
      cy.dialog().contains('button', 'Filter').click();
      filtersButton().find('span').should('not.exist');
      ask();
      cy.wait('@ask').its('request.body').should('not.have.any.keys', 'kind');
    });
  });

  describe('result detail popup', () => {
    beforeEach(() => {
      visitWithProject();
      ask();
    });

    it('opens on row click with file, meta line, code and relations', () => {
      cy.contains('tbody tr', 'RetryFailedPayments').click();
      cy.dialog().within(() => {
        cy.contains('src/Billing/PaymentRetryService.cs');
        cy.contains('method');
        cy.contains('PaymentRetryService');
        cy.contains('similarity 0.61');
        cy.contains('rerank 0.42');
        cy.get('pre').should('contain.text', 'await _gateway.RetryAsync();');
        cy.contains('Relations (2)');
        cy.contains('→ calls Gateway.RetryAsync');
        cy.contains('← calls Scheduler.Tick');
      });
    });

    it('renders embeddingText as text, never as HTML', () => {
      cy.contains('tbody tr', 'RetryFailedPayments').click();
      cy.dialog().find('pre').should('contain.text', '<b>not html</b>');
      cy.dialog().find('pre b').should('not.exist');
    });

    it('preserves newlines in the code block', () => {
      cy.contains('tbody tr', 'RetryFailedPayments').click();
      cy.dialog().find('pre').should('have.css', 'white-space', 'pre-wrap');
    });

    it('opens from the keyboard (Enter on a focused row)', () => {
      cy.contains('tbody tr', 'Billing.PaymentGateway').focus().type('{enter}');
      cy.dialog().should('contain.text', 'src/Billing/PaymentGateway.cs');
    });

    it('hides the Relations section when a result has none', () => {
      cy.contains('tbody tr', 'Billing.PaymentGateway').click();
      cy.dialog().should('not.contain.text', 'Relations');
    });

    it('closes with OK, with ×, and with Escape', () => {
      cy.contains('tbody tr', 'Billing.PaymentGateway').click();
      cy.dialog().contains('button', 'OK').click();
      cy.get('.cdk-dialog-container').should('not.exist');

      cy.contains('tbody tr', 'Billing.PaymentGateway').click();
      cy.dialog().find('button[aria-label="Close"]').click();
      cy.get('.cdk-dialog-container').should('not.exist');

      cy.contains('tbody tr', 'Billing.PaymentGateway').click();
      cy.get('body').type('{esc}');
      cy.get('.cdk-dialog-container').should('not.exist');
    });
  });

  describe('feedback', () => {
    const feedbackOk = () =>
      cy
        .intercept('POST', '/api/code-queries/feedback', { statusCode: 201, body: {} })
        .as('feedback');

    it('asks for the user name the first time, then posts "useful" and remembers the name', () => {
      feedbackOk();
      visitWithProject();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.dialog().contains('h2', "What's your name?");
      cy.dialog().contains('button', 'Confirm').should('be.disabled');
      cy.dialog().find('input').type('Ada Lovelace');
      cy.dialog().contains('button', 'Confirm').click();
      cy.wait('@feedback')
        .its('request.body')
        .then((body) => {
          const { similarities, ...rest } = body;
          expect(rest).to.deep.equal({
            projectId: PROJECT_IDS.billing,
            question: 'where is the retry logic?',
            useful: true,
            user: 'Ada Lovelace',
          });
          // order is covered by the "keeps the order the API returned" test
          expect(similarities).to.have.members([0.61, 0.9]);
        });
      entries()
        .first()
        .should('contain.text', 'Useful')
        .find('button')
        .should('have.length.lessThan', 4);
      entries()
        .first()
        .contains('button', /^\s*Not useful\s*$/)
        .should('not.exist');
      cy.window()
        .its('localStorage')
        .invoke('getItem', 'code-rag.userName')
        .should('eq', 'Ada Lovelace');
    });

    it('does not ask for the name again once it is stored', () => {
      feedbackOk();
      asStoredUser();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.get('.cdk-dialog-container').should('not.exist');
      cy.wait('@feedback').its('request.body.user').should('eq', 'Grace');
    });

    it('Enter in the name dialog confirms', () => {
      feedbackOk();
      visitWithProject();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.dialog().find('input').type('Ada{enter}');
      cy.wait('@feedback');
    });

    it('cancelling the name dialog posts nothing', () => {
      feedbackOk();
      visitWithProject();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.dialog().contains('button', 'Cancel').click();
      cy.get('.cdk-dialog-container').should('not.exist');
      cy.get('@feedback.all').should('have.length', 0);
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .should('exist');
    });

    it('Escape on a half-typed name asks to discard', () => {
      visitWithProject();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.dialog().find('input').type('Ad');
      cy.dialog().find('h2').click();
      cy.get('body').type('{esc}');
      cy.dialog().should('contain.text', 'You have unsaved changes. Discard them?');
    });

    it('"Not useful" opens the reason dialog and posts the trimmed reason', () => {
      feedbackOk();
      asStoredUser();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Not useful\s*$/)
        .click();
      cy.dialog().contains("Why weren't these results helpful?");
      cy.dialog().find('textarea').type('  wrong module  ');
      cy.dialog().contains('button', 'Confirm').click();
      cy.wait('@feedback').its('request.body').should('deep.include', {
        useful: false,
        reason: 'wrong module',
        user: 'Grace',
      });
      entries().first().should('contain.text', 'Not useful');
    });

    it('"Not useful" without a reason omits the reason field', () => {
      feedbackOk();
      asStoredUser();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Not useful\s*$/)
        .click();
      cy.dialog().contains('button', 'Confirm').click();
      cy.wait('@feedback').its('request.body').should('not.have.property', 'reason');
    });

    it('cancelling the reason dialog posts nothing', () => {
      feedbackOk();
      asStoredUser();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Not useful\s*$/)
        .click();
      cy.dialog().contains('button', 'Cancel').click();
      cy.get('@feedback.all').should('have.length', 0);
    });

    it('goes back to idle (buttons available) when the API rejects the feedback', () => {
      cy.intercept('POST', '/api/code-queries/feedback', {
        statusCode: 400,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'Bad', detail: 'user is required', status: 400 },
      });
      asStoredUser();
      ask();
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .click();
      cy.toast('user is required').should('be.visible');
      entries()
        .first()
        .contains('button', /^\s*Useful\s*$/)
        .should('be.enabled');
    });
  });
});
