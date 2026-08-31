import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { CodeQueryResult } from '../models/code-query-result';

/**
 * Wire shape of `POST /api/v1/projects/{projectId}/code-queries`. The API
 * serializes snake_case despite `openapi.generated.json` documenting camelCase —
 * confirmed against the live response, which is authoritative over the (stale)
 * generated schema doc.
 */
interface CodeQueryResultDto {
  id: number;
  source_file: string | null;
  kind: string;
  type_name: string | null;
  member: string | null;
  embedding_text: string;
  similarity: number;
}

@Injectable({ providedIn: 'root' })
export class CodeQueriesService {
  private readonly http = inject(HttpClient);

  ask(projectId: number, question: string): Observable<CodeQueryResult[]> {
    return this.http
      .post<CodeQueryResultDto[]>(`/api/v1/projects/${projectId}/code-queries`, { question })
      .pipe(map((dtos) => dtos.map(toCodeQueryResult)));
  }
}

function toCodeQueryResult(dto: CodeQueryResultDto): CodeQueryResult {
  return {
    id: dto.id,
    sourceFile: dto.source_file,
    kind: dto.kind,
    typeName: dto.type_name,
    member: dto.member,
    embeddingText: dto.embedding_text,
    similarity: dto.similarity,
  };
}
