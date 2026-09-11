export type QualifiedNameFilterOperator = 'equals' | 'contains' | 'not_contains';

export interface QualifiedNameFilter {
  operator: QualifiedNameFilterOperator;
  value: string;
}

export interface CodeQueryFilters {
  kind?: string;
  qualifiedName?: QualifiedNameFilter;
  minSimilarity?: number;
  limit?: number;
}

export const DEFAULT_QUALIFIED_NAME_FILTER: QualifiedNameFilter = { operator: 'contains', value: '' };
