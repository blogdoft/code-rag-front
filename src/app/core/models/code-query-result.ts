export interface CodeQueryResult {
  id: number;
  sourceFile: string | null;
  kind: string;
  typeName: string | null;
  member: string | null;
  embeddingText: string;
  similarity: number;
}
