import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { DocumentType } from '../models/document-master-data';
import { MasterDataStore } from './master-data-store';

interface DocumentTypeDto {
  id: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

/** CRUD of the document-type master data (Doc RAG Ingestion API, `/api/v1/document-types`). */
@Injectable({ providedIn: 'root' })
export class DocumentTypesService extends MasterDataStore<DocumentTypeDto, DocumentType> {
  constructor() {
    super(
      inject(HttpClient),
      '/api/doc-rag/api/v1/document-types',
      (dto) => ({
        id: dto.id,
        name: dto.name ?? '',
        createdAt: dto.createdAt,
        updatedAt: dto.updatedAt,
      }),
      (type) => type.name,
    );
  }

  create(name: string): Observable<DocumentType> {
    return this.post({ name });
  }

  update(id: string, name: string): Observable<DocumentType> {
    return this.put(id, { name });
  }
}
