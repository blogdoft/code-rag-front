import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { ProjectFormDialog, type ProjectFormDialogData } from './project-form-dialog';

const PROJECT_1 = '00000000-0000-4000-8000-000000000001';

describe('ProjectFormDialog', () => {
  let fixture: ComponentFixture<ProjectFormDialog>;
  let component: ProjectFormDialog;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let projectsService: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const existingProject: Project = {
    id: PROJECT_1,
    name: 'demo',
    gitUrl: 'https://forgejo.example/demo',
    gitRawUrl: 'https://forgejo.example/demo/raw/main/',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  let onCreated: ReturnType<typeof vi.fn<(project: Project) => void>>;

  function setup(data: ProjectFormDialogData): void {
    onCreated = vi.fn<(project: Project) => void>();
    data = { ...data, onCreated };
    dialogRef = { close: vi.fn() };
    projectsService = { create: vi.fn(), update: vi.fn() };
    toastService = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        { provide: DIALOG_DATA, useValue: data },
        { provide: DialogRef, useValue: dialogRef },
        { provide: ProjectsService, useValue: projectsService },
        { provide: ToastService, useValue: toastService },
      ],
    });

    fixture = TestBed.createComponent(ProjectFormDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function findButton(text: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    );
    const button = buttons.find((b) => b.textContent?.trim().startsWith(text));
    if (!button) throw new Error(`No button with text "${text}"`);
    return button;
  }

  describe('create mode', () => {
    beforeEach(() => setup({}));

    it('starts with empty fields and the "Add project" heading', () => {
      expect(component['name']()).toBe('');
      expect(component['gitUrl']()).toBe('');
      expect(component['gitRawUrl']()).toBe('');
      expect(fixture.nativeElement.textContent).toContain('Add project');
    });

    it('cannot save until the name is filled', () => {
      expect(component['canSave']).toBe(false);

      component['name'].set('   ');
      expect(component['canSave']).toBe(false);

      component['name'].set('demo');
      expect(component['canSave']).toBe(true);
    });

    it('is dirty as soon as any field is filled', () => {
      expect(component.isDirty()).toBe(false);
      component['name'].set('demo');
      expect(component.isDirty()).toBe(true);
    });

    it('does not show the id field before the project exists', () => {
      const input: HTMLInputElement | null = fixture.nativeElement.querySelector('#project-id');
      expect(input).toBeNull();
    });

    it('creates the project and stays open showing its generated id', () => {
      projectsService.create.mockReturnValue(of(existingProject));
      component['name'].set('demo');

      component['save']();
      fixture.detectChanges();

      expect(projectsService.create).toHaveBeenCalledWith({
        name: 'demo',
        gitUrl: null,
        gitRawUrl: null,
      });
      expect(toastService.success).toHaveBeenCalledWith('Project created.');
      expect(onCreated).toHaveBeenCalledWith(existingProject);
      expect(dialogRef.close).not.toHaveBeenCalled();
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#project-id');
      expect(input.value).toBe(PROJECT_1);
      expect(fixture.nativeElement.textContent).toContain('Project created');
      expect(component['canSave']).toBe(false);
      expect(component.isDirty()).toBe(false);
    });

    it('closes with the created project when Close is clicked after creating', () => {
      projectsService.create.mockReturnValue(of(existingProject));
      component['name'].set('demo');
      component['save']();
      fixture.detectChanges();

      findButton('Close').click();

      expect(dialogRef.close).toHaveBeenCalledWith(existingProject);
    });

    it('sends null (never an empty string) for blank or whitespace-only git URLs', () => {
      projectsService.create.mockReturnValue(of(existingProject));
      component['name'].set('demo');
      component['gitUrl'].set('   ');
      component['gitRawUrl'].set('');

      component['save']();

      const sent = projectsService.create.mock.calls[0][0];
      expect(sent.gitUrl).toBeNull();
      expect(sent.gitRawUrl).toBeNull();
    });

    it('closes with undefined on cancel', () => {
      findButton('Cancel').click();
      expect(dialogRef.close).toHaveBeenCalledWith(undefined);
    });
  });

  describe('edit mode', () => {
    beforeEach(() => setup({ project: existingProject }));

    it('prefills fields from the existing project and shows the "Edit project" heading', () => {
      expect(component['name']()).toBe('demo');
      expect(component['gitUrl']()).toBe('https://forgejo.example/demo');
      expect(component['gitRawUrl']()).toBe('https://forgejo.example/demo/raw/main/');
      expect(fixture.nativeElement.textContent).toContain('Edit project');
    });

    it('shows the project id read-only, never focusable, and copies it to the clipboard', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const input: HTMLInputElement = fixture.nativeElement.querySelector('#project-id');
      expect(input.value).toBe(PROJECT_1);
      expect(input.readOnly).toBe(true);
      expect(input.tabIndex).toBe(-1);

      findButton('Copy').click();
      await fixture.whenStable();

      expect(writeText).toHaveBeenCalledWith(PROJECT_1);
      expect(toastService.success).toHaveBeenCalledWith('Project ID copied.');
      vi.unstubAllGlobals();
    });

    it('is not dirty until a field changes', () => {
      expect(component.isDirty()).toBe(false);
      component['name'].set('renamed');
      expect(component.isDirty()).toBe(true);
    });

    it('updates the project by id and closes with the result on save', () => {
      const updated = { ...existingProject, name: 'renamed' };
      projectsService.update.mockReturnValue(of(updated));
      component['name'].set('renamed');

      component['save']();

      expect(projectsService.update).toHaveBeenCalledWith(PROJECT_1, {
        name: 'renamed',
        gitUrl: 'https://forgejo.example/demo',
        gitRawUrl: 'https://forgejo.example/demo/raw/main/',
      });
      expect(toastService.success).toHaveBeenCalledWith('Project updated.');
      expect(dialogRef.close).toHaveBeenCalledWith(updated);
    });

    it('re-enables the form and does not close on save failure', () => {
      const updateSubject = new Subject<Project>();
      projectsService.update.mockReturnValue(updateSubject);
      component['name'].set('renamed');

      component['save']();
      expect(component['isSaving']()).toBe(true);

      updateSubject.error(new Error('boom'));

      expect(component['isSaving']()).toBe(false);
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
