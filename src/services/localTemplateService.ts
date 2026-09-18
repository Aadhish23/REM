import { getDatabase, withTransaction, getActiveUserId } from '../database/database';
import {
  DocumentTemplate,
  DocumentTemplateField,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '../types/documentTemplate';
import { generateUUID } from '../utils/uuid';
import { syncService } from './syncService';

export const localTemplateService = {
  generateFieldKey(label: string): string {
    const cleaned = (label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40);

    return cleaned || 'field';
  },

  async getTemplates(): Promise<{ data: DocumentTemplate[]; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) return { data: [], error: 'User is not authenticated.' };

      const templates = await db.getAllAsync<any>(
        'SELECT * FROM document_templates WHERE user_id = ? ORDER BY created_at ASC',
        [userId]
      );

      if (!templates || templates.length === 0) {
        return { data: [], error: null };
      }

      const templateIds = templates.map((t) => t.id);
      const placeholders = templateIds.map(() => '?').join(',');
      const fields = await db.getAllAsync<any>(
        `SELECT * FROM document_template_fields WHERE template_id IN (${placeholders}) ORDER BY display_order ASC`,
        templateIds
      );

      const fieldsByTemplate: Record<string, DocumentTemplateField[]> = {};
      fields.forEach((f) => {
        if (!fieldsByTemplate[f.template_id]) {
          fieldsByTemplate[f.template_id] = [];
        }
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

      const assembled: DocumentTemplate[] = templates.map((t) => ({
        id: t.id,
        user_id: t.user_id,
        name: t.name,
        description: t.description || null,
        is_system_template: Boolean(t.is_system_template),
        created_at: t.created_at,
        updated_at: t.updated_at,
        fields: fieldsByTemplate[t.id] || [],
      }));

      return { data: assembled, error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Failed to load templates.' };
    }
  },

  async getTemplate(id: string): Promise<{ data: DocumentTemplate | null; error: string | null }> {
    try {
      const db = getDatabase();
      const t = await db.getFirstAsync<any>('SELECT * FROM document_templates WHERE id = ?', [id]);
      if (!t) return { data: null, error: 'Template not found.' };

      const fields = await db.getAllAsync<any>(
        'SELECT * FROM document_template_fields WHERE template_id = ? ORDER BY display_order ASC',
        [id]
      );

      const assembled: DocumentTemplate = {
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

      return { data: assembled, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to load template.' };
    }
  },

  async createTemplate(dto: CreateTemplateDTO): Promise<{ data: DocumentTemplate | null; error: string | null }> {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      return { data: null, error: 'Please enter a template name.' };
    }
    if (!dto.fields || dto.fields.length === 0) {
      return { data: null, error: 'A template must have at least one field.' };
    }

    try {
      const userId = getActiveUserId();
      if (!userId) return { data: null, error: 'User is not authenticated.' };

      const templateId = generateUUID();
      const now = new Date().toISOString();

      const newTemplate: DocumentTemplate = {
        id: templateId,
        user_id: userId,
        name: trimmedName,
        description: dto.description?.trim() || null,
        is_system_template: false,
        created_at: now,
        updated_at: now,
      };

      const fieldsToInsert: DocumentTemplateField[] = dto.fields.map((f, index) => ({
        id: generateUUID(),
        template_id: templateId,
        user_id: userId,
        field_key: f.field_key.trim(),
        field_label: f.field_label.trim(),
        field_type: f.field_type,
        required: Boolean(f.required),
        sensitive: Boolean(f.sensitive),
        mask_enabled: Boolean(f.mask_enabled),
        display_order: index,
        created_at: now,
        updated_at: now,
      }));

      await withTransaction(async (db) => {
        // 1. Insert template
        await db.runAsync(
          `INSERT INTO document_templates (id, user_id, name, description, is_system_template, created_at, updated_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`,
          [newTemplate.id, newTemplate.user_id, newTemplate.name, newTemplate.description ?? null, newTemplate.created_at, newTemplate.updated_at]
        );

        // 2. Enqueue template create
        await db.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'document_template', ?, 'create', ?, ?, 0)`,
          [generateUUID(), userId, newTemplate.id, JSON.stringify(newTemplate), now]
        );

        // 3. Insert fields and enqueue each
        for (const field of fieldsToInsert) {
          await db.runAsync(
            `INSERT INTO document_template_fields
             (id, template_id, user_id, field_key, field_label, field_type, required, sensitive, mask_enabled, display_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              field.id,
              field.template_id,
              field.user_id,
              field.field_key,
              field.field_label,
              field.field_type,
              field.required ? 1 : 0,
              field.sensitive ? 1 : 0,
              field.mask_enabled ? 1 : 0,
              field.display_order,
              field.created_at,
              field.updated_at,
            ]
          );

          await db.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'document_template_field', ?, 'create', ?, ?, 0)`,
            [generateUUID(), userId, field.id, JSON.stringify(field), now]
          );
        }
      });

      newTemplate.fields = fieldsToInsert;
      syncService.syncNow().catch(() => {});

      return { data: newTemplate, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to create template.' };
    }
  },

  async updateTemplate(
    id: string,
    dto: UpdateTemplateDTO
  ): Promise<{ data: DocumentTemplate | null; error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM document_templates WHERE id = ?', [id]);
      if (!existing) return { data: null, error: 'Template not found.' };

      const now = new Date().toISOString();
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      if (!name) return { data: null, error: 'Template name cannot be empty.' };

      const description = dto.description !== undefined ? dto.description.trim() || null : existing.description;

      const updatedTemplate: DocumentTemplate = {
        id: existing.id,
        user_id: existing.user_id,
        name,
        description,
        is_system_template: Boolean(existing.is_system_template),
        created_at: existing.created_at,
        updated_at: now,
      };

      let finalFields: DocumentTemplateField[] = [];

      await withTransaction(async (tx) => {
        // 1. Update template
        await tx.runAsync(
          'UPDATE document_templates SET name = ?, description = ?, updated_at = ? WHERE id = ?',
          [updatedTemplate.name, updatedTemplate.description ?? null, updatedTemplate.updated_at, id]
        );

        // 2. Enqueue template update
        await tx.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'document_template', ?, 'update', ?, ?, 0)`,
          [generateUUID(), updatedTemplate.user_id, id, JSON.stringify(updatedTemplate), now]
        );

        // 3. Reconcile fields if provided
        if (dto.fields) {
          // Delete old fields
          await tx.runAsync('DELETE FROM document_template_fields WHERE template_id = ?', [id]);

          finalFields = dto.fields.map((f, index) => ({
            id: f.id || generateUUID(),
            template_id: id,
            user_id: existing.user_id,
            field_key: f.field_key.trim(),
            field_label: f.field_label.trim(),
            field_type: f.field_type,
            required: Boolean(f.required),
            sensitive: Boolean(f.sensitive),
            mask_enabled: Boolean(f.mask_enabled),
            display_order: index,
            created_at: now,
            updated_at: now,
          }));

          for (const field of finalFields) {
            await tx.runAsync(
              `INSERT INTO document_template_fields
               (id, template_id, user_id, field_key, field_label, field_type, required, sensitive, mask_enabled, display_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                field.id,
                field.template_id,
                field.user_id,
                field.field_key,
                field.field_label,
                field.field_type,
                field.required ? 1 : 0,
                field.sensitive ? 1 : 0,
                field.mask_enabled ? 1 : 0,
                field.display_order,
                field.created_at,
                field.updated_at,
              ]
            );

            await tx.runAsync(
              `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
               VALUES (?, ?, 'document_template_field', ?, 'create', ?, ?, 0)`,
              [generateUUID(), existing.user_id, field.id, JSON.stringify(field), now]
            );
          }
        }
      });

      updatedTemplate.fields = finalFields;
      syncService.syncNow().catch(() => {});

      return { data: updatedTemplate, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to update template.' };
    }
  },

  async getTemplateDocumentsCount(templateId: string): Promise<number> {
    try {
      const db = getDatabase();
      const res = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM documents WHERE template_id = ?',
        [templateId]
      );
      return res?.count || 0;
    } catch {
      return 0;
    }
  },

  async deleteTemplate(id: string): Promise<{ error: string | null }> {
    try {
      const docCount = await this.getTemplateDocumentsCount(id);
      if (docCount > 0) {
        return {
          error: `Cannot delete template: You have ${docCount} saved document${docCount === 1 ? '' : 's'} using it. Please delete those documents first.`,
        };
      }

      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM document_templates WHERE id = ?', [id]);
      if (!existing) return { error: null };

      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        await tx.runAsync('DELETE FROM document_template_fields WHERE template_id = ?', [id]);
        await tx.runAsync('DELETE FROM document_templates WHERE id = ?', [id]);

        await tx.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'document_template', ?, 'delete', NULL, ?, 0)`,
          [generateUUID(), existing.user_id, id, now]
        );
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete template.' };
    }
  },
};
