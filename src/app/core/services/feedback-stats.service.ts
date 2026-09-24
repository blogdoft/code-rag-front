import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type {
  FeedbackStats,
  ProjectFeedbackStats,
  WeeklyFeedbackStats,
} from '../models/feedback-stats';
import { ConfigService } from './config.service';

/**
 * Wire shape of `GET /api/code-queries/feedback/stats`. camelCase (body and query params) as of the
 * 2026-09-24 contract change — it was snake_case before; `projectId` is a UUID string.
 */
interface ProjectFeedbackStatsDto {
  projectId: string;
  projectName: string | null;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulPercentage: number;
  notUsefulPercentage: number;
}

interface WeeklyFeedbackStatsDto {
  weekStart: string;
  weekEnd: string;
  projects: ProjectFeedbackStatsDto[] | null;
}

interface FeedbackStatsDto {
  startDate: string;
  endDate: string;
  weeks: WeeklyFeedbackStatsDto[] | null;
}

export interface FeedbackStatsQuery {
  startDate?: string;
  endDate?: string;
  projectId?: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackStatsService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  getStats(query: FeedbackStatsQuery = {}): Observable<FeedbackStats> {
    return this.http
      .get<FeedbackStatsDto>('/api/code-queries/feedback/stats', { params: buildParams(query) })
      .pipe(map(toFeedbackStats));
  }

  /**
   * Downloads the raw, unaggregated feedback rows for the same kind of window as `getStats`, as a
   * CSV file. `createdAt` is rendered by the API in the configured export timezone (Settings) -
   * see code-rag-api's .specs/code-query-feedback-timezone.md - not left to be UTC by default like
   * the JSON contract, since a human is expected to read this file directly.
   */
  exportCsv(query: FeedbackStatsQuery = {}): Observable<HttpResponse<Blob>> {
    const timezone = this.configService.exportTimezone();
    let params = buildParams(query);
    if (timezone) {
      params = params.set('timezone', timezone);
    }

    return this.http.get('/api/code-queries/feedback/export', {
      params,
      responseType: 'blob',
      observe: 'response',
    });
  }
}

function buildParams(query: FeedbackStatsQuery): HttpParams {
  let params = new HttpParams();
  if (query.startDate) {
    params = params.set('startDate', query.startDate);
  }
  if (query.endDate) {
    params = params.set('endDate', query.endDate);
  }
  if (query.projectId != null) {
    params = params.set('projectId', query.projectId);
  }
  return params;
}

function toFeedbackStats(dto: FeedbackStatsDto): FeedbackStats {
  return {
    startDate: dto.startDate,
    endDate: dto.endDate,
    weeks: (dto.weeks ?? []).map(toWeeklyFeedbackStats),
  };
}

function toWeeklyFeedbackStats(dto: WeeklyFeedbackStatsDto): WeeklyFeedbackStats {
  return {
    weekStart: dto.weekStart,
    weekEnd: dto.weekEnd,
    projects: (dto.projects ?? []).map(toProjectFeedbackStats),
  };
}

function toProjectFeedbackStats(dto: ProjectFeedbackStatsDto): ProjectFeedbackStats {
  return {
    projectId: dto.projectId,
    projectName: dto.projectName,
    totalCount: dto.totalCount,
    usefulCount: dto.usefulCount,
    notUsefulCount: dto.notUsefulCount,
    usefulPercentage: dto.usefulPercentage,
    notUsefulPercentage: dto.notUsefulPercentage,
  };
}
