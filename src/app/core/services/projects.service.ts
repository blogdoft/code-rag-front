import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { Project } from '../models/project';

/**
 * Wire shape of `GET /api/v1/projects`. The API serializes snake_case despite
 * `openapi.generated.json` documenting camelCase — confirmed against the live
 * response, which is authoritative over the (stale) generated schema doc.
 */
interface ProjectDto {
  id: number;
  name: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectsService {
  private readonly http = inject(HttpClient);

  list(): Observable<Project[]> {
    return this.http.get<ProjectDto[]>('/api/v1/projects').pipe(map((dtos) => dtos.map(toProject)));
  }
}

function toProject(dto: ProjectDto): Project {
  return { id: dto.id, name: dto.name, createdAt: dto.created_at };
}
