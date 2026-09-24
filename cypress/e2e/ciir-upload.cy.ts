import { PROJECT_IDS } from '../support/commands';

const UPLOAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INDEXATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const uploadButton = () => cy.contains('button', /^\s*Upload\s*$/);
const fileInput = () => cy.get('#ciir-file');
const progressSection = () => cy.contains('section', 'Progress');

const uploadStatus = (status: string, extra: Record<string, unknown> = {}) => ({
  id: UPLOAD_ID,
  projectId: PROJECT_IDS.billing,
  status,
  createdAt: '2026-09-24T12:00:00Z',
  processingStartedAt: null,
  processedAt: null,
  indexationId: null,
  error: null,
  ...extra,
});

const indexationStatus = (status: string, extra: Record<string, unknown> = {}) => ({
  id: INDEXATION_ID,
  status,
  documents: {
    processed: 1200,
    inserted: 1000,
    updated: 200,
    embeddingsGenerated: '900',
    embeddingsReused: 300,
  },
  relations: { processed: 5000, resolved: 4500, unresolved: 500 },
  error: null,
  ...extra,
});

// <dd> content is padded by the template's whitespace, so compare trimmed text.
const counter = (label: string, expected: string) =>
  cy
    .contains('dt', label)
    .next()
    .invoke('text')
    .should((text) => expect(text.trim()).to.eq(expected));

const chooseProjectAndFile = (fileName = 'sample.ciir.jsonl') => {
  cy.pickProject('billing-service');
  fileInput().selectFile(`cypress/fixtures/${fileName}`, { force: true });
};

