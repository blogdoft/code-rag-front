/** A registered document type (`/api/v1/document-types`); `name` is unique ignoring case. */
export interface DocumentType {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** A registered document language (`/api/v1/document-languages`); `code` is a BCP 47 tag, unique ignoring case. */
export interface DocumentLanguage {
  id: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

/** Same pattern the API enforces on a language `code`. */
export const LANGUAGE_CODE_PATTERN = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
export const LANGUAGE_CODE_MAX_LENGTH = 35;
export const TYPE_NAME_MAX_LENGTH = 100;
