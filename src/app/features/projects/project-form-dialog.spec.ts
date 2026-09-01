import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import type { Project } from '../../core/models/project';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { ProjectFormDialog, type ProjectFormDialogData } from './project-form-dialog';

describe('ProjectFormDialog', () => {
  let fixture: ComponentFixture<ProjectFormDialog>;
  let component: ProjectFormDialog;
  let dialogRef: { close: ReturnType<typeof vi.fn> };
  let projectsService: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  let toastService: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const existingProject: Project = {
    id: 1,
    name: 'demo',
    gitUrl: 'https://example.com/demo.git',
    gitRawUrl: 'https://raw.example.com/demo',
    createdAt: '2026-01-01T00:00:00Z',
  };

  function setup(data: ProjectFormDialogData): void {
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
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
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

    it('cannot save until all three fields are filled', () => {
      expect(component['canSave']).toBe(false);

      component['name'].set('demo');
      expect(component['canSave']).toBe(false);

      component['gitUrl'].set('https://example.com/demo.git');
      expect(component['canSave']).toBe(false);

      component['gitRawUrl'].set('https://raw.example.com/demo');
      expect(component['canSave']).toBe(true);
    });

    it('is dirty as soon as any field is filled', () => {
      expect(component.isDirty()).toBe(false);
      component['name'].set('demo');
      expect(component.isDirty()).toBe(true);
    });

    it('creates the project and closes with the result on save', () => {
      projectsService.create.mockReturnValue(of(existingProject));
      component['name'].set('demo');
      component['gitUrl'].set('https://example.com/demo.git');
      component['gitRawUrl'].set('https://raw.example.com/demo');

      component['save']();

      expect(projectsService.create).toHaveBeenCalledWith({
        name: 'demo',
        gitUrl: 'https://example.com/demo.git',
        gitRawUrl: 'https://raw.example.com/demo',
      });
      expect(toastService.success).toHaveBeenCalledWith('Project created.');
      expect(dialogRef.close).toHaveBeenCalledWith(existingProject);
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
      expect(component['gitUrl']()).toBe('https://example.com/demo.git');
      expect(component['gitRawUrl']()).toBe('https://raw.example.com/demo');
      expect(fixture.nativeElement.textContent).toContain('Edit project');
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

      expect(projectsService.update).toHaveBeenCalledWith(1, {
        name: 'renamed',
        gitUrl: 'https://example.com/demo.git',
        gitRawUrl: 'https://raw.example.com/demo',
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
