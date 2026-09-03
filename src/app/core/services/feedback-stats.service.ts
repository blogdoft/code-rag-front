import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { FeedbackStats, ProjectFeedbackStats, WeeklyFeedbackStats } from '../models/feedback-stats';

/**
 * Wire shape of `GET /api/v1/code-queries/feedback/stats`. Snake_case, confirmed
 * against the live swagger.json (per CLAUDE.md's "trust the live response" rule).
 */
interface ProjectFeedbackStatsDto {
  project_id: number;
  project_name: string | null;
  total_count: number;
  useful_count: number;
  not_useful_count: number;
  useful_percentage: number;
  not_useful_percentage: number;
}

interface WeeklyFeedbackStatsDto {
  week_start: string;
  week_end: string;
  projects: ProjectFeedbackStatsDto[] | null;
}

interface FeedbackStatsDto {
  start_date: string;
  end_date: string;
  weeks: WeeklyFeedbackStatsDto[] | null;
}

export interface FeedbackStatsQuery {
  startDate?: string;
  endDate?: string;
  projectId?: number;
}

@Injectable({ providedIn: 'root' })
export class FeedbackStatsService {
  private readonly http = inject(HttpClient);

  getStats(query: FeedbackStatsQuery = {}): Observable<FeedbackStats> {
    let params = new HttpParams();
    if (query.startDate) {
      params = params.set('start_date', query.startDate);
    }
    if (query.endDate) {
      params = params.set('end_date', query.endDate);
    }
    if (query.projectId != null) {
      params = params.set('project_id', query.projectId);
    }

    return this.http
      .get<FeedbackStatsDto>('/api/v1/code-queries/feedback/stats', { params })
      .pipe(map(toFeedbackStats));
  }
}

function toFeedbackStats(dto: FeedbackStatsDto): FeedbackStats {
  return {
    startDate: dto.start_date,
    endDate: dto.end_date,
    weeks: (dto.weeks ?? []).map(toWeeklyFeedbackStats),
  };
}

function toWeeklyFeedbackStats(dto: WeeklyFeedbackStatsDto): WeeklyFeedbackStats {
  return {
    weekStart: dto.week_start,
    weekEnd: dto.week_end,
    projects: (dto.projects ?? []).map(toProjectFeedbackStats),
  };
}

function toProjectFeedbackStats(dto: ProjectFeedbackStatsDto): ProjectFeedbackStats {
  return {
    projectId: dto.project_id,
    projectName: dto.project_name,
    totalCount: dto.total_count,
    usefulCount: dto.useful_count,
    notUsefulCount: dto.not_useful_count,
    usefulPercentage: dto.useful_percentage,
    notUsefulPercentage: dto.not_useful_percentage,
  };
}
