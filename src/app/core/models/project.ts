export interface Project {
  id: number;
  name: string;
  gitUrl: string | null;
  gitRawUrl: string | null;
  createdAt: string;
}

/** Fields the API accepts on create/update (`POST`/`PUT /api/v1/projects`). */
export interface ProjectInput {
  name: string;
  gitUrl: string;
  gitRawUrl: string;
}
