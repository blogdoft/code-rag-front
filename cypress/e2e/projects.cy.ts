import { PROJECT_IDS } from '../support/commands';

const rowFor = (name: string) => cy.contains('tbody tr', name);

describe('Projects page', () => {
  beforeEach(() => {
    cy.stubBackend();
  });

  describe('listing', () => {
    it('lists every project with model, dimensions and created date', () => {
      cy.visit('/projects');
      cy.wait('@projects');
      cy.get('tbody tr').should('have.length', 3);
      rowFor('billing-service').should('contain.text', 'text-embedding-3-small (1536)');
      // embeddingDimensions arrives as a string for orders-api and must be normalized
      rowFor('orders-api').should('contain.text', 'nomic-embed-text (768)');
      rowFor('billing-service').should('contain.text', 'Sep 1, 2026');
    });

    it('requests the first page (zero-based) with page_size=100', () => {
      cy.visit('/projects');
      cy.wait('@projects')
        .its('request.url')
        .should('match', /page=0/)
        .and('match', /page_size=100/);
    });

    it('follows pagination until the last page and flattens the result', () => {
      cy.fixture('projects').then(({ items: [a, b, c] }) => {
        cy.intercept({ method: 'GET', pathname: '/api/indexer/projects' }, (req) => {
          const page = Number(new URL(req.url).searchParams.get('page'));
          const items = page === 0 ? [a, b] : [c];
          req.reply({ items, page, pageSize: 2, totalCount: 3, totalPages: 2 });
        }).as('pagedProjects');
      });
      cy.visit('/projects');
      cy.get('tbody tr').should('have.length', 3);
      cy.get('@pagedProjects.all').should('have.length', 2);
    });

    it('shows the loading state, then the empty state', () => {
      cy.stubBackend({
        projects: { items: [], page: 0, pageSize: 100, totalCount: 0, totalPages: 0 },
      });
      cy.visit('/projects');
      cy.contains('No projects yet.').should('be.visible');
      cy.get('table').should('not.exist');
    });

    it('shows "—" for a project without embedding model', () => {
      cy.stubBackend({
        projects: {
          items: [
            {
              id: PROJECT_IDS.billing,
              name: 'bare',
              embeddingModel: null,
              embeddingDimensions: 0,
              gitUrl: null,
              gitRawUrl: null,
              createdAt: '2026-09-01T12:00:00Z',
              updatedAt: '2026-09-01T12:00:00Z',
            },
          ],
          page: 0,
          pageSize: 100,
          totalCount: 1,
          totalPages: 1,
        },
      });
      cy.visit('/projects');
      rowFor('bare').should('contain.text', '—');
    });

    it('toasts the API problem detail when listing fails', () => {
      cy.stubBackend({ projectsStatus: 500 });
      cy.visit('/projects');
      cy.toast('projects exploded').should('be.visible');
      cy.contains('Loading projects...').should('not.exist');
    });
  });

  describe('search', () => {
    it('filters by name, case-insensitively, client-side', () => {
      cy.visit('/projects');
      cy.get('tbody tr').should('have.length', 3);
      cy.get('input[placeholder="Filter by name..."]').type('ORDERS');
      cy.get('tbody tr').should('have.length', 1).and('contain.text', 'orders-api');
    });

    it('shows a "no match" message when nothing matches', () => {
      cy.visit('/projects');
      cy.get('input[placeholder="Filter by name..."]').type('zzz');
      cy.contains('No projects match your search.').should('be.visible');
    });

    it('Escape clears the search field first (and does not close anything)', () => {
      cy.visit('/projects');
      cy.get('input[placeholder="Filter by name..."]').type('orders');
      cy.get('input[placeholder="Filter by name..."]').type('{esc}');
      cy.get('input[placeholder="Filter by name..."]').should('have.value', '');
      cy.get('tbody tr').should('have.length', 3);
    });
  });

  describe('add project', () => {
    const fill = () => {
      cy.contains('label', 'Name').parent().find('input').type('new-service');
      cy.contains('label', 'Embedding model').parent().find('input').type('text-embedding-3-small');
      cy.contains('label', 'Embedding dimensions').parent().find('input').type('1536');
    };

    it('opens an empty "Add project" dialog with Save disabled', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.dialog().contains('h2', 'Add project');
      cy.dialog().contains('button', 'Save').should('be.disabled');
    });

    it('enables Save only when name, model and a positive integer dimension are set', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.contains('label', 'Name').parent().find('input').type('x');
      cy.dialog().contains('button', 'Save').should('be.disabled');
      cy.contains('label', 'Embedding model').parent().find('input').type('m');
      cy.dialog().contains('button', 'Save').should('be.disabled');
      cy.contains('label', 'Embedding dimensions').parent().find('input').type('0');
      cy.dialog().contains('button', 'Save').should('be.disabled');
      cy.contains('label', 'Embedding dimensions').parent().find('input').clear().type('3');
      cy.dialog().contains('button', 'Save').should('be.enabled');
    });

    it('POSTs camelCase body with null git urls when blank, adds the row and toasts', () => {
      cy.intercept('POST', '/api/indexer/projects', (req) => {
        req.reply({
          statusCode: 201,
          body: {
            id: '44444444-4444-4444-8444-444444444444',
            name: req.body.name,
            embeddingModel: req.body.embeddingModel,
            embeddingDimensions: req.body.embeddingDimensions,
            gitUrl: req.body.gitUrl,
            gitRawUrl: req.body.gitRawUrl,
            createdAt: '2026-09-24T12:00:00Z',
            updatedAt: '2026-09-24T12:00:00Z',
          },
        });
      }).as('createProject');
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      fill();
      cy.dialog().contains('button', 'Save').click();
      cy.wait('@createProject').its('request.body').should('deep.equal', {
        name: 'new-service',
        embeddingModel: 'text-embedding-3-small',
        embeddingDimensions: 1536,
        gitUrl: null,
        gitRawUrl: null,
      });
      cy.toast('Project created.').should('be.visible');
      cy.get('.cdk-dialog-container').should('not.exist');
      rowFor('new-service').should('contain.text', 'text-embedding-3-small (1536)');
    });

    it('sends the git urls when provided', () => {
      cy.intercept('POST', '/api/indexer/projects', (req) => {
        req.reply({
          statusCode: 201,
          body: { ...req.body, id: 'x', createdAt: '', updatedAt: '' },
        });
      }).as('createProject');
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      fill();
      cy.contains('label', 'Git URL').parent().find('input').type('https://git/x');
      cy.contains('label', 'Git RAW URL').parent().find('input').type('https://git/x/raw/');
      cy.dialog().contains('button', 'Save').click();
      cy.wait('@createProject')
        .its('request.body')
        .should('include', { gitUrl: 'https://git/x', gitRawUrl: 'https://git/x/raw/' });
    });

    it('Enter in a field submits the form', () => {
      cy.intercept('POST', '/api/indexer/projects', (req) => {
        req.reply({
          statusCode: 201,
          body: { ...req.body, id: 'x', createdAt: '', updatedAt: '' },
        });
      }).as('createProject');
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      fill();
      cy.contains('label', 'Name').parent().find('input').type('{enter}');
      cy.wait('@createProject');
    });

    it('keeps the dialog open and toasts the API error on a 409', () => {
      cy.intercept('POST', '/api/indexer/projects', {
        statusCode: 409,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'Conflict', detail: 'Project "new-service" already exists.', status: 409 },
      }).as('createProject');
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      fill();
      cy.dialog().contains('button', 'Save').click();
      cy.wait('@createProject');
      cy.toast('already exists').should('be.visible');
      cy.dialog().contains('button', 'Save').should('be.enabled');
    });

    it('Cancel closes without saving', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.dialog().contains('button', 'Cancel').click();
      cy.get('.cdk-dialog-container').should('not.exist');
    });

    it('Escape on a pristine dialog closes it immediately', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.get('body').type('{esc}');
      cy.get('.cdk-dialog-container').should('not.exist');
    });

    it('Escape on a dirty dialog first clears the focused field, then asks to discard', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.contains('label', 'Name').parent().find('input').type('half-typed');
      // Separate calls: the directive reads the field's signal, which must settle before Escape.
      cy.contains('label', 'Name').parent().find('input').type('{esc}');
      cy.contains('label', 'Name').parent().find('input').should('have.value', '');
      // now the field is empty => Escape reaches the popup; nothing is dirty so it closes
      cy.contains('label', 'Name').parent().find('input').type('{esc}');
      cy.get('.cdk-dialog-container').should('not.exist');
    });

    it('Escape with unsaved changes (focus outside a field) asks for confirmation', () => {
      cy.visit('/projects');
      cy.contains('button', 'Add project').click();
      cy.contains('label', 'Name').parent().find('input').type('half-typed');
      cy.dialog().contains('h2', 'Add project').click();
      cy.get('body').type('{esc}');
      cy.dialog().should('contain.text', 'You have unsaved changes. Discard them?');
      // Cancel keeps the form
      cy.dialog().contains('button', 'Cancel').click();
      cy.contains('h2', 'Add project').should('be.visible');
      cy.contains('label', 'Name').parent().find('input').should('have.value', 'half-typed');
      // Escape again, confirm discard
      cy.get('body').type('{esc}');
      cy.dialog().contains('button', 'Discard').click();
      cy.get('.cdk-dialog-container').should('not.exist');
    });
  });

  describe('edit project', () => {
    it('pre-fills the form and PUTs to the UUID path', () => {
      cy.intercept('PUT', `/api/indexer/projects/${PROJECT_IDS.billing}`, (req) => {
        req.reply({
          body: {
            ...req.body,
            id: PROJECT_IDS.billing,
            createdAt: '2026-09-01T12:00:00Z',
            updatedAt: '2026-09-24T12:00:00Z',
          },
        });
      }).as('updateProject');
      cy.visit('/projects');
      rowFor('billing-service').contains('button', 'Edit').click();
      cy.dialog().contains('h2', 'Edit project');
      cy.contains('label', 'Name').parent().find('input').should('have.value', 'billing-service');
      cy.contains('label', 'Embedding dimensions')
        .parent()
        .find('input')
        .should('have.value', '1536');
      cy.contains('label', 'Git URL')
        .parent()
        .find('input')
        .should('have.value', 'https://forgejo.home.arpa/acme/billing-service');
      cy.contains('label', 'Name').parent().find('input').clear().type('billing-v2');
      cy.dialog().contains('button', 'Save').click();
      cy.wait('@updateProject').its('request.body').should('include', { name: 'billing-v2' });
      cy.toast('Project updated.').should('be.visible');
      rowFor('billing-v2').should('exist');
      cy.contains('tbody tr', 'billing-service').should('not.exist');
    });

    it('sends null (never "") when a git url is cleared', () => {
      cy.intercept('PUT', `/api/indexer/projects/${PROJECT_IDS.billing}`, (req) => {
        req.reply({ body: { ...req.body, id: PROJECT_IDS.billing, createdAt: '', updatedAt: '' } });
      }).as('updateProject');
      cy.visit('/projects');
      rowFor('billing-service').contains('button', 'Edit').click();
      cy.contains('label', 'Git URL').parent().find('input').clear();
      cy.contains('label', 'Git RAW URL').parent().find('input').clear();
      cy.contains('label', 'Name').parent().find('input').type('-x');
      cy.dialog().contains('button', 'Save').click();
      cy.wait('@updateProject')
        .its('request.body')
        .should('include', { gitUrl: null, gitRawUrl: null });
    });
  });

  describe('delete project', () => {
    it('asks for confirmation, DELETEs and removes the row', () => {
      cy.intercept('DELETE', `/api/indexer/projects/${PROJECT_IDS.orders}`, { statusCode: 204 }).as(
        'deleteProject',
      );
      cy.visit('/projects');
      rowFor('orders-api').contains('button', 'Delete').click();
      cy.dialog().should('contain.text', 'Delete project "orders-api"? This cannot be undone.');
      cy.dialog().contains('button', 'Delete').click();
      cy.wait('@deleteProject');
      cy.toast('Project deleted.').should('be.visible');
      cy.contains('tbody tr', 'orders-api').should('not.exist');
      cy.get('tbody tr').should('have.length', 2);
    });

    it('Cancel keeps the project and sends nothing', () => {
      cy.intercept('DELETE', '/api/indexer/projects/*', cy.spy().as('deleteSpy'));
      cy.visit('/projects');
      rowFor('orders-api').contains('button', 'Delete').click();
      cy.dialog().contains('button', 'Cancel').click();
      rowFor('orders-api').should('exist');
      cy.get('@deleteSpy').should('not.have.been.called');
    });

    it('Escape on the confirmation dialog cancels the deletion', () => {
      cy.visit('/projects');
      rowFor('orders-api').contains('button', 'Delete').click();
      cy.get('body').type('{esc}');
      cy.get('.cdk-dialog-container').should('not.exist');
      rowFor('orders-api').should('exist');
    });

    it('keeps the row and toasts when the API rejects the delete', () => {
      cy.intercept('DELETE', `/api/indexer/projects/${PROJECT_IDS.orders}`, {
        statusCode: 404,
        headers: { 'content-type': 'application/problem+json' },
        body: { title: 'Not found', detail: 'Project not found.', status: 404 },
      });
      cy.visit('/projects');
      rowFor('orders-api').contains('button', 'Delete').click();
      cy.dialog().contains('button', 'Delete').click();
      cy.toast('Project not found.').should('be.visible');
      rowFor('orders-api').should('exist');
    });
  });
});
