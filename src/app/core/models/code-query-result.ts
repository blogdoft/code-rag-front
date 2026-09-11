export interface CodeQueryRelation {
  fromId: number | null;
  toId: number | null;
  relationType: string | null;
  targetSymbol: string | null;
  resolutionOrigin: string | null;
}

export interface CodeQueryResult {
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
  relations: CodeQueryRelation[];
}
