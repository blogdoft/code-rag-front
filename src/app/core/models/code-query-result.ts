export interface CodeQueryResult {
  id: number;
  sourceFile: string | null;
  gitRawUrl: string | null;
  kind: string;
  typeName: string | null;
  member: string | null;
  embeddingText: string;
  similarity: number;
}
