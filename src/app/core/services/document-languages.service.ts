import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { DocumentLanguage } from '../models/document-master-data';
import { MasterDataStore } from './master-data-store';

interface DocumentLanguageDto {
  id: string;
  code: string | null;
  createdAt: string;
  updatedAt: string;
}

/** CRUD of the document-language master data (Doc RAG Ingestion API, `/api/v1/document-languages`). */
@Injectable({ providedIn: 'root' })
export class DocumentLanguagesService extends MasterDataStore<
  DocumentLanguageDto,
  DocumentLanguage
> {
  constructor() {
    super(
      inject(HttpClient),
      '/api/doc-rag/api/v1/document-languages',
      (dto) => ({
        id: dto.id,
        code: dto.code ?? '',
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      }),
      (language) => language.code,
    );
  }

  create(code: string): Observable<DocumentLanguage> {
    return this.post({ code });
  }

  update(id: string, code: string): Observable<DocumentLanguage> {
    return this.put(id, { code });
  }
}
