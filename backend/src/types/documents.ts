/**
 * TypeScript Type Definitions for Document Management System
 * Use these types in your frontend application for type safety
 */

export const DOCUMENT_CATEGORIES = [
  "Lab Results",
  "Pathology Reports",
  "Imaging",
  "Insurance Cards",
  "Consent Forms",
  "Referrals",
  "Correspondence",
  "Other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export type DocumentStorage = "local" | "s3";

export type SignatureType = "drawn" | "typed" | "uploaded";

export type DocumentAccessAction = "view" | "download" | "edit" | "delete" | "sign" | "print";

export interface Document {
  id: string;
  tenantId: string;
  patientId: string;
  patientName?: string;
  encounterId?: string;
  title: string;
  type?: string;
  category?: DocumentCategory;
  subcategory?: string;
  description?: string;
  url: string;
  storage: DocumentStorage;
  objectKey?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  ocrText?: string;
  isSigned: boolean;
  signedAt?: string;
  signedBy?: string;
  signedByEmail?: string;
  uploadedBy?: string;
  uploadedByEmail?: string;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadedAt: string;
  changeDescription?: string;
}

export interface DocumentSignature {
  id: string;
  documentId: string;
  tenantId: string;
  signerId: string;
  signerName: string;
  signatureData: string;
  signatureType: SignatureType;
  ipAddress?: string;
  userAgent?: string;
  signedAt: string;
}

export interface DocumentAccessLog {
  id: string;
  documentId: string;
  tenantId: string;
  userId: string;
  action: DocumentAccessAction;
  ipAddress?: string;
  userAgent?: string;
  accessedAt: string;
}

// API Request Types

export interface CreateDocumentRequest {
  patientId: string;
  encounterId?: string;
  title: string;
  type?: string;
  category?: DocumentCategory;
  subcategory?: string;
  description?: string;
  url: string;
  storage?: DocumentStorage;
  objectKey?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
}

export interface CreateDocumentResponse {
  id: string;
  suggestedCategory: string;
}

export interface SignDocumentRequest {
  signatureData: string;
  signatureType: SignatureType;
  signerName: string;
}

export interface SignDocumentResponse {
  success: boolean;
  signatureId: string;
}

export interface UpdateCategoryRequest {
  category: DocumentCategory;
  subcategory?: string;
}

export interface CreateVersionRequest {
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  changeDescription?: string;
}

export interface CreateVersionResponse {
  id: string;
  versionNumber: number;
}

export interface DocumentPreviewResponse {
  previewUrl: string;
  fullUrl: string;
  mimeType?: string;
  storage: DocumentStorage;
  objectKey?: string;
}

export interface ListDocumentsParams {
  category?: DocumentCategory;
  patientId?: string;
  startDate?: string; // ISO 8601
  endDate?: string; // ISO 8601
  uploadedBy?: string;
  signed?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ListDocumentsResponse {
  documents: Document[];
}

export interface ListVersionsResponse {
  versions: DocumentVersion[];
}

export interface CategoriesResponse {
  categories: readonly DocumentCategory[];
}

// Utility Types

export interface FileUploadResult {
  url: string;
  objectKey: string;
  fileSize: number;
  mimeType: string;
  thumbnailUrl?: string;
}

export interface FileValidation {
  valid: boolean;
  error?: string;
}

export interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
}

export interface SecurityCheck {
  secure: boolean;
  reason?: string;
}

// Frontend-specific Types

export interface DocumentCardProps {
  document: Document;
  onView: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
  onSign?: (id: string) => void;
}

export interface DocumentViewerProps {
  documentId: string;
  document?: Document;
  onClose: () => void;
  onSign?: (signature: SignDocumentRequest) => void;
  onDownload?: () => void;
  onPrint?: () => void;
}

export interface DocumentUploadProps {
  patientId: string;
  encounterId?: string;
  onUploadComplete: (documentId: string) => void;
  onCancel: () => void;
}

export interface DocumentFiltersProps {
  categories: readonly DocumentCategory[];
  patients?: Array<{ id: string; name: string }>;
  onFilterChange: (filters: ListDocumentsParams) => void;
}

export type DocumentViewMode = "grid" | "list";

export interface DocumentGridProps {
  documents: Document[];
  viewMode: DocumentViewMode;
  onViewChange: (mode: DocumentViewMode) => void;
  onDocumentClick: (id: string) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

// Constants

export const SUPPORTED_MIME_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/tiff": ".tiff",
  "image/tif": ".tif",
} as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  "Lab Results": "blue",
  "Pathology Reports": "purple",
  "Imaging": "teal",
  "Insurance Cards": "green",
  "Consent Forms": "orange",
  "Referrals": "pink",
  "Correspondence": "gray",
  "Other": "gray",
};

export const FILE_TYPE_ICONS: Record<string, string> = {
  "application/pdf": "file-pdf",
  "image/jpeg": "file-image",
  "image/jpg": "file-image",
  "image/png": "file-image",
  "image/tiff": "file-image",
  "image/tif": "file-image",
};
