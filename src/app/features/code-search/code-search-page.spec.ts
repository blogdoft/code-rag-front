import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import type { CodeQueryResult } from '../../core/models/code-query-result';
import type { Project } from '../../core/models/project';
import { CodeQueriesService } from '../../core/services/code-queries.service';
import { ProjectsService } from '../../core/services/projects.service';
import { PopupService } from '../../shared/services/popup.service';
import { CodeSearchPage } from './code-search-page';

describe('CodeSearchPage', () => {
  let fixture: ComponentFixture<CodeSearchPage>;
  let component: CodeSearchPage;
  let projectsService: { list: ReturnType<typeof vi.fn> };
  let codeQueriesService: { ask: ReturnType<typeof vi.fn> };
  let popupService: { open: ReturnType<typeof vi.fn> };

  const projects: Project[] = [
    { id: 1, name: 'alpha', gitUrl: null, gitRawUrl: null, createdAt: '2026-01-01T00:00:00Z' },
    {
      id: 2,
      name: 'beta',
      gitUrl: 'https://forgejo.home.arpa/sauron/beta/',
      gitRawUrl: null,
      createdAt: '2026-01-02T00:00:00Z',
    },
  ];

  const results: CodeQueryResult[] = [
    {
      id: 1,
      sourceFile: 'src/foo.ts',
      gitRawUrl: 'https://forgejo.home.arpa/sauron/code-rag-api/raw/branch/main/src/foo.ts',
      kind: 'method',
      typeName: 'Foo',
      member: 'bar',
      embeddingText: 'function bar() {}',
      similarity: 0.9,
    },
  ];

  function setup(askResult: Observable<CodeQueryResult[]> = of(results)): void {
    projectsService = { list: vi.fn(() => of(projects)) };
    codeQueriesService = { ask: vi.fn(() => askResult) };
    popupService = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: CodeQueriesService, useValue: codeQueriesService },
        { provide: PopupService, useValue: popupService },
      ],
    });

    fixture = TestBed.createComponent(CodeSearchPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('focuses the project combobox as soon as the page loads', async () => {
    setup();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('app-combobox input'));
  });

  it('moves focus to the question field once a project is selected', () => {
    setup();

    const combobox = fixture.debugElement.query((debugEl) => debugEl.name === 'app-combobox').componentInstance;
    combobox.selected.emit({ id: 1, label: 'alpha' });
    fixture.detectChanges();

    expect(document.activeElement).toBe(
      fixture.nativeElement.querySelector('input[placeholder="Where is the retry logic for failed payments?"]'),
    );
  });

  it('loads projects into the combobox on construction', () => {
    setup();
    expect(projectsService.list).toHaveBeenCalled();
    expect(component['projectOptions']()).toEqual([
      { id: 1, label: 'alpha' },
      { id: 2, label: 'beta' },
    ]);
  });

  it('cannot submit without a selected project and a non-blank question', () => {
    setup();
    expect(component['canSubmit']).toBe(false);

    component['selectedProjectId'].set(1);
    expect(component['canSubmit']).toBe(false);

    component['question'].set('  ');
    expect(component['canSubmit']).toBe(false);

    component['question'].set('a real question');
    expect(component['canSubmit']).toBe(true);
  });

  it('submits a question, records history, and clears the input', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');

    component['submit']();

    expect(codeQueriesService.ask).toHaveBeenCalledWith(1, 'Where is retry logic?');
    expect(component['history']()).toEqual([
      { id: 0, projectName: 'alpha', projectGitUrl: null, question: 'Where is retry logic?', results },
    ]);
    expect(component['question']()).toBe('');
    expect(component['isSubmitting']()).toBe(false);
  });

  it('renders the card title as a link to the project git repository when one is set', () => {
    setup();
    component['selectedProjectId'].set(2);
    component['question'].set('Where is retry logic?');

    component['submit']();
    fixture.detectChanges();

    const titleLink = fixture.nativeElement.querySelector('article p a') as HTMLAnchorElement;
    expect(titleLink.textContent?.trim()).toBe('beta');
    expect(titleLink.href).toBe('https://forgejo.home.arpa/sauron/beta/');
    expect(titleLink.target).toBe('_blank');
  });

  it('renders the card title as plain text when the project has no git repository', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');

    component['submit']();
    fixture.detectChanges();

    const title = fixture.nativeElement.querySelector('article p') as HTMLParagraphElement;
    expect(title.querySelector('a')).toBeNull();
    expect(title.textContent).toContain('alpha');
  });

  it('does not submit when no project is selected', () => {
    setup();
    component['question'].set('hello');

    component['submit']();

    expect(codeQueriesService.ask).not.toHaveBeenCalled();
  });

  it('does not submit a blank question', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('   ');

    component['submit']();

    expect(codeQueriesService.ask).not.toHaveBeenCalled();
  });

  it('resets isSubmitting and skips history when the query errors', () => {
    const askSubject = new Subject<CodeQueryResult[]>();
    setup(askSubject);
    component['selectedProjectId'].set(1);
    component['question'].set('boom');

    component['submit']();
    expect(component['isSubmitting']()).toBe(true);

    askSubject.error(new Error('fail'));

    expect(component['isSubmitting']()).toBe(false);
    expect(component['history']()).toEqual([]);
  });

  it('opens the result detail popup with the clicked result', () => {
    setup();

    component['openResult'](results[0]);

    expect(popupService.open).toHaveBeenCalled();
    const [, options] = popupService.open.mock.calls[0];
    expect(options.data).toBe(results[0]);
  });

  it('renders "No results" for a query that returns nothing', () => {
    setup(of([]));
    component['selectedProjectId'].set(1);
    component['question'].set('empty query');

    component['submit']();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No results.');
  });

  it('renders a results table row and opens the popup when it is clicked', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');

    component['submit']();
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.textContent).toContain('method');
    expect(row.textContent).toContain('90%');

    const gitRawLink = row.querySelector('a') as HTMLAnchorElement;
    expect(gitRawLink.textContent?.trim()).toBe('View Raw');
    expect(gitRawLink.href).toBe(results[0].gitRawUrl);
    expect(gitRawLink.target).toBe('_blank');

    row.click();

    expect(popupService.open).toHaveBeenCalled();
  });

  it('does not open the popup when the GitRaw link is clicked', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');

    component['submit']();
    fixture.detectChanges();

    const gitRawLink = fixture.nativeElement.querySelector('tbody tr a') as HTMLAnchorElement;
    gitRawLink.click();

    expect(popupService.open).not.toHaveBeenCalled();
  });

  it('removes a history entry when its close button is clicked', () => {
    setup();
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');

    component['submit']();
    fixture.detectChanges();

    expect(component['history']().length).toBe(1);

    const closeButton = fixture.nativeElement.querySelector('article button[aria-label="Close"]') as HTMLButtonElement;
    closeButton.click();
    fixture.detectChanges();

    expect(component['history']()).toEqual([]);
    expect(fixture.nativeElement.querySelector('article')).toBeNull();
  });

  it('updates the question from real typing and clears it via Escape', () => {
    setup();
    const questionInput = fixture.nativeElement.querySelector(
      'input[placeholder="Where is the retry logic for failed payments?"]',
    ) as HTMLInputElement;

    questionInput.value = 'Where is retry logic?';
    questionInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component['question']()).toBe('Where is retry logic?');

    questionInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component['question']()).toBe('');
    expect(questionInput.value).toBe('');
  });

  it('disables the Ask button while submitting and re-enables it once done', () => {
    const askSubject = new Subject<CodeQueryResult[]>();
    setup(askSubject);
    component['selectedProjectId'].set(1);
    component['question'].set('Where is retry logic?');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="button"]') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Asking...');

    askSubject.next(results);
    askSubject.complete();
    fixture.detectChanges();

    expect(button.textContent).toContain('Ask');
  });
});
