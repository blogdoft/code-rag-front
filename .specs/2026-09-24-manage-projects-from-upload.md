# Spec: manage projects from the upload screen

Status: Implemented

## 1. Motivation

On `/uploads` the user picks a project from a combobox. If the project doesn't exist yet, they had
to leave the page (losing the selected file), create it on `/projects`, and come back.

## 2. Behaviour

- A **Manage projects** button sits next to the Project combobox on `/uploads`.
- It opens the existing projects screen (`ProjectsPage`: search, add, edit, delete) in a popup.
  `ProjectsDialog` (`features/projects/projects-dialog.*`) is only a shell — title, close button —
  around `<app-projects-page />`, so there's no second implementation of project management.
- When the popup closes (by any means: close button or Escape), `CiirUploadPage` reloads
  `ProjectsService.list()` and refreshes the combobox options.
- If the selected project no longer exists after the reload (deleted in the popup), the selection is
  cleared; otherwise it is kept. The chosen file is never touched.

## 3. Notes

- Escape follows the usual popup rule (see CLAUDE.md): the add/edit form and delete confirmation
  open on top of `ProjectsDialog` via `PopupService` and close first.
- `ProjectsDialog` passes no `isDirty`: the dirty-edit guard belongs to the nested
  `ProjectFormDialog`, not the list.
- The button stays enabled during an upload; the combobox itself is disabled while busy, and the
  selection is only consulted at submit time.
- Tests: `ciir-upload-page.spec.ts` › "managing projects".
