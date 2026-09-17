import { DocumentTemplate, CustomDocumentData } from './documentTemplate';

export type DocumentType = 'aadhaar' | 'pan' | 'driving_license' | 'custom';

export interface AadhaarData {
  aadhaarNumber: string;
  name: string;
  dateOfBirth: string;
}

export interface PanData {
  panNumber: string;
  name: string;
}

export interface DrivingLicenseData {
  licenseNumber: string;
  name: string;
  dateOfBirth: string;
  validFrom: string;
  validUntil: string;
}

export type DocumentData =
  | AadhaarData
  | PanData
  | DrivingLicenseData
  | CustomDocumentData;

export interface DocumentItem<T extends DocumentData = DocumentData> {
  id: string;
  user_id: string;
  document_type: DocumentType;
  template_id?: string | null;
  document_data: T;
  created_at: string;
  updated_at: string;
  template?: DocumentTemplate | null;
}

export type VaultStackParamList = {
  VaultList: undefined;
  DocumentView: { documentId: string };
  DocumentEditor: {
    documentId?: string;
    documentType?: DocumentType;
    templateId?: string;
  };
  TemplateList: undefined;
  TemplateEditor: { templateId?: string };
};

export * from './documentTemplate';
