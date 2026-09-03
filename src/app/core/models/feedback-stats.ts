export interface ProjectFeedbackStats {
  projectId: number;
  projectName: string | null;
  totalCount: number;
  usefulCount: number;
  notUsefulCount: number;
  usefulPercentage: number;
  notUsefulPercentage: number;
}

export interface WeeklyFeedbackStats {
  weekStart: string;
  weekEnd: string;
  projects: ProjectFeedbackStats[];
}

export interface FeedbackStats {
  startDate: string;
  endDate: string;
  weeks: WeeklyFeedbackStats[];
}
