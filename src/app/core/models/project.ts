export interface Project {
  id: string;
  name: string;
  gitUrl: string | null;
  gitRawUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the API accepts on create/update (`POST`/`PUT /api/indexer/projects`). */
export interface ProjectInput {
  name: string;
  gitUrl: string | null;
  gitRawUrl: string | null;
}
