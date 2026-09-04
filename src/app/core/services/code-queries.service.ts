import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { CodeQueryFieldFilter, CodeQueryFilters } from '../models/code-query-filters';
import type { CodeQueryResult } from '../models/code-query-result';

/**
 * Wire shape of `POST /api/v1/projects/{projectId}/code-queries`. The API
 * serializes snake_case, except `gitRawUrl`, which stays camelCase — confirmed
 * against the live response.
 */
interface CodeQueryResultDto {
  id: number;
  source_file: string | null;
  gitRawUrl: string | null;
  kind: string;
  type_name: string | null;
  member: string | null;
  embedding_text: string;
  similarity: number;
}

interface CodeQueryFieldFilterDto {
  operator: string;
  value: string;
}

interface CodeQueryRequestDto {
  question: string;
  kind?: CodeQueryFieldFilterDto;
  namespace?: CodeQueryFieldFilterDto;
  type_name?: CodeQueryFieldFilterDto;
}

export interface CodeQueryFeedbackParams {
  question: string;
  useful: boolean;
  similarities: number[];
  user: string;
  reason?: string;
}

/** Wire shape of `POST /api/v1/projects/{projectId}/code-queries/feedback`. Every field name is
 * already a single lowercase word, so there's no camelCase/snake_case translation to do here. */
interface CodeQueryFeedbackRequestDto {
  question: string;
  useful: boolean;
  similarities: number[];
  reason?: string;
  user: string;
}

@Injectable({ providedIn: 'root' })
export class CodeQueriesService {
  private readonly http = inject(HttpClient);

  ask(projectId: number, question: string, filters?: CodeQueryFilters): Observable<CodeQueryResult[]> {
    return this.http
      .post<CodeQueryResultDto[]>(`/api/v1/projects/${projectId}/code-queries`, toRequestBody(question, filters))
      .pipe(
        map((dtos) => dtos.map(toCodeQueryResult).sort((a, b) => b.similarity - a.similarity)),
      );
  }

  submitFeedback(projectId: number, params: CodeQueryFeedbackParams): Observable<void> {
    const body: CodeQueryFeedbackRequestDto = {
      question: params.question,
      useful: params.useful,
      similarities: params.similarities,
      user: params.user,
      ...(params.reason ? { reason: params.reason } : {}),
    };
    return this.http
      .post(`/api/v1/projects/${projectId}/code-queries/feedback`, body)
      .pipe(map(() => undefined));
  }
}

function toRequestBody(question: string, filters?: CodeQueryFilters): CodeQueryRequestDto {
  const body: CodeQueryRequestDto = { question };

  const kind = toFieldFilterDto(filters?.kind);
  if (kind) {
    body.kind = kind;
  }

  const namespace = toFieldFilterDto(filters?.namespace);
  if (namespace) {
    body.namespace = namespace;
  }

  const typeName = toFieldFilterDto(filters?.typeName);
  if (typeName) {
    body.type_name = typeName;
  }

  return body;
}

function toFieldFilterDto(filter: CodeQueryFieldFilter | undefined): CodeQueryFieldFilterDto | undefined {
  if (!filter) {
    return undefined;
  }
  const value = filter.value.trim();
  return value.length > 0 ? { operator: filter.operator, value } : undefined;
}

function toCodeQueryResult(dto: CodeQueryResultDto): CodeQueryResult {
  return {
    id: dto.id,
    sourceFile: dto.source_file,
    gitRawUrl: dto.gitRawUrl,
    kind: dto.kind,
    typeName: dto.type_name,
    member: dto.member,
    embeddingText: dto.embedding_text,
    similarity: dto.similarity,
  };
}
