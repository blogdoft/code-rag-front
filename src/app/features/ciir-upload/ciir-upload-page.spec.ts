import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, firstValueFrom, of, type Observable } from 'rxjs';
import type { CiirUploadEvent, CiirUploadProgress } from '../../core/models/ciir-upload';
import type { Project } from '../../core/models/project';
import { CiirUploadsService } from '../../core/services/ciir-uploads.service';
import { ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { Combobox } from '../../shared/components/combobox/combobox';
import { PopupService } from '../../shared/services/popup.service';
import { ProjectsDialog } from '../projects/projects-dialog';
import { CiirUploadPage } from './ciir-upload-page';

const PROJECT_1 = '00000000-0000-4000-8000-000000000001';
const PROJECT_2 = '00000000-0000-4000-8000-000000000002';

const MB = 1024 * 1024;

function project(id: string, name: string): Project {
  return {
    id,
    name,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    gitUrl: null,
    gitRawUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/** A File whose reported size is `size` bytes, without allocating that much memory. */
function fakeFile(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function progressSnapshot(
  uploadStatus: string,
  overrides: { indexation?: CiirUploadProgress['indexation']; error?: string | null } = {},
): CiirUploadProgress {
  return {
    upload: {
      id: 'upload-1',
      projectId: PROJECT_1,
      status: uploadStatus,
      createdAt: '2026-09-20T10:00:00Z',
      processingStartedAt: null,
      processedAt: null,
      indexationId: overrides.indexation ? overrides.indexation.id : null,
      error: overrides.error ?? null,
    },
    indexation: overrides.indexation ?? null,
  };
}

const runningIndexation: NonNullable<CiirUploadProgress['indexation']> = {
  id: 'indexation-1',
  status: 'running',
  documents: {
    processed: 1200,
    inserted: 1000,
    updated: 200,
    embeddingsGenerated: 900,
    embeddingsReused: 300,
  },
  relations: { processed: 3000, resolved: 2800, unresolved: 200 },
  error: null,
};

describe('CiirUploadPage', () => {
  let fixture: ComponentFixture<CiirUploadPage>;
  let uploadEvents: Subject<CiirUploadEvent>;
  let watchEvents: Subject<CiirUploadProgress>;
  let uploadsService: { upload: ReturnType<typeof vi.fn>; watch: ReturnType<typeof vi.fn> };
  let popupService: { open: ReturnType<typeof vi.fn> };
  let confirmClosed: Subject<boolean | undefined>;
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    uploadEvents = new Subject();
    watchEvents = new Subject();
    confirmClosed = new Subject();
    uploadsService = { upload: vi.fn(() => uploadEvents), watch: vi.fn(() => watchEvents) };
    popupService = { open: vi.fn(() => ({ closed: confirmClosed })) };
    toast = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProjectsService,
          useValue: {
            list: vi.fn(() => of([project(PROJECT_1, 'alpha'), project(PROJECT_2, 'beta')])),
          },
        },
        { provide: CiirUploadsService, useValue: uploadsService },
        { provide: PopupService, useValue: popupService },
        { provide: ToastService, useValue: toast },
      ],
    });
    fixture = TestBed.createComponent(CiirUploadPage);
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement;
  const text = (): string => root().textContent ?? '';
  const uploadButton = (): HTMLButtonElement =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Upload')!;
  const cancelButton = (): HTMLButtonElement | undefined =>
    Array.from(root().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel upload',
    );
  const fileInput = (): HTMLInputElement => root().querySelector('input[type="file"]')!;
  const combobox = (): Combobox =>
    fixture.debugElement.query(By.directive(Combobox)).componentInstance;

  function chooseProject(id: string): void {
    combobox().value.set(id);
    fixture.detectChanges();
  }

  function chooseFile(file: File): void {
    Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
    fileInput().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function startUpload(file = fakeFile('ciir.jsonl', 100 * MB)): void {
    chooseProject(PROJECT_1);
    chooseFile(file);
    uploadButton().click();
    fixture.detectChanges();
  }

  /** canLeave() as the confirmation it is mid-upload; resolves once the dialog is answered. */
  function leaveDecision(): Promise<boolean> {
    return firstValueFrom(fixture.componentInstance.canLeave() as Observable<boolean>);
  }

  function emitAccepted(): void {
    uploadEvents.next({ kind: 'accepted', uploadId: 'upload-1' });
    fixture.detectChanges();
  }

  it('lists the projects from the API in the project combobox', () => {
    expect(combobox().options()).toEqual([
      { id: PROJECT_1, label: 'alpha' },
      { id: PROJECT_2, label: 'beta' },
    ]);
  });

  describe('choosing what to upload', () => {
    it('keeps Upload disabled until both a project and a file are chosen', () => {
      expect(uploadButton().disabled).toBe(true);

      chooseProject(PROJECT_1);
      expect(uploadButton().disabled).toBe(true);

      chooseFile(fakeFile('ciir.jsonl', MB));
      expect(uploadButton().disabled).toBe(false);
    });

    it('shows the chosen file name and human-readable size', () => {
      chooseFile(fakeFile('my-project.jsonl', 2.5 * 1024 * MB));

      expect(text()).toContain('my-project.jsonl');
      expect(text()).toContain('2.5 GB');
    });

    it('rejects a file that is not .jsonl', () => {
      chooseProject(PROJECT_1);
      chooseFile(fakeFile('ciir.json', MB));

      expect(toast.error).toHaveBeenCalledWith('CIIR file must be a .jsonl file.');
      expect(uploadButton().disabled).toBe(true);
    });

    it('accepts the .jsonl extension case-insensitively', () => {
      chooseProject(PROJECT_1);
      chooseFile(fakeFile('CIIR.JSONL', MB));

      expect(toast.error).not.toHaveBeenCalled();
      expect(uploadButton().disabled).toBe(false);
    });

    it('rejects an empty file', () => {
      chooseProject(PROJECT_1);
      chooseFile(fakeFile('ciir.jsonl', 0));

      expect(toast.error).toHaveBeenCalledWith('CIIR file is empty.');
      expect(uploadButton().disabled).toBe(true);
    });

    it('accepts a file dropped on the drop zone', () => {
      chooseProject(PROJECT_1);
      const drop = Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
        dataTransfer: { files: [fakeFile('dropped.jsonl', MB)] },
      });

      root().querySelector('label[for="ciir-file"]')!.dispatchEvent(drop);
      fixture.detectChanges();

      expect(drop.defaultPrevented).toBe(true);
      expect(text()).toContain('dropped.jsonl');
      expect(uploadButton().disabled).toBe(false);
    });
  });

  describe('while the file is uploading', () => {
    it('sends the selected project and file', () => {
      const file = fakeFile('ciir.jsonl', 100 * MB);
      startUpload(file);

      expect(uploadsService.upload).toHaveBeenCalledWith(PROJECT_1, file);
    });

    it('shows bytes sent, total and percentage as progress events arrive', () => {
      startUpload(fakeFile('ciir.jsonl', 100 * MB));

      uploadEvents.next({ kind: 'progress', loaded: 25 * MB, total: 100 * MB });
      fixture.detectChanges();

      expect(text()).toContain('25.0 MB');
      expect(text()).toContain('of 100 MB');
      expect(text()).toContain('25%');
      const bar = root().querySelector('[role="progressbar"]')!;
      expect(bar.getAttribute('aria-valuenow')).toBe('25');
    });

    it('disables the form so nothing changes mid-upload', () => {
      startUpload();

      expect(uploadButton().disabled).toBe(true);
      expect(fileInput().disabled).toBe(true);
    });

    it('explains the wait when every byte is sent but the server has not answered yet', () => {
      startUpload(fakeFile('ciir.jsonl', 100 * MB));

      uploadEvents.next({ kind: 'progress', loaded: 99 * MB, total: 100 * MB });
      fixture.detectChanges();
      expect(text()).not.toContain('waiting for the server');

      uploadEvents.next({ kind: 'progress', loaded: 100 * MB, total: 100 * MB });
      fixture.detectChanges();
      expect(text()).toContain('waiting for the server to finish storing the file');
    });

    it('cancels: aborts the request, returns to the form and lets the user start over', () => {
      startUpload();
      expect(uploadEvents.observed).toBe(true);

      cancelButton()!.click();
      fixture.detectChanges();

      expect(uploadEvents.observed).toBe(false);
      expect(text()).not.toContain('Progress');
      expect(uploadButton().disabled).toBe(false);
      expect(cancelButton()).toBeUndefined();
    });
  });

  describe('after the server accepts the upload', () => {
    it('switches to tracking the server-side processing', () => {
      startUpload();
      emitAccepted();

      expect(uploadsService.watch).toHaveBeenCalledWith('upload-1');
      expect(text()).toContain('indexing continues in the background');
      expect(cancelButton()).toBeUndefined();
    });

    it('shows live status and document/relation counters', () => {
      startUpload();
      emitAccepted();

      watchEvents.next(progressSnapshot('pending'));
      fixture.detectChanges();
      expect(text()).toContain('Queued - waiting for a worker');

      watchEvents.next(progressSnapshot('processing', { indexation: runningIndexation }));
      fixture.detectChanges();

      expect(text()).toContain('Importing documents');
      // dl[0] is the status summary, then the documents and relations counters.
      const [, documents, relations] = Array.from(root().querySelectorAll('dl')).map(
        (dl) => dl.textContent ?? '',
      );
      expect(documents).toContain('1,200');
      expect(documents).toContain('Embeddings reused');
      expect(relations).toContain('2,800');
      expect(relations).toContain('Unresolved');
    });

    it('reports success, and re-enables the form for another upload', () => {
      startUpload();
      emitAccepted();

      watchEvents.next(
        progressSnapshot('processed', {
          indexation: { ...runningIndexation, status: 'completed' },
        }),
      );
      fixture.detectChanges();

      expect(text()).toContain('Indexing completed.');
      expect(toast.success).toHaveBeenCalledWith('CIIR file indexed.');
      expect(uploadButton().disabled).toBe(false);
    });

    it('reports the failure message the server gave for the upload', () => {
      startUpload();
      emitAccepted();

      watchEvents.next(progressSnapshot('failed', { error: 'Malformed CIIR document on line 3' }));
      fixture.detectChanges();

      expect(text()).toContain('Malformed CIIR document on line 3');
      expect(toast.error).toHaveBeenCalledWith('Malformed CIIR document on line 3');
    });

    it('falls back to a generic message when the failed upload carries no error text', () => {
      startUpload();
      emitAccepted();

      watchEvents.next(progressSnapshot('failed'));
      fixture.detectChanges();

      expect(text()).toContain('The server failed to index this file.');
    });

    it('says so when tracking is lost, without claiming the indexing itself failed', () => {
      startUpload();
      emitAccepted();

      watchEvents.error(new HttpErrorResponse({ status: 502 }));
      fixture.detectChanges();

      expect(text()).toContain(
        'Lost track of the upload status. The file may still be processing on the server.',
      );
    });
  });

  describe('when the upload request fails', () => {
    function failWith(error: HttpErrorResponse): void {
      startUpload();
      uploadEvents.error(error);
      fixture.detectChanges();
    }

    it('shows the API problem detail when there is one', () => {
      failWith(
        new HttpErrorResponse({
          status: 400,
          error: { title: 'Bad Request', detail: 'File is not valid JSONL.' },
        }),
      );

      expect(text()).toContain('File is not valid JSONL.');
      expect(toast.error).toHaveBeenCalledWith('File is not valid JSONL.');
    });

    it.each([
      [404, 'The selected project was not found.'],
      [413, 'The file is too large for the server to accept.'],
      [429, 'The server is busy with other uploads. Please try again in a moment.'],
      [0, 'The connection was lost while uploading. Check your network and try again.'],
      [500, 'The upload failed. Please try again.'],
    ])('explains a %i with no body', (status, message) => {
      failWith(new HttpErrorResponse({ status }));

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(text()).toContain(message);
    });

    it('lets the user retry with the same project and file', () => {
      failWith(new HttpErrorResponse({ status: 0 }));

      expect(uploadButton().disabled).toBe(false);
    });
  });

  describe('managing projects', () => {
    const manageButton = (): HTMLButtonElement =>
      Array.from(root().querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Manage projects',
      )!;

    it('opens the projects dialog', () => {
      manageButton().click();

      expect(popupService.open).toHaveBeenCalledWith(ProjectsDialog);
    });

    it('reloads the project options once the dialog closes', () => {
      const projectsService = TestBed.inject(ProjectsService) as unknown as {
        list: ReturnType<typeof vi.fn>;
      };
      projectsService.list.mockReturnValue(
        of([project(PROJECT_1, 'alpha'), project(PROJECT_2, 'beta'), project('3', 'gamma')]),
      );

      manageButton().click();
      expect(projectsService.list).toHaveBeenCalledTimes(1);
      confirmClosed.next(undefined);
      fixture.detectChanges();

      expect(projectsService.list).toHaveBeenCalledTimes(2);
      expect(
        combobox()
          .options()
          .map((o) => o.label),
      ).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('clears the selection when the selected project was deleted meanwhile', () => {
      chooseProject(PROJECT_1);
      const projectsService = TestBed.inject(ProjectsService) as unknown as {
        list: ReturnType<typeof vi.fn>;
      };
      projectsService.list.mockReturnValue(of([project(PROJECT_2, 'beta')]));

      manageButton().click();
      confirmClosed.next(undefined);
      fixture.detectChanges();

      expect(combobox().value()).toBeNull();
    });

    it('keeps the selection when it still exists', () => {
      chooseProject(PROJECT_1);

      manageButton().click();
      confirmClosed.next(undefined);
      fixture.detectChanges();

      expect(combobox().value()).toBe(PROJECT_1);
    });
  });

  describe('leaving the page', () => {
    it('is allowed when nothing is uploading', () => {
      expect(fixture.componentInstance.canLeave()).toBe(true);
      expect(popupService.open).not.toHaveBeenCalled();
    });

    it('is allowed once the server has accepted the file, since indexing continues without the page', () => {
      startUpload();
      emitAccepted();

      expect(fixture.componentInstance.canLeave()).toBe(true);
    });

    it('asks for confirmation mid-upload, and follows the answer', async () => {
      startUpload();

      const stay = leaveDecision();
      confirmClosed.next(false);
      expect(await stay).toBe(false);

      const leave = leaveDecision();
      confirmClosed.next(true);
      expect(await leave).toBe(true);
      expect(popupService.open).toHaveBeenCalledTimes(2);
    });

    it('treats dismissing the confirmation (e.g. Escape) as staying', async () => {
      startUpload();

      const result = leaveDecision();
      confirmClosed.next(undefined);

      expect(await result).toBe(false);
    });

    it('aborts the in-flight upload when the page is destroyed', () => {
      startUpload();
      expect(uploadEvents.observed).toBe(true);

      fixture.destroy();

      expect(uploadEvents.observed).toBe(false);
    });

    it('stops polling when the page is destroyed after acceptance', () => {
      startUpload();
      emitAccepted();
      expect(watchEvents.observed).toBe(true);

      fixture.destroy();

      expect(watchEvents.observed).toBe(false);
    });

    it('warns before the tab is closed or reloaded only while uploading', () => {
      const idle = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(idle);
      expect(idle.defaultPrevented).toBe(false);

      startUpload();
      const uploading = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(uploading);
      expect(uploading.defaultPrevented).toBe(true);
    });
  });
});
