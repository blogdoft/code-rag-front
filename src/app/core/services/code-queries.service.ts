import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { CodeQueryFilters, QualifiedNameFilterOperator } from '../models/code-query-filters';
import type { CodeQueryRelation, CodeQueryResult } from '../models/code-query-result';

/**
 * Wire shape of `POST /api/v1/code-queries`. Serializes snake_case throughout — confirmed against
 * the live swagger.json (code-ciir-api, see .specs/2026-09-10-ciir-api-migration.md). Unlike the old
 * code-rag-api, the project is a body field (`project_id`), not part of the URL, and the response is
 * an envelope (`matches` + `graph`), not a bare array.
 */
interface CodeQueryQualifiedNameFilterDto {
  operator: QualifiedNameFilterOperator;
  value: string;
}

interface CodeQueryRequestDto {
  question: string;
  project_id?: number;
  min_similarity?: number;
  kind?: string;
  qualified_name?: CodeQueryQualifiedNameFilterDto;
  limit?: number;
}

interface CodeQueryRelationDto {
  from_id: number | null;
  to_id: number | null;
  relation_type: string | null;
  target_symbol: string | null;
  resolution_origin: string | null;
}

interface CodeQueryResultDto {
  id: number;
  kind: string | null;
  symbol_container: string | null;
  symbol_name: string | null;
  symbol_qualified_name: string | null;
  symbol_canonical_name: string | null;
  source_file: string | null;
  git_url: string | null;
  git_raw_url: string | null;
  embedding_text: string | null;
  similarity: number;
  rerank_score: number | null;
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

/** Wire shape of `POST /api/v1/projects/{projectId}/code-queries/feedback` — unchanged by the
 * code-ciir-api migration. Every field name is already a single lowercase word, so there's no
 * camelCase/snake_case translation to do here. */
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

  ask(projectId: number | null, question: string, filters?: CodeQueryFilters): Observable<CodeQueryResult[]> {
    return this.http
      .post<CodeQueryResponseDto>('/api/v1/code-queries', toRequestBody(projectId, question, filters))
      .pipe(
        map((dto) =>
          (dto.matches ?? [])
            .map(toCodeQueryResult)
            .sort((left, right) => (right.rerankScore ?? -Infinity) - (left.rerankScore ?? -Infinity)),
        ),
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

function toRequestBody(projectId: number | null, question: string, filters?: CodeQueryFilters): CodeQueryRequestDto {
  const body: CodeQueryRequestDto = { question };
  if (projectId !== null) {
    body.project_id = projectId;
  }

  const kind = filters?.kind?.trim();
  if (kind) {
    body.kind = kind;
  }

  const qualifiedNameValue = filters?.qualifiedName?.value.trim();
  if (qualifiedNameValue) {
    body.qualified_name = { operator: filters!.qualifiedName!.operator, value: qualifiedNameValue };
  }

  if (filters?.minSimilarity != null) {
    body.min_similarity = filters.minSimilarity;
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
    symbolContainer: dto.symbol_container,
    symbolName: dto.symbol_name,
    symbolQualifiedName: dto.symbol_qualified_name,
    symbolCanonicalName: dto.symbol_canonical_name,
    sourceFile: dto.source_file,
    gitUrl: dto.git_url,
    gitRawUrl: dto.git_raw_url,
    embeddingText: dto.embedding_text,
    similarity: dto.similarity,
    rerankScore: dto.rerank_score,
    relations: (dto.relations ?? []).map(toCodeQueryRelation),
  };
}

function toCodeQueryRelation(dto: CodeQueryRelationDto): CodeQueryRelation {
  return {
    fromId: dto.from_id,
    toId: dto.to_id,
    relationType: dto.relation_type,
    targetSymbol: dto.target_symbol,
    resolutionOrigin: dto.resolution_origin,
  };
}
