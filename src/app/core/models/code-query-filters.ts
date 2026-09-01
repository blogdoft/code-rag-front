export type FilterOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals';

export interface CodeQueryFieldFilter {
  operator: FilterOperator;
  value: string;
}

export interface CodeQueryFilters {
  kind?: CodeQueryFieldFilter;
  namespace?: CodeQueryFieldFilter;
  typeName?: CodeQueryFieldFilter;
}

export const DEFAULT_FIELD_FILTER: CodeQueryFieldFilter = { operator: 'contains', value: '' };