describe('CIIR upload page (/uploads)', () => {
  beforeEach(() => {
    cy.stubBackend();
    cy.intercept('POST', '/api/indexer/ciir-uploads', {
      statusCode: 202,
      body: { uploadId: UPLOAD_ID, status: 'pending' },
    }).as('upload');
    cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, {
      body: uploadStatus('pending'),
    }).as('poll');
  });

  describe('form', () => {
    it('starts with Upload disabled and the dropzone prompt', () => {
      cy.visit('/uploads');
      uploadButton().should('be.disabled');
      cy.contains('Drop a .jsonl file here, or click to browse').should('be.visible');
      cy.contains('Progress').should('not.exist');
    });

    it('accepts only .jsonl in the file picker', () => {
      cy.visit('/uploads');
      fileInput().should('have.attr', 'accept', '.jsonl');
    });

    it('needs both a project and a file before Upload is enabled', () => {
      cy.visit('/uploads');
      cy.wait('@projects');
      fileInput().selectFile('cypress/fixtures/sample.ciir.jsonl', { force: true });
      uploadButton().should('be.disabled');
      cy.pickProject('billing-service');
      uploadButton().should('be.enabled');
    });

    it('shows the chosen file name and size, and can be replaced', () => {
      cy.visit('/uploads');
      fileInput().selectFile('cypress/fixtures/sample.ciir.jsonl', { force: true });
      cy.contains('sample.ciir.jsonl').should('be.visible');
      cy.contains(/\d+ B/).should('be.visible');
      cy.contains('Click or drop to choose a different file').should('be.visible');
    });

    it('accepts a file dropped on the dropzone', () => {
      cy.visit('/uploads');
      cy.get('label[for="ciir-file"]').selectFile('cypress/fixtures/sample.ciir.jsonl', {
        action: 'drag-drop',
      });
      cy.contains('sample.ciir.jsonl').should('be.visible');
    });

    it('rejects a non-.jsonl file with a toast', () => {
      cy.visit('/uploads');
      fileInput().selectFile('cypress/fixtures/notes.txt', { force: true });
      cy.toast('CIIR file must be a .jsonl file.').should('be.visible');
      cy.contains('notes.txt').should('not.exist');
    });

    it('rejects an empty file with a toast', () => {
      cy.visit('/uploads');
      fileInput().selectFile(
        { contents: Cypress.Buffer.from(''), fileName: 'empty.jsonl' },
        { force: true },
      );
      cy.toast('CIIR file is empty.').should('be.visible');
    });

    it('lists projects from the API in the combobox', () => {
      cy.visit('/uploads');
      cy.wait('@projects');
      cy.get('input[role="combobox"]').focus();
      cy.get('[role="option"]').should('have.length', 3);
    });
  });

  describe('successful upload', () => {
    it('posts multipart with projectId BEFORE ciirFile, then polls until indexed', () => {
      let polls = 0;
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, (req) => {
        polls++;
        req.reply(
          polls === 1
            ? uploadStatus('pending')
            : uploadStatus('processed', {
                indexationId: INDEXATION_ID,
                processedAt: '2026-09-24T12:05:00Z',
              }),
        );
      }).as('poll');
      cy.intercept('GET', `/api/indexer/indexations/${INDEXATION_ID}`, {
        body: indexationStatus('completed'),
      }).as('indexation');

      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();

      cy.wait('@upload').then(({ request }) => {
        expect(request.headers['content-type']).to.match(/^multipart\/form-data/);
        const raw =
          typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body);
        const projectIdAt = raw.indexOf('name="projectId"');
        const fileAt = raw.indexOf('name="ciirFile"');
        expect(projectIdAt, 'projectId field present').to.be.greaterThan(-1);
        expect(fileAt, 'ciirFile field present').to.be.greaterThan(-1);
        expect(projectIdAt, 'projectId must come first').to.be.lessThan(fileAt);
        expect(raw).to.contain(PROJECT_IDS.billing);
        expect(raw).to.contain('filename="sample.ciir.jsonl"');
        expect(raw).to.contain('{"kind":"document","id":1}');
      });

      progressSection().should('be.visible');
      cy.contains('Processing').should('be.visible');
      cy.get('[role="progressbar"][aria-label="Indexing progress"]').should('exist');
      cy.contains('Queued - waiting for a worker').should('be.visible');

      cy.contains('Completed', { timeout: 10000 }).should('be.visible');
      cy.contains('Indexing completed.').should('be.visible');
      cy.toast('CIIR file indexed.').should('be.visible');

      progressSection().within(() => {
        cy.contains('h3', 'Documents')
          .parent()
          .within(() => {
            counter('Read', '1,200');
            counter('Inserted', '1,000');
            counter('Updated', '200');
            // embeddingsGenerated arrives as a string ("900") and must be normalized
            counter('Embeddings generated', '900');
            counter('Embeddings reused', '300');
          });
        cy.contains('h3', 'Relations')
          .parent()
          .within(() => {
            counter('Resolved', '4,500');
            counter('Unresolved', '500');
          });
      });
    });

    it('shows the upload phase (Cancel button, progress bar) while the request is in flight', () => {
      cy.intercept('POST', '/api/indexer/ciir-uploads', (req) => {
        req.reply({
          statusCode: 202,
          body: { uploadId: UPLOAD_ID, status: 'pending' },
          delay: 1500,
        });
      }).as('slowUpload');
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('Uploading').should('be.visible');
      cy.get('[role="progressbar"][aria-label="Upload progress"]').should('exist');
      cy.contains('button', 'Cancel upload').should('be.visible');
      // form is locked while busy
      fileInput().should('be.disabled');
      uploadButton().should('be.disabled');
      cy.get('input[role="combobox"]').should('be.disabled');
    });
  });

  describe('failures', () => {
    const failWith = (statusCode: number, body?: object) => {
      cy.intercept('POST', '/api/indexer/ciir-uploads', {
        statusCode,
        ...(body
          ? { headers: { 'content-type': 'application/problem+json' }, body }
          : { body: '' }),
      }).as('upload');
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.wait('@upload');
    };

    it('shows the API problem detail on a 400', () => {
      failWith(400, { title: 'Bad request', detail: 'ciirFile is not valid JSONL.', status: 400 });
      cy.contains('Failed').should('be.visible');
      progressSection().should('contain.text', 'ciirFile is not valid JSONL.');
      cy.toast('ciirFile is not valid JSONL.').should('be.visible');
    });

    it('maps a body-less 404 to "project not found"', () => {
      failWith(404);
      progressSection().should('contain.text', 'The selected project was not found.');
    });

    it('maps a body-less 413 to "file too large"', () => {
      failWith(413);
      progressSection().should('contain.text', 'The file is too large for the server to accept.');
    });

    it('maps a body-less 429 to "server busy"', () => {
      failWith(429);
      progressSection().should('contain.text', 'The server is busy with other uploads.');
    });

    it('does not double-toast (global error toast is suppressed for uploads)', () => {
      failWith(404);
      cy.get('[role="status"]').should('have.length', 1);
    });

    it('reports a network failure', () => {
      cy.intercept('POST', '/api/indexer/ciir-uploads', { forceNetworkError: true }).as('upload');
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('Failed').should('be.visible');
      cy.get('[role="status"]').should('have.length', 1);
    });

    it('lets the user retry after a failure', () => {
      failWith(429);
      progressSection().should('contain.text', 'busy');
      cy.intercept('POST', '/api/indexer/ciir-uploads', {
        statusCode: 202,
        body: { uploadId: UPLOAD_ID, status: 'pending' },
      }).as('upload');
      uploadButton().should('be.enabled').click();
      cy.contains('Processing').should('be.visible');
    });

    it('surfaces server-side failure from the upload status', () => {
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, {
        body: uploadStatus('failed', { error: 'Line 7 is not valid JSON.' }),
      });
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('Failed').should('be.visible');
      progressSection().should('contain.text', 'Line 7 is not valid JSON.');
      cy.toast('Line 7 is not valid JSON.').should('be.visible');
    });

    it('falls back to the indexation error when the upload has none', () => {
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, {
        body: uploadStatus('failed', { indexationId: INDEXATION_ID }),
      });
      cy.intercept('GET', `/api/indexer/indexations/${INDEXATION_ID}`, {
        body: indexationStatus('failed', { error: 'Embedding provider unavailable.' }),
      });
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      progressSection().should('contain.text', 'Embedding provider unavailable.');
      cy.contains('Importing documents').should('not.exist');
      progressSection().should('contain.text', 'Failed');
    });

    it('gives up with a "lost track" message when the status endpoint 404s', () => {
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, { statusCode: 404, body: '' });
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      progressSection().should('contain.text', 'Lost track of the upload status');
    });

    it('does not toast twice for polling errors', () => {
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, { statusCode: 404, body: '' });
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('Lost track').should('exist');
      cy.get('[role="status"]').should('have.length', 1);
    });
  });

  describe('indexation status labels', () => {
    it('shows the indexation state while the upload is still processing', () => {
      cy.intercept('GET', `/api/indexer/ciir-uploads/${UPLOAD_ID}`, {
        body: uploadStatus('processing', { indexationId: INDEXATION_ID }),
      });
      cy.intercept('GET', `/api/indexer/indexations/${INDEXATION_ID}`, {
        body: indexationStatus('resolving_relations'),
      });
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('Resolving relations').should('be.visible');
      cy.contains('h3', 'Documents').should('be.visible');
    });
  });

  describe('cancel and leave', () => {
    beforeEach(() => {
      cy.intercept('POST', '/api/indexer/ciir-uploads', (req) => {
        req.reply({
          statusCode: 202,
          body: { uploadId: UPLOAD_ID, status: 'pending' },
          delay: 4000,
        });
      }).as('slowUpload');
      cy.visit('/uploads');
      cy.wait('@projects');
      chooseProjectAndFile();
      uploadButton().click();
      cy.contains('button', 'Cancel upload').should('be.visible');
    });

    it('Cancel upload aborts, toasts and returns the form to idle', () => {
      cy.contains('button', 'Cancel upload').click();
      cy.toast('Upload cancelled.').should('be.visible');
      cy.contains('Progress').should('not.exist');
      uploadButton().should('be.enabled');
    });

    it('asks for confirmation before leaving mid-upload; staying keeps the upload', () => {
      cy.get('aside a[href="/projects"]').click();
      cy.dialog().should(
        'contain.text',
        'A file is still being uploaded. Leaving this page will cancel the upload.',
      );
      cy.dialog().contains('button', 'Cancel').click();
      cy.location('pathname').should('eq', '/uploads');
      cy.contains('Uploading').should('be.visible');
    });

    it('confirming leaves the page', () => {
      cy.get('aside a[href="/projects"]').click();
      cy.dialog().contains('button', 'Leave and cancel upload').click();
      cy.location('pathname').should('eq', '/projects');
    });

    it('Escape on the leave prompt stays on the page', () => {
      cy.get('aside a[href="/projects"]').click();
      cy.get('body').type('{esc}');
      cy.location('pathname').should('eq', '/uploads');
    });
  });

  it('lets the user leave freely when no upload is running', () => {
    cy.visit('/uploads');
    cy.get('aside a[href="/projects"]').click();
    cy.location('pathname').should('eq', '/projects');
    cy.get('.cdk-dialog-container').should('not.exist');
  });
});
