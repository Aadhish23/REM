import { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import {
  DocumentTemplate,
  DocumentTemplateField,
  CreateTemplateDTO,
  UpdateTemplateDTO,
} from '../types/documentTemplate';

function formatTemplateError(error: any, defaultMessage: string): string {
  if (!error) return defaultMessage;

  const message = (error.message || '').toLowerCase();
  const details = (error.details || '').toLowerCase();

  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to connect')
  ) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }

  if (
    message.includes('row-level security') ||
    details.includes('row-level security') ||
    message.includes('permission denied')
  ) {
    return 'Permission denied by database security (RLS). Please verify your account session.';
  }

  if (message.includes('unique') || details.includes('unique_user_template_name')) {
    return 'A template with this name already exists. Please choose a different name.';
  }

  if (message.includes('jwt expired') || message.includes('invalid claim')) {
    return 'Your session has expired. Please sign in again.';
  }

  return defaultMessage;
}

export const documentTemplateService = {
  /**
   * Helper to generate a clean snake_case field key from a user-friendly label.
   */
  generateFieldKey(label: string): string {
    const cleaned = (label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 40);

    return cleaned || 'field';
  },

  /**
   * Fetches all document templates for the authenticated user, including their fields.
   */
  async getTemplates(): Promise<{ data: DocumentTemplate[] | null; error: string | null }> {
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

      // Fetch templates
      const { data: templates, error: templatesError } = await supabase
        .from('document_templates')
        .select('*')
        .order('created_at', { ascending: true });

      if (templatesError) {
        return {
          data: null,
          error: formatTemplateError(templatesError, 'Unable to load templates. Please try again.'),
        };
      }

      if (!templates || templates.length === 0) {
        return { data: [], error: null };
      }

      // Fetch all fields for these templates
      const templateIds = templates.map((t) => t.id);
      const { data: fields, error: fieldsError } = await supabase
        .from('document_template_fields')
        .select('*')
        .in('template_id', templateIds)
        .order('display_order', { ascending: true });

      if (fieldsError) {
        return {
          data: null,
          error: formatTemplateError(fieldsError, 'Unable to load template fields.'),
        };
      }

      // Group fields by template_id
      const fieldsByTemplate: Record<string, DocumentTemplateField[]> = {};
      (fields || []).forEach((field) => {
        if (!fieldsByTemplate[field.template_id]) {
          fieldsByTemplate[field.template_id] = [];
        }
        fieldsByTemplate[field.template_id].push(field as DocumentTemplateField);
      });

      const assembled: DocumentTemplate[] = templates.map((t) => ({
        ...t,
        fields: fieldsByTemplate[t.id] || [],
      }));

      return { data: assembled, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatTemplateError(err, 'Unable to load templates. Please try again.'),
      };
    }
  },

  /**
   * Fetches a single template by ID, including its fields.
   */
  async getTemplate(id: string): Promise<{ data: DocumentTemplate | null; error: string | null }> {
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

      const { data: template, error: templateError } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (templateError || !template) {
        return {
          data: null,
          error: formatTemplateError(templateError, 'Template not found.'),
        };
      }

      const { data: fields, error: fieldsError } = await supabase
        .from('document_template_fields')
        .select('*')
        .eq('template_id', id)
        .order('display_order', { ascending: true });

      if (fieldsError) {
        return {
          data: null,
          error: formatTemplateError(fieldsError, 'Unable to load template fields.'),
        };
      }

      return {
        data: {
          ...template,
          fields: (fields || []) as DocumentTemplateField[],
        },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: formatTemplateError(err, 'Unable to load template.'),
      };
    }
  },

  /**
   * Creates a new template with its fields.
   */
  async createTemplate(dto: CreateTemplateDTO): Promise<{ data: DocumentTemplate | null; error: string | null }> {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      return { data: null, error: 'Please enter a template name.' };
    }
    if (!dto.fields || dto.fields.length === 0) {
      return { data: null, error: 'A template must have at least one field.' };
    }

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

      // 1. Insert template
      const { data: templateData, error: templateError } = await supabase
        .from('document_templates')
        .insert({
          user_id: user.id,
          name: trimmedName,
          description: dto.description?.trim() || null,
        })
        .select()
        .single();

      if (templateError || !templateData) {
        return {
          data: null,
          error: formatTemplateError(templateError, 'Unable to create template. Please try again.'),
        };
      }

      // 2. Insert fields
      const fieldsToInsert = dto.fields.map((f, index) => ({
        template_id: templateData.id,
        user_id: user.id,
        field_key: f.field_key.trim(),
        field_label: f.field_label.trim(),
        field_type: f.field_type,
        required: Boolean(f.required),
        sensitive: Boolean(f.sensitive),
        mask_enabled: Boolean(f.mask_enabled),
        display_order: index,
      }));

      const { data: createdFields, error: fieldsError } = await supabase
        .from('document_template_fields')
        .insert(fieldsToInsert)
        .select()
        .order('display_order', { ascending: true });

      if (fieldsError) {
        // Rollback template if fields failed
        await supabase.from('document_templates').delete().eq('id', templateData.id);
        return {
          data: null,
          error: formatTemplateError(fieldsError, 'Unable to save template fields.'),
        };
      }

      return {
        data: {
          ...templateData,
          fields: (createdFields || []) as DocumentTemplateField[],
        },
        error: null,
      };
    } catch (err) {
      return {
        data: null,
        error: formatTemplateError(err, 'Unable to create template. Please try again.'),
      };
    }
  },

  /**
   * Updates an existing template and reconciles its fields.
   */
  async updateTemplate(
    id: string,
    dto: UpdateTemplateDTO
  ): Promise<{ data: DocumentTemplate | null; error: string | null }> {
    if (dto.name !== undefined && !dto.name.trim()) {
      return { data: null, error: 'Template name cannot be empty.' };
    }
    if (dto.fields && dto.fields.length === 0) {
      return { data: null, error: 'A template must have at least one field.' };
    }

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

      // 1. Update template details
      const updatePayload: any = {};
      if (dto.name !== undefined) updatePayload.name = dto.name.trim();
      if (dto.description !== undefined) updatePayload.description = dto.description.trim() || null;

      const { data: updatedTemplate, error: templateError } = await supabase
        .from('document_templates')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (templateError || !updatedTemplate) {
        return {
          data: null,
          error: formatTemplateError(templateError, 'Unable to update template.'),
        };
      }

      // 2. Reconcile fields if provided
      if (dto.fields) {
        // Delete previous fields
        await supabase.from('document_template_fields').delete().eq('template_id', id);

        // Re-insert current fields
        const fieldsToInsert = dto.fields.map((f, index) => ({
          template_id: id,
          user_id: user.id,
          field_key: f.field_key.trim(),
          field_label: f.field_label.trim(),
          field_type: f.field_type,
          required: Boolean(f.required),
          sensitive: Boolean(f.sensitive),
          mask_enabled: Boolean(f.mask_enabled),
          display_order: index,
        }));

        const { data: fieldsData, error: fieldsError } = await supabase
          .from('document_template_fields')
          .insert(fieldsToInsert)
          .select()
          .order('display_order', { ascending: true });

        if (fieldsError) {
          return {
            data: null,
            error: formatTemplateError(fieldsError, 'Unable to update template fields.'),
          };
        }

        return {
          data: {
            ...updatedTemplate,
            fields: (fieldsData || []) as DocumentTemplateField[],
          },
          error: null,
        };
      }

      return { data: updatedTemplate, error: null };
    } catch (err) {
      return {
        data: null,
        error: formatTemplateError(err, 'Unable to update template. Please try again.'),
      };
    }
  },

  /**
   * Returns count of documents created with this template.
   */
  async getTemplateDocumentsCount(templateId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('template_id', templateId);

      if (error) return 0;
      return count || 0;
    } catch {
      return 0;
    }
  },

  /**
   * Safely deletes a template.
   * If documents are currently using it, warns and prevents deletion to protect data.
   */
  async deleteTemplate(id: string): Promise<{ error: string | null }> {
    try {
      const docCount = await this.getTemplateDocumentsCount(id);
      if (docCount > 0) {
        return {
          error: `Cannot delete template: You have ${docCount} saved document${docCount === 1 ? '' : 's'} using it. Please delete those documents first.`,
        };
      }

      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', id);

      if (error) {
        return {
          error: formatTemplateError(error, 'Unable to delete template. Please try again.'),
        };
      }

      return { error: null };
    } catch (err) {
      return {
        error: formatTemplateError(err, 'Unable to delete template. Please try again.'),
      };
    }
  },
};
