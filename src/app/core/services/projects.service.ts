import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, expand, map, reduce, type Observable } from 'rxjs';
import type { Project, ProjectInput } from '../models/project';

/**
 * Wire shape of the Projects endpoints (code-ciir-api). Serializes snake_case — confirmed against
 * the live swagger.json, see .specs/2026-09-10-ciir-api-migration.md. Unlike the old code-rag-api,
 * there's no git_url/git_raw_url (embedding_model/embedding_dimensions instead), and the list
 * endpoint is paginated.
 */
interface ProjectDto {
  id: number;
  name: string | null;
  embedding_model: string | null;
  embedding_dimensions: number;
  git_url: string | null;
  git_raw_url: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectListResponseDto {
  items: ProjectDto[] | null;
  page: number;
  page_size: number;
  total_count: number;
  total_pages: number;
}

interface ProjectRequestDto {
  name: string;
  embedding_model: string;
  embedding_dimensions: number;
  git_url: string | null;
  git_raw_url: string | null;
}

/** The server's own cap on page_size (see swagger.json's `GET /api/v1/projects` description). */
const MAX_PAGE_SIZE = 100;

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches every project across all pages, flattened into one array — the endpoint is paginated
   * server-side, but every consumer of this service (the project combobox, the Projects page's own
   * client-side search) wants the full list, same as before pagination existed. See
   * .specs/2026-09-10-ciir-api-migration.md §4.2 for why this stays a service-internal concern
   * rather than surfacing page/page_size to callers.
   */
  list(): Observable<Project[]> {
    return this.fetchPage(0).pipe(
      expand((response) => (response.page + 1 < response.total_pages ? this.fetchPage(response.page + 1) : EMPTY)),
      reduce<ProjectListResponseDto, ProjectDto[]>((all, response) => [...all, ...(response.items ?? [])], []),
      map((dtos) => dtos.map(toProject)),
    );
  }

  create(input: ProjectInput): Observable<Project> {
    return this.http.post<ProjectDto>('/api/v1/projects', toDto(input)).pipe(map(toProject));
  }

  update(id: number, input: ProjectInput): Observable<Project> {
    return this.http.put<ProjectDto>(`/api/v1/projects/${id}`, toDto(input)).pipe(map(toProject));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/v1/projects/${id}`);
  }

  private fetchPage(page: number): Observable<ProjectListResponseDto> {
    const params = new HttpParams().set('page', page).set('page_size', MAX_PAGE_SIZE);
    return this.http.get<ProjectListResponseDto>('/api/v1/projects', { params });
  }
}

function toProject(dto: ProjectDto): Project {
  return {
    id: dto.id,
    name: dto.name ?? '',
    embeddingModel: dto.embedding_model,
    embeddingDimensions: dto.embedding_dimensions,
    gitUrl: dto.git_url,
    gitRawUrl: dto.git_raw_url,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

function toDto(input: ProjectInput): ProjectRequestDto {
  return {
    name: input.name,
    embedding_model: input.embeddingModel,
    embedding_dimensions: input.embeddingDimensions,
    git_url: input.gitUrl,
    git_raw_url: input.gitRawUrl,
  };

}
