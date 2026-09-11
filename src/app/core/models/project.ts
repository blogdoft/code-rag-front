export interface Project {
  id: number;
  name: string;
  embeddingModel: string | null;
  embeddingDimensions: number;
  gitUrl: string | null;
  gitRawUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields the API accepts on create/update (`POST`/`PUT /api/v1/projects`). */
export interface ProjectInput {
  name: string;
  embeddingModel: string;
  embeddingDimensions: number;
  gitUrl: string | null;
  gitRawUrl: string | null;
}
