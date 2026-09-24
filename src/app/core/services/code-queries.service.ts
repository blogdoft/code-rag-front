import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { CodeQueryFilters, QualifiedNameFilterOperator } from '../models/code-query-filters';
import type { CodeQueryRelation, CodeQueryResult } from '../models/code-query-result';

/**
 * Wire shape of `POST /api/code-queries`. Serializes camelCase throughout as of the 2026-09-24
 * contract change (see .specs/2026-09-24-camelcase-and-uuid-contract.md) — it was snake_case
 * before. The project is a body field (`projectId`, a UUID string), not part of the URL, and the
 * response is still an envelope (`matches` + `graph`), not a bare array.
 */
interface CodeQueryQualifiedNameFilterDto {
  operator: QualifiedNameFilterOperator;
  value: string;
}

interface CodeQueryRequestDto {
  question: string;
  projectId?: string;
  minSimilarity?: number;
  kind?: string;
  qualifiedName?: CodeQueryQualifiedNameFilterDto;
  limit?: number;
}

interface CodeQueryRelationDto {
  fromId: number | null;
  toId: number | null;
  relationType: string | null;
  targetSymbol: string | null;
  resolutionOrigin: string | null;
}

interface CodeQueryResultDto {
  id: number;
  kind: string | null;
  symbolContainer: string | null;
  symbolName: string | null;
  symbolQualifiedName: string | null;
  symbolCanonicalName: string | null;
  sourceFile: string | null;
  gitUrl: string | null;
  gitRawUrl: string | null;
  embeddingText: string | null;
  similarity: number;
  rerankScore: number | null;
  relations: CodeQueryRelationDto[] | null;
}

interface CodeQueryResponseDto {
  matches: CodeQueryResultDto[] | null;
  // `graph` (up to 2 hops of the relationship graph) is intentionally not mapped here — it's
  // consumed by the MCP-facing side of this API, not this frontend. See
  // .specs/2026-09-10-ciir-api-migration.md §9.
}

export interface CodeQueryFeedbackParams {
  question: string;
  useful: boolean;
  similarities: number[];
  user: string;
  reason?: string;
}

/**
 * Wire shape of `POST /api/code-queries/feedback` — a flat path, with `projectId` (a UUID string)
 * as a body field rather than a URL segment. Every other field is a single lowercase word.
 */
interface CodeQueryFeedbackRequestDto {
  projectId: string;
  question: string;
  useful: boolean;
  similarities: number[];
  reason?: string;
  user: string;
}

@Injectable({ providedIn: 'root' })
export class CodeQueriesService {
  private readonly http = inject(HttpClient);

  ask(
    projectId: string | null,
    question: string,
    filters?: CodeQueryFilters,
  ): Observable<CodeQueryResult[]> {
    return this.http
      .post<CodeQueryResponseDto>('/api/code-queries', toRequestBody(projectId, question, filters))
      .pipe(
        // Deliberately not re-sorted: the API already orders matches (by rerankScore when reranking
        // is configured, else similarity), and re-sorting here would silently discard that.
        map((dto) => (dto.matches ?? []).map(toCodeQueryResult)),
      );
  }

  submitFeedback(projectId: string, params: CodeQueryFeedbackParams): Observable<void> {
    const body: CodeQueryFeedbackRequestDto = {
      projectId,
      question: params.question,
      useful: params.useful,
      similarities: params.similarities,
      user: params.user,
      ...(params.reason ? { reason: params.reason } : {}),
    };
    return this.http.post('/api/code-queries/feedback', body).pipe(map(() => undefined));
  }
}

function toRequestBody(
  projectId: string | null,
  question: string,
  filters?: CodeQueryFilters,
): CodeQueryRequestDto {
  const body: CodeQueryRequestDto = { question };
  if (projectId !== null) {
    body.projectId = projectId;
  }

  const kind = filters?.kind?.trim();
  if (kind) {
    body.kind = kind;
  }

  const qualifiedNameValue = filters?.qualifiedName?.value.trim();
  if (qualifiedNameValue) {
    body.qualifiedName = { operator: filters!.qualifiedName!.operator, value: qualifiedNameValue };
  }

  if (filters?.minSimilarity != null) {
    body.minSimilarity = filters.minSimilarity;
  }

  if (filters?.limit != null) {
    body.limit = filters.limit;
  }

  return body;
}

function toCodeQueryResult(dto: CodeQueryResultDto): CodeQueryResult {
  return {
    id: dto.id,
    kind: dto.kind,
    symbolContainer: dto.symbolContainer,
    symbolName: dto.symbolName,
    symbolQualifiedName: dto.symbolQualifiedName,
    symbolCanonicalName: dto.symbolCanonicalName,
    sourceFile: dto.sourceFile,
    gitUrl: dto.gitUrl,
    gitRawUrl: dto.gitRawUrl,
    embeddingText: dto.embeddingText,
    similarity: dto.similarity,
    rerankScore: dto.rerankScore,
    relations: (dto.relations ?? []).map(toCodeQueryRelation),
  };
}

function toCodeQueryRelation(dto: CodeQueryRelationDto): CodeQueryRelation {
  return {
    fromId: dto.fromId,
    toId: dto.toId,
    relationType: dto.relationType,
    targetSymbol: dto.targetSymbol,
    resolutionOrigin: dto.resolutionOrigin,
  };
}
