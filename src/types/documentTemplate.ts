export type DocumentFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'multiline'
  | 'phone'
  | 'email'
  | 'boolean';

export interface DocumentTemplateField {
  id: string;
  template_id: string;
  user_id: string;
  field_key: string;
  field_label: string;
  field_type: DocumentFieldType;
  required: boolean;
  sensitive: boolean;
  mask_enabled: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentTemplate {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_system_template: boolean;
  created_at: string;
  updated_at: string;
  fields?: DocumentTemplateField[];
}

export type CustomDocumentData = Record<string, string | number | boolean>;

export interface CreateTemplateFieldDTO {
  id?: string;
  field_key: string;
  field_label: string;
  field_type: DocumentFieldType;
  required?: boolean;
  sensitive?: boolean;
  mask_enabled?: boolean;
  display_order?: number;
}

export interface CreateTemplateDTO {
  name: string;
  description?: string;
  fields: CreateTemplateFieldDTO[];
}

export interface UpdateTemplateDTO {
  name?: string;
  description?: string;
  fields?: CreateTemplateFieldDTO[];
}
