import { PROJECT_IDS } from '../support/commands';

const startInput = () => cy.contains('label', 'Start date').parent().find('input');
const endInput = () => cy.contains('label', 'End date').parent().find('input');
const refreshButton = () => cy.contains('button', /Refresh|Loading\.\.\./);
const exportButton = () => cy.contains('button', /Export CSV|Exporting\.\.\./);

describe('Reports page (/reports)', () => {
  beforeEach(() => {
    cy.stubBackend();
    cy.intercept(
      { method: 'GET', pathname: '/api/code-queries/feedback/stats' },
      { fixture: 'feedback-stats.json' },
    ).as('stats');
  });

  describe('stats', () => {
    it('loads stats on open with a 4-week default range and "All projects"', () => {
      cy.visit('/reports');
      cy.wait('@stats').then(({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('projectId')).to.be.null;
        expect(url.searchParams.get('startDate')).to.match(/^\d{4}-\d{2}-\d{2}T/);
        expect(url.searchParams.get('endDate')).to.match(/^\d{4}-\d{2}-\d{2}T/);
      });
      cy.get('input[role="combobox"]').focus();
      cy.get('[role="option"]').first().should('contain.text', 'All projects');
    });

    it('defaults the date inputs to a 28-day window ending today', () => {
      cy.visit('/reports');
      endInput()
        .invoke('val')
        .then((end) => {
          startInput()
            .invoke('val')
            .then((start) => {
              const days = (Date.parse(String(end)) - Date.parse(String(start))) / 86_400_000;
              expect(days).to.eq(28);
            });
        });
    });

    it('draws the chart canvas when there is data', () => {
      cy.visit('/reports');
      cy.wait('@stats');
      cy.get('app-feedback-trend-chart canvas').should('be.visible');
      cy.contains('No data for this range.').should('not.exist');
    });

    it('shows "No data for this range." for an empty grid', () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/code-queries/feedback/stats' },
        {
          body: { startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-24T00:00:00Z', weeks: [] },
        },
      ).as('stats');
      cy.visit('/reports');
      cy.contains('No data for this range.').should('be.visible');
      cy.get('canvas').should('not.exist');
    });

    it('tolerates weeks: null and projects: null', () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/code-queries/feedback/stats' },
        {
          body: {
            startDate: 'a',
            endDate: 'b',
            weeks: [{ weekStart: '2026-09-07T00:00:00Z', weekEnd: 'x', projects: null }],
          },
        },
      );
      cy.visit('/reports');
      cy.contains('No data for this range.').should('be.visible');
    });

    it('sends the chosen project UUID', () => {
      cy.visit('/reports');
      cy.wait('@stats');
      cy.pickProject('orders-api');
      refreshButton().click();
      cy.wait('@stats').its('request.url').should('include', `projectId=${PROJECT_IDS.orders}`);
    });

    it('omits projectId when "All projects" is (re)selected', () => {
      cy.visit('/reports');
      cy.wait('@stats');
      cy.pickProject('orders-api');
      cy.pickProject('All projects');
      refreshButton().click();
      cy.wait('@stats').its('request.url').should('not.include', 'projectId');
    });

    it('refetches with the edited date range on Refresh', () => {
      cy.visit('/reports');
      cy.wait('@stats');
      startInput().type('2026-09-01');
      endInput().type('2026-09-15');
      refreshButton().click();
      cy.wait('@stats').then(({ request }) => {
        const url = new URL(request.url);
        // Bounds are rendered in the export timezone (America/Sao_Paulo, UTC-3 by default):
        // start of 09-01 local = 03:00Z, end of 09-15 local = 09-16 02:59:59.999Z.
        expect(url.searchParams.get('startDate')).to.eq('2026-09-01T03:00:00.000Z');
        expect(url.searchParams.get('endDate')).to.eq('2026-09-16T02:59:59.999Z');
      });
    });

    it('rejects a start date after the end date without calling the API', () => {
      cy.visit('/reports');
      cy.wait('@stats');
      startInput().type('2026-09-20');
      endInput().type('2026-09-10');
      refreshButton().click();
      cy.toast('Start date must be on or before End date.').should('be.visible');
      cy.get('@stats.all').should('have.length', 1);
    });

    it('Escape clears a date field', () => {
      cy.visit('/reports');
      startInput().should('not.have.value', '');
      // cy.type() refuses special keys on date inputs, so dispatch the keydown directly.
      startInput().trigger('keydown', { key: 'Escape' });
      startInput().should('have.value', '');
    });

    it('disables Refresh/Export and shows "Loading..." while fetching', () => {
      cy.intercept({ method: 'GET', pathname: '/api/code-queries/feedback/stats' }, (req) => {
        req.reply({ fixture: 'feedback-stats.json', delay: 800 });
      }).as('stats');
      cy.visit('/reports');
      refreshButton().should('contain.text', 'Loading...').and('be.disabled');
      exportButton().should('be.disabled');
      cy.wait('@stats');
      refreshButton().should('contain.text', 'Refresh').and('be.enabled');
    });

    it('toasts the API error and recovers the buttons', () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/code-queries/feedback/stats' },
        {
          statusCode: 400,
          headers: { 'content-type': 'application/problem+json' },
          body: { title: 'Bad', detail: 'The window cannot exceed 366 days.', status: 400 },
        },
      );
      cy.visit('/reports');
      cy.toast('cannot exceed 366 days').should('be.visible');
      refreshButton().should('be.enabled');
    });
  });

  describe('CSV export', () => {
    beforeEach(() => {
      cy.task('clearDownloads');
    });

    const exportOk = (headers: Record<string, string> = {}) =>
      cy
        .intercept(
          { method: 'GET', pathname: '/api/code-queries/feedback/export' },
          {
            fixture: 'feedback-export.csv',
            headers: { 'content-type': 'text/csv', ...headers },
          },
        )
        .as('export');

    it('requests the export with the same filters plus the configured timezone', () => {
      exportOk();
      cy.visit('/reports');
      cy.wait('@stats');
      cy.pickProject('billing-service');
      exportButton().click();
      cy.wait('@export').then(({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('projectId')).to.eq(PROJECT_IDS.billing);
        expect(url.searchParams.get('timezone')).to.eq('America/Sao_Paulo');
        expect(url.searchParams.get('startDate')).to.match(/^\d{4}-\d{2}-\d{2}T/);
      });
      cy.toast('CSV export downloaded.').should('be.visible');
    });

    it('omits the timezone param when the setting is empty', () => {
      exportOk();
      cy.visit('/reports', {
        onBeforeLoad: (win) => win.localStorage.setItem('code-rag.exportTimezone', ''),
      });
      cy.wait('@stats');
      exportButton().click();
      cy.wait('@export').its('request.url').should('not.include', 'timezone');
    });

    it('downloads the file using the server-provided filename', () => {
      exportOk({ 'content-disposition': 'attachment; filename="feedback-2026-09.csv"' });
      cy.visit('/reports');
      cy.wait('@stats');
      exportButton().click();
      cy.wait('@export');
      cy.readFile('cypress/downloads/feedback-2026-09.csv', { timeout: 10000 }).should(
        'contain',
        'billing-service',
      );
    });

    it('falls back to a generated filename without Content-Disposition', () => {
      exportOk();
      cy.visit('/reports');
      cy.wait('@stats');
      exportButton().click();
      cy.wait('@export');
      cy.task('listDownloads', null, { timeout: 10000 }).should('satisfy', (files: string[]) =>
        files.some((f) => /\.csv$/.test(f)),
      );
    });

    it('shows the problem detail (blob error body) as a toast on failure', () => {
      cy.intercept(
        { method: 'GET', pathname: '/api/code-queries/feedback/export' },
        {
          statusCode: 400,
          headers: { 'content-type': 'application/problem+json' },
          body: { title: 'Bad', detail: 'Unknown timezone.', status: 400 },
        },
      );
      cy.visit('/reports');
      cy.wait('@stats');
      exportButton().click();
      cy.toast('Unknown timezone.').should('be.visible');
      exportButton().should('be.enabled');
    });

    it('validates the date range before exporting', () => {
      exportOk();
      cy.visit('/reports');
      cy.wait('@stats');
      startInput().type('2026-09-20');
      endInput().type('2026-09-10');
      exportButton().click();
      cy.toast('Start date must be on or before End date.').should('be.visible');
      cy.get('@export.all').should('have.length', 0);
    });
  });
});
