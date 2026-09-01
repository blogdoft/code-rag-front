import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { PopupService } from '../../shared/services/popup.service';
import { ProjectFormDialog } from './project-form-dialog';
import { ProjectsPage } from './projects-page';

describe('ProjectsPage', () => {
  let fixture: ComponentFixture<ProjectsPage>;
  let component: ProjectsPage;
  let projectsService: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
  let popupService: { open: ReturnType<typeof vi.fn> };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const projects: Project[] = [
    { id: 1, name: 'alpha', gitUrl: 'https://example.com/alpha.git', gitRawUrl: null, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, name: 'beta', gitUrl: null, gitRawUrl: null, createdAt: '2026-01-02T00:00:00Z' },
  ];

  function setup(): void {
    projectsService = { list: vi.fn(() => of(projects)), remove: vi.fn() };
    popupService = { open: vi.fn() };
    toastService = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: PopupService, useValue: popupService },
        { provide: ToastService, useValue: toastService },
      ],
    });

    fixture = TestBed.createComponent(ProjectsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function fakeDialogRef(): { closed: Subject<unknown>; componentInstance: { isDirty: ReturnType<typeof vi.fn> } } {
    return { closed: new Subject(), componentInstance: { isDirty: vi.fn(() => false) } };
  }

  it('loads projects on construction', () => {
    setup();
    expect(projectsService.list).toHaveBeenCalled();
    expect(component['projects']()).toEqual(projects);
  });

  it('filters the list by name, case-insensitively', () => {
    setup();
    component['search'].set('ALPHA');
    expect(component['filteredProjects']()).toEqual([projects[0]]);
  });

  it('renders a row per project with an Edit and Delete button', () => {
    setup();
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('alpha');
    expect(rows[0].textContent).toContain('https://example.com/alpha.git');
  });

  it('shows an empty state when there are no projects', () => {
    projectsService = { list: vi.fn(() => of([])), remove: vi.fn() };
    popupService = { open: vi.fn() };
    toastService = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: PopupService, useValue: popupService },
        { provide: ToastService, useValue: toastService },
      ],
    });
    fixture = TestBed.createComponent(ProjectsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No projects yet.');
  });

  it('opens the form dialog with no project data when adding', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);

    component['addProject']();

    const [component_, options] = popupService.open.mock.calls[0];
    expect(component_).toBe(ProjectFormDialog);
    expect(options.data).toEqual({ project: undefined });
  });

  it('opens the form dialog with the project data when editing', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);

    component['editProject'](projects[0]);

    const [, options] = popupService.open.mock.calls[0];
    expect(options.data).toEqual({ project: projects[0] });
  });

  it('delegates isDirty to the opened form dialog instance', () => {
    setup();
    const ref = fakeDialogRef();
    ref.componentInstance.isDirty.mockReturnValue(true);
    popupService.open.mockReturnValue(ref);

    component['addProject']();

    const [, options] = popupService.open.mock.calls[0];
    expect(options.isDirty()).toBe(true);
  });

  it('adds a newly created project to the list when the form dialog closes with a result', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);
    component['addProject']();

    const created: Project = { id: 3, name: 'gamma', gitUrl: null, gitRawUrl: null, createdAt: '2026-01-03T00:00:00Z' };
    ref.closed.next(created);

    expect(component['projects']()).toEqual([...projects, created]);
  });

  it('replaces the edited project in the list when the form dialog closes with a result', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);
    component['editProject'](projects[0]);

    const updated: Project = { ...projects[0], name: 'alpha-renamed' };
    ref.closed.next(updated);

    expect(component['projects']()).toEqual([updated, projects[1]]);
  });

  it('does not change the list when the form dialog is cancelled', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);
    component['addProject']();

    ref.closed.next(undefined);

    expect(component['projects']()).toEqual(projects);
  });

  it('opens a delete confirmation with a Delete label', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);

    component['deleteProject'](projects[0]);

    const [, options] = popupService.open.mock.calls[0];
    expect(options.data.message).toContain('alpha');
    expect(options.data.confirmLabel).toBe('Delete');
  });

  it('deletes the project and removes it from the list when confirmed', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);
    projectsService.remove.mockReturnValue(of(undefined));

    component['deleteProject'](projects[0]);
    ref.closed.next(true);

    expect(projectsService.remove).toHaveBeenCalledWith(1);
    expect(toastService.success).toHaveBeenCalledWith('Project deleted.');
    expect(component['projects']()).toEqual([projects[1]]);
  });

  it('does not delete when the confirmation is cancelled', () => {
    setup();
    const ref = fakeDialogRef();
    popupService.open.mockReturnValue(ref);

    component['deleteProject'](projects[0]);
    ref.closed.next(false);

    expect(projectsService.remove).not.toHaveBeenCalled();
    expect(component['projects']()).toEqual(projects);
  });

  it('clears the search field via the Escape-clearable directive', () => {
    setup();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'alpha';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component['search']()).toBe('');
  });
});
