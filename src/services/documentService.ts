import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  DocumentType,
  DocumentItem,
  DocumentData,
  AadhaarData,
  PanData,
  DrivingLicenseData,
} from '../types/document';
import { DocumentTemplateField } from '../types/documentTemplate';

/**
 * Maps Supabase / PostgREST errors to safe, user-friendly messages without exposing sensitive details.
 */
function formatDocumentError(error: any, defaultMessage: string): string {
  if (!error) return defaultMessage;

  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to connect')
  ) {
    return 'Unable to save document. Please check your connection and try again.';
  }

  if (
    message.includes('row-level security') ||
    details.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return 'Permission denied by database security (RLS). Please verify your account session.';
  }

  if (message.includes('unique') || details.includes('unique_user_document_type') || details.includes('unique_user_builtin_document_type')) {
    return 'A document of this type already exists in your vault.';
  }

  if (message.includes('jwt expired') || message.includes('invalid claim')) {
    return 'Your session has expired. Please sign in again.';
  }

  return defaultMessage;
}

export const documentService = {
  /**
   * Fetches all vault documents belonging to the authenticated user,
   * including joined template information for custom template documents.
   */
  async getDocuments(): Promise<{ data: DocumentItem[] | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated.' };
        }
      }

      // Try joined query with template and fields
      let documentsData: any[] | null = null;
      const joinedResult = await supabase
        .from('documents')
        .select(`
          *,
          template:document_templates(
            *,
            fields:document_template_fields(*)
          )
        `)
        .order('created_at', { ascending: true });

      if (joinedResult.error) {
        // Fallback to simple select if template join is not yet present
        const simpleResult = await supabase
          .from('documents')
          .select('*')
          .order('created_at', { ascending: true });

        if (simpleResult.error) {
          return { data: null, error: formatDocumentError(simpleResult.error, 'Unable to load your vault. Please try again.') };
        }
        documentsData = simpleResult.data;
      } else {
        documentsData = joinedResult.data;
      }

      // Ensure fields within joined template are sorted by display_order
      const normalized = (documentsData || []).map((doc: any) => {
        if (doc.template && Array.isArray(doc.template.fields)) {
          doc.template.fields.sort(
            (a: DocumentTemplateField, b: DocumentTemplateField) => a.display_order - b.display_order
          );
        }
        return doc as DocumentItem;
      });

      return { data: normalized, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatDocumentError(err, 'Unable to load your vault. Please try again.'),
      };
    }
  },

  /**
   * Fetches a single document by its UUID, including template definition if custom.
   */
  async getDocument(id: string): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated.' };
        }
      }

      const joinedResult = await supabase
        .from('documents')
        .select(`
          *,
          template:document_templates(
            *,
            fields:document_template_fields(*)
          )
        `)
        .eq('id', id)
        .single();

      let docData: any = null;

      if (joinedResult.error || !joinedResult.data) {
        // Fallback to simple select
        const simpleResult = await supabase
          .from('documents')
          .select('*')
          .eq('id', id)
          .single();

        if (simpleResult.error || !simpleResult.data) {
          return { data: null, error: formatDocumentError(simpleResult.error, 'Document not found.') };
        }
        docData = simpleResult.data;
      } else {
        docData = joinedResult.data;
      }

      if (docData.template && Array.isArray(docData.template.fields)) {
        docData.template.fields.sort(
          (a: DocumentTemplateField, b: DocumentTemplateField) => a.display_order - b.display_order
        );
      }

      return { data: docData as DocumentItem, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatDocumentError(err, 'Document not found or unavailable.'),
      };
    }
  },

  /**
   * Fetches a document by document type for the current user (used for built-in singletons).
   */
  async getDocumentByType(type: DocumentType): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated.' };
        }
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('document_type', type);

      if (error) {
        return { data: null, error: formatDocumentError(error, 'Unable to check document status.') };
      }

      if (!data || data.length === 0) {
        return { data: null, error: null };
      }

      return { data: data[0] as DocumentItem, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatDocumentError(err, 'Unable to check document status.'),
      };
    }
  },

  /**
   * Creates a new document record. Supports both built-in types and custom templates.
   */
  async createDocument(
    documentType: DocumentType,
    documentData: DocumentData,
    templateId?: string | null
  ): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let user: User | null | undefined = session?.user;

      if (!user) {
        const { data: { user: fetchedUser }, error: userError } = await supabase.auth.getUser();
        user = fetchedUser;
        if (userError || !user) {
          return { data: null, error: 'User is not authenticated. Please sign in again.' };
        }
      }

      const insertPayload: any = {
        user_id: user.id,
        document_type: documentType,
        document_data: documentData,
      };

      if (templateId) {
        insertPayload.template_id = templateId;
      }

      const { data, error } = await supabase
        .from('documents')
        .insert(insertPayload)
        .select();

      if (error) {
        return { data: null, error: formatDocumentError(error, 'Unable to save document. Please try again.') };
      }

      const createdDoc = data && data.length > 0 ? (data[0] as DocumentItem) : null;
      return { data: createdDoc, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatDocumentError(err, 'Unable to save document. Please try again.'),
      };
    }
  },

  /**
   * Updates an existing document record's structured data.
   */
  async updateDocument(
    id: string,
    documentData: DocumentData
  ): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('documents')
        .update({
          document_data: documentData,
        })
        .eq('id', id)
        .select();

      if (error) {
        return { data: null, error: formatDocumentError(error, 'Unable to save document. Please try again.') };
      }

      const updatedDoc = data && data.length > 0 ? (data[0] as DocumentItem) : null;
      return { data: updatedDoc, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatDocumentError(err, 'Unable to save document. Please try again.'),
      };
    }
  },

  /**
   * Permanently deletes a document by ID.
   */
  async deleteDocument(id: string): Promise<{ error: string | null }> {
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);

      if (error) {
        return { error: formatDocumentError(error, 'Unable to delete document. Please try again.') };
      }

      return { error: null };
    } catch (err) {
      return {
        error: formatDocumentError(err, 'Unable to delete document. Please try again.'),
      };
    }
  },

  /**
   * Helpers for formatting, titles, and masking
   */
  getDisplayName(type: DocumentType, doc?: DocumentItem): string {
    if (type === 'custom') {
      if (doc?.template?.name) {
        return doc.template.name;
      }
      return 'Custom Document';
    }

    switch (type) {
      case 'aadhaar':
        return 'Aadhaar';
      case 'pan':
        return 'PAN';
      case 'driving_license':
        return 'Driving Licence';
      default:
        return 'Document';
    }
  },

  getHolderName(doc: DocumentItem): string {
    if (!doc?.document_data) return '';
    const data = doc.document_data as any;

    if (doc.document_type !== 'custom') {
      return data.name || '';
    }

    // For custom documents, look for common name field keys
    const nameKeys = [
      'name',
      'student_name',
      'owner_name',
      'holder_name',
      'full_name',
      'employee_name',
      'insured_name',
      'candidate_name',
    ];

    for (const k of nameKeys) {
      if (data[k] && typeof data[k] === 'string') {
        return data[k];
      }
    }

    // If template fields are available, find the first non-sensitive text field
    if (doc.template?.fields) {
      const textField = doc.template.fields.find(
        (f) => f.field_type === 'text' && !f.sensitive && !f.mask_enabled && data[f.field_key]
      );
      if (textField && data[textField.field_key]) {
        return String(data[textField.field_key]);
      }
    }

    // Otherwise return first string value
    const firstStrKey = Object.keys(data).find(
      (k) => typeof data[k] === 'string' && data[k].trim() && !k.endsWith('_id') && !k.endsWith('_number')
    );
    return firstStrKey ? String(data[firstStrKey]) : (doc.template?.name || 'Card Holder');
  },

  getIdentifierNumber(doc: DocumentItem): string {
    if (!doc?.document_data) return '';
    const data = doc.document_data as any;

    switch (doc.document_type) {
      case 'aadhaar':
        return (data as AadhaarData).aadhaarNumber || '';
      case 'pan':
        return (data as PanData).panNumber || '';
      case 'driving_license':
        return (data as DrivingLicenseData).licenseNumber || '';
      case 'custom': {
        // Priority 1: Field with mask_enabled = true
        if (doc.template?.fields) {
          const maskField = doc.template.fields.find(
            (f) => f.mask_enabled && data[f.field_key]
          );
          if (maskField && data[maskField.field_key]) {
            return String(data[maskField.field_key]);
          }

          // Priority 2: Field with sensitive = true
          const sensField = doc.template.fields.find(
            (f) => f.sensitive && data[f.field_key]
          );
          if (sensField && data[sensField.field_key]) {
            return String(data[sensField.field_key]);
          }
        }

        // Priority 3: Look for keys ending in _id, _number, _no, _code
        const idKey = Object.keys(data).find((k) =>
          /(_id|_number|_no|_code|id|number)$/i.test(k)
        );
        if (idKey && data[idKey]) {
          return String(data[idKey]);
        }

        // Priority 4: Fallback to first non-empty value
        const firstKey = Object.keys(data)[0];
        return firstKey && data[firstKey] ? String(data[firstKey]) : '';
      }
      default:
        return '';
    }
  },

  getIdentifierLabel(doc: DocumentItem): string {
    switch (doc.document_type) {
      case 'aadhaar':
        return 'Aadhaar Number';
      case 'pan':
        return 'PAN Number';
      case 'driving_license':
        return 'License Number';
      case 'custom': {
        if (doc.template?.fields) {
          const idField = doc.template.fields.find(
            (f) => (f.mask_enabled || f.sensitive) && (doc.document_data as any)[f.field_key]
          );
          if (idField) return idField.field_label;
        }
        return 'Identifier';
      }
      default:
        return 'Number';
    }
  },

  maskNumber(type: DocumentType, numberStr: string): string {
    const clean = (numberStr || '').trim();
    if (!clean) return '';

    switch (type) {
      case 'aadhaar': {
        const last4 = clean.slice(-4);
        return `•••• •••• ${last4}`;
      }
      case 'pan': {
        const last5 = clean.slice(-5);
        return `••••••${last5}`;
      }
      case 'driving_license': {
        const last3 = clean.slice(-3);
        return `•••••••${last3}`;
      }
      case 'custom': {
        if (clean.length <= 4) {
          return '••••';
        }
        const last4 = clean.slice(-4);
        return `••••••${last4}`;
      }
      default:
        return '••••••••';
    }
  },

  formatDisplayNumber(type: DocumentType, numberStr: string): string {
    const clean = (numberStr || '').trim();
    if (!clean) return '';

    switch (type) {
      case 'aadhaar': {
        const rawDigits = clean.replace(/\D/g, '');
        return rawDigits.replace(/(\d{4})(?=\d)/g, '$1 ');
      }
      case 'pan':
        return clean.toUpperCase();
      case 'driving_license':
        return clean.toUpperCase();
      default:
        return clean;
    }
  },
};
