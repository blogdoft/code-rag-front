import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { Project, ProjectInput } from '../models/project';

/**
 * Wire shape of the Projects endpoints. The API serializes snake_case despite
 * `openapi.generated.json` documenting camelCase — confirmed against the live
 * response, which is authoritative over the (stale) generated schema doc.
 */
interface ProjectDto {
  id: number;
  name: string;
  git_url: string | null;
  git_raw_url: string | null;
  created_at: string;
}

interface ProjectRequestDto {
  name: string;
  git_url: string;
  git_raw_url: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Project[]> {
    return this.http.get<ProjectDto[]>('/api/v1/projects').pipe(map((dtos) => dtos.map(toProject)));
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
}

function toProject(dto: ProjectDto): Project {
  return { id: dto.id, name: dto.name, gitUrl: dto.git_url, gitRawUrl: dto.git_raw_url, createdAt: dto.created_at };
}

function toDto(input: ProjectInput): ProjectRequestDto {
  return { name: input.name, git_url: input.gitUrl, git_raw_url: input.gitRawUrl };
}
