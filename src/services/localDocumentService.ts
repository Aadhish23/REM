import { getDatabase, withTransaction, getActiveUserId } from '../database/database';
import {
  DocumentType,
  DocumentItem,
  DocumentData,
  AadhaarData,
  PanData,
  DrivingLicenseData,
} from '../types/document';
import { DocumentTemplateField, DocumentTemplate } from '../types/documentTemplate';
import { generateUUID } from '../utils/uuid';
import { syncService } from './syncService';

export const localDocumentService = {
  /**
   * Fetches all vault documents for the active user,
   * including joined template information if custom.
   */
  async getDocuments(): Promise<{ data: DocumentItem[]; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) return { data: [], error: 'User is not authenticated.' };

      const docRows = await db.getAllAsync<any>(
        'SELECT * FROM documents WHERE user_id = ? ORDER BY created_at ASC',
        [userId]
      );

      if (!docRows || docRows.length === 0) {
        return { data: [], error: null };
      }

      // Collect template IDs
      const templateIds = docRows
        .map((d) => d.template_id)
        .filter((id): id is string => Boolean(id));

      const templateMap: Record<string, DocumentTemplate> = {};

      if (templateIds.length > 0) {
        const uniqueIds = Array.from(new Set(templateIds));
        const placeholders = uniqueIds.map(() => '?').join(',');
        const tRows = await db.getAllAsync<any>(
          `SELECT * FROM document_templates WHERE id IN (${placeholders})`,
          uniqueIds
        );
        const fRows = await db.getAllAsync<any>(
          `SELECT * FROM document_template_fields WHERE template_id IN (${placeholders}) ORDER BY display_order ASC`,
          uniqueIds
        );

        const fieldsByTemplate: Record<string, DocumentTemplateField[]> = {};
        fRows.forEach((f) => {
          if (!fieldsByTemplate[f.template_id]) fieldsByTemplate[f.template_id] = [];
          fieldsByTemplate[f.template_id].push({
            id: f.id,
            template_id: f.template_id,
            user_id: f.user_id,
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type,
            required: Boolean(f.required),
            sensitive: Boolean(f.sensitive),
            mask_enabled: Boolean(f.mask_enabled),
            display_order: f.display_order,
            created_at: f.created_at,
            updated_at: f.updated_at,
          });
        });

        tRows.forEach((t) => {
          templateMap[t.id] = {
            id: t.id,
            user_id: t.user_id,
            name: t.name,
            description: t.description || null,
            is_system_template: Boolean(t.is_system_template),
            created_at: t.created_at,
            updated_at: t.updated_at,
            fields: fieldsByTemplate[t.id] || [],
          };
        });
      }

      const normalized: DocumentItem[] = docRows.map((r) => {
        let parsedData: DocumentData;
        try {
          parsedData = typeof r.document_data === 'string' ? JSON.parse(r.document_data) : r.document_data;
        } catch {
          parsedData = {} as DocumentData;
        }

        return {
          id: r.id,
          user_id: r.user_id,
          document_type: r.document_type as DocumentType,
          template_id: r.template_id || null,
          document_data: parsedData,
          created_at: r.created_at,
          updated_at: r.updated_at,
          template: r.template_id ? templateMap[r.template_id] || null : null,
        };
      });

      return { data: normalized, error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Failed to load vault documents.' };
    }
  },

  async getDocument(id: string): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const db = getDatabase();
      const r = await db.getFirstAsync<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!r) return { data: null, error: 'Document not found.' };

      let template: DocumentTemplate | null = null;
      if (r.template_id) {
        const t = await db.getFirstAsync<any>('SELECT * FROM document_templates WHERE id = ?', [r.template_id]);
        if (t) {
          const fields = await db.getAllAsync<any>(
            'SELECT * FROM document_template_fields WHERE template_id = ? ORDER BY display_order ASC',
            [r.template_id]
          );
          template = {
            id: t.id,
            user_id: t.user_id,
            name: t.name,
            description: t.description || null,
            is_system_template: Boolean(t.is_system_template),
            created_at: t.created_at,
            updated_at: t.updated_at,
            fields: fields.map((f) => ({
              id: f.id,
              template_id: f.template_id,
              user_id: f.user_id,
              field_key: f.field_key,
              field_label: f.field_label,
              field_type: f.field_type,
              required: Boolean(f.required),
              sensitive: Boolean(f.sensitive),
              mask_enabled: Boolean(f.mask_enabled),
              display_order: f.display_order,
              created_at: f.created_at,
              updated_at: f.updated_at,
            })),
          };
        }
      }

      let parsedData: DocumentData;
      try {
        parsedData = typeof r.document_data === 'string' ? JSON.parse(r.document_data) : r.document_data;
      } catch {
        parsedData = {} as DocumentData;
      }

      const doc: DocumentItem = {
        id: r.id,
        user_id: r.user_id,
        document_type: r.document_type as DocumentType,
        template_id: r.template_id || null,
        document_data: parsedData,
        created_at: r.created_at,
        updated_at: r.updated_at,
        template,
      };

      return { data: doc, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to fetch document.' };
    }
  },

  async getDocumentByType(type: DocumentType): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) return { data: null, error: 'User is not authenticated.' };

      const r = await db.getFirstAsync<any>(
        'SELECT * FROM documents WHERE user_id = ? AND document_type = ?',
        [userId, type]
      );
      if (!r) return { data: null, error: null };

      return this.getDocument(r.id);
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to check document type.' };
    }
  },

  async createDocument(
    documentType: DocumentType,
    documentData: DocumentData,
    templateId?: string | null
  ): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const userId = getActiveUserId();
      if (!userId) return { data: null, error: 'User is not authenticated.' };

      // For built-in types, verify singleton existence
      if (documentType !== 'custom') {
        const existing = await this.getDocumentByType(documentType);
        if (existing.data) {
          return { data: null, error: 'A document of this type already exists in your vault.' };
        }
      }

      const id = generateUUID();
      const now = new Date().toISOString();
      const docDataStr = JSON.stringify(documentData);

      const newDoc: DocumentItem = {
        id,
        user_id: userId,
        document_type: documentType,
        template_id: templateId || null,
        document_data: documentData,
        created_at: now,
        updated_at: now,
      };

      await withTransaction(async (db) => {
        // 1. Insert into SQLite
        await db.runAsync(
          `INSERT INTO documents (id, user_id, document_type, template_id, document_data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [newDoc.id, newDoc.user_id, newDoc.document_type, newDoc.template_id ?? null, docDataStr, newDoc.created_at, newDoc.updated_at]
        );

        // 2. Enqueue create operation
        await db.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'document', ?, 'create', ?, ?, 0)`,
          [generateUUID(), userId, newDoc.id, JSON.stringify(newDoc), now]
        );
      });

      syncService.syncNow().catch(() => {});
      return { data: newDoc, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to create document.' };
    }
  },

  async updateDocument(
    id: string,
    documentData: DocumentData
  ): Promise<{ data: DocumentItem | null; error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!existing) return { data: null, error: 'Document not found.' };

      const now = new Date().toISOString();
      const docDataStr = JSON.stringify(documentData);

      const updatedDoc: DocumentItem = {
        id: existing.id,
        user_id: existing.user_id,
        document_type: existing.document_type as DocumentType,
        template_id: existing.template_id || null,
        document_data: documentData,
        created_at: existing.created_at,
        updated_at: now,
      };

      await withTransaction(async (tx) => {
        // 1. Update SQLite
        await tx.runAsync(
          'UPDATE documents SET document_data = ?, updated_at = ? WHERE id = ?',
          [docDataStr, updatedDoc.updated_at, id]
        );

        // 2. Enqueue update
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          await tx.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?', [
            JSON.stringify(updatedDoc),
            pendingCreate.id,
          ]);
        } else {
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'document', ?, 'update', ?, ?, 0)`,
            [generateUUID(), updatedDoc.user_id, id, JSON.stringify(updatedDoc), now]
          );
        }
      });

      syncService.syncNow().catch(() => {});
      return { data: updatedDoc, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to update document.' };
    }
  },

  async deleteDocument(id: string): Promise<{ error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!existing) return { error: null };

      const userId = existing.user_id;
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        await tx.runAsync('DELETE FROM documents WHERE id = ?', [id]);

        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          await tx.runAsync('DELETE FROM sync_queue WHERE entity_id = ?', [id]);
        } else {
          await tx.runAsync(`DELETE FROM sync_queue WHERE entity_id = ? AND operation = 'update'`, [id]);
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'document', ?, 'delete', NULL, ?, 0)`,
            [generateUUID(), userId, id, now]
          );
        }
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete document.' };
    }
  },

  // --- Formatting, Title, and Masking Helpers ---

  getDisplayName(type: DocumentType, doc?: DocumentItem): string {
    if (type === 'custom') {
      if (doc?.template?.name) return doc.template.name;
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

    if (doc.template?.fields) {
      const textField = doc.template.fields.find(
        (f) => f.field_type === 'text' && !f.sensitive && !f.mask_enabled && data[f.field_key]
      );
      if (textField && data[textField.field_key]) {
        return String(data[textField.field_key]);
      }
    }

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
        if (doc.template?.fields) {
          const maskField = doc.template.fields.find(
            (f) => f.mask_enabled && data[f.field_key]
          );
          if (maskField && data[maskField.field_key]) {
            return String(data[maskField.field_key]);
          }

          const sensField = doc.template.fields.find(
            (f) => f.sensitive && data[f.field_key]
          );
          if (sensField && data[sensField.field_key]) {
            return String(data[sensField.field_key]);
          }
        }

        const idKey = Object.keys(data).find((k) =>
          /(_id|_number|_no|_code|id|number)$/i.test(k)
        );
        if (idKey && data[idKey]) {
          return String(data[idKey]);
        }

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
      case 'driving_license':
        return clean.toUpperCase();
      default:
        return clean;
    }
  },
};
