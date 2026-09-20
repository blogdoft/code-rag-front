import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, expand, map, reduce, type Observable } from 'rxjs';
import type { Project, ProjectInput } from '../models/project';

/**
 * Wire shape of the Projects endpoints — moved off code-ciir-api onto the separate CIIR Indexer
 * API (`/api/indexer/projects`, host `blogdoft.home.arpa/code-brain`) as of 2026-09-18, see
 * openapi.indexer.generated.json. Unlike the old code-ciir-api contract, body fields here are
 * camelCase, not snake_case — only the `page`/`page_size` *query* params stay snake_case. `id` and
 * `embeddingDimensions` are typed by the server as int64/int32-or-string (JS-number-precision
 * safety for int64), so both are normalized through `Number(...)` below.
 */
interface ProjectDto {
  id: number | string;
  name: string | null;
  embeddingModel: string | null;
  embeddingDimensions: number | string;
  gitUrl: string | null;
  gitRawUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectListResponseDto {
  items: ProjectDto[] | null;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

interface ProjectRequestDto {
  name: string;
  embeddingModel: string;
  embeddingDimensions: number;
  gitUrl: string | null;
  gitRawUrl: string | null;
}

/**
 * Page size requested per fetch. The indexer API's `GET /api/indexer/projects` no longer documents
 * a server-side cap (unlike the old code-ciir-api's confirmed 100), but 100 is kept as a reasonable
 * default; `list()` still follows `totalPages` regardless of what the server actually honors.
 */
const MAX_PAGE_SIZE = 100;

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  /**
   * Fetches every project across all pages, flattened into one array — the endpoint is paginated
   * server-side, but every consumer of this service (the project combobox, the Projects page's own
   * client-side search) wants the full list, same as before pagination existed. See
   * .specs/2026-09-10-ciir-api-migration.md §4.2 for why this stays a service-internal concern
   * rather than surfacing page/page_size to callers — still true after the indexer-API move.
   */
  list(): Observable<Project[]> {
    return this.fetchPage(0).pipe(
      expand((response) =>
        response.page + 1 < response.totalPages ? this.fetchPage(response.page + 1) : EMPTY,
      ),
      reduce<ProjectListResponseDto, ProjectDto[]>(
        (all, response) => [...all, ...(response.items ?? [])],
        [],
      ),
      map((dtos) => dtos.map(toProject)),
    );
  }

  create(input: ProjectInput): Observable<Project> {
    return this.http.post<ProjectDto>('/api/indexer/projects', toDto(input)).pipe(map(toProject));
  }

  update(id: number, input: ProjectInput): Observable<Project> {
    return this.http
      .put<ProjectDto>(`/api/indexer/projects/${id}`, toDto(input))
      .pipe(map(toProject));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`/api/indexer/projects/${id}`);
  }

  private fetchPage(page: number): Observable<ProjectListResponseDto> {
    const params = new HttpParams().set('page', page).set('page_size', MAX_PAGE_SIZE);
    return this.http.get<ProjectListResponseDto>('/api/indexer/projects', { params });
  }
}

function toProject(dto: ProjectDto): Project {
  return {
    id: Number(dto.id),
    name: dto.name ?? '',
    embeddingModel: dto.embeddingModel,
    embeddingDimensions: Number(dto.embeddingDimensions),
    gitUrl: dto.gitUrl,
    gitRawUrl: dto.gitRawUrl,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toDto(input: ProjectInput): ProjectRequestDto {
  return {
    name: input.name,
    embeddingModel: input.embeddingModel,
    embeddingDimensions: input.embeddingDimensions,
    gitUrl: input.gitUrl,
    gitRawUrl: input.gitRawUrl,
  };
}
