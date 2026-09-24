export type QualifiedNameFilterOperator = 'equals' | 'contains' | 'notContains';

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

export const DEFAULT_QUALIFIED_NAME_FILTER: QualifiedNameFilter = {
  operator: 'contains',
  value: '',
};

/** Human-readable label for an operator, e.g. `notContains` → `not contains`. */
export function qualifiedNameOperatorLabel(operator: QualifiedNameFilterOperator): string {
  return operator.replace(/([A-Z])/g, ' $1').toLowerCase();
}
