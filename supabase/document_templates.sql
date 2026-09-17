-- ==============================================================================
-- REM: Phase 7.5 Custom Document Template System
-- Purpose: Extensible dynamic document templates & fields with Row Level Security.
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ==============================================================================

-- 1. Create public.document_templates table
CREATE TABLE IF NOT EXISTS public.document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_system_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT unique_user_template_name UNIQUE (user_id, name)
);

-- Ensure user_id defaults to auth.uid()
ALTER TABLE public.document_templates ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Create public.document_template_fields table
CREATE TABLE IF NOT EXISTS public.document_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.document_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  mask_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT check_field_type CHECK (
    field_type IN ('text', 'number', 'date', 'multiline', 'phone', 'email', 'boolean')
  ),
  CONSTRAINT unique_template_field_key UNIQUE (template_id, field_key)
);

-- Ensure user_id defaults to auth.uid()
ALTER TABLE public.document_template_fields ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 3. Evolve public.documents table for template compatibility
-- Add template_id referencing document_templates (ON DELETE RESTRICT prevents deleting templates in active use)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS template_id UUID
  REFERENCES public.document_templates(id)
  ON DELETE RESTRICT;

-- Allow 'custom' alongside built-in document types
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS check_document_type;
ALTER TABLE public.documents ADD CONSTRAINT check_document_type
  CHECK (document_type IN ('aadhaar', 'pan', 'driving_license', 'custom'));

-- Convert unique constraint on public.documents to a partial unique index
-- Built-in documents remain strictly 1 per user; custom templates allow multiple documents
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS unique_user_document_type;
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_builtin_document_type
  ON public.documents (user_id, document_type)
  WHERE document_type IN ('aadhaar', 'pan', 'driving_license');

-- 4. Explicit Postgres Grants
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON TABLE public.document_templates TO authenticated;
GRANT ALL ON TABLE public.document_templates TO service_role;
GRANT ALL ON TABLE public.document_template_fields TO authenticated;
GRANT ALL ON TABLE public.document_template_fields TO service_role;

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_document_templates_user_id
  ON public.document_templates(user_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_template_fields_template_id_order
  ON public.document_template_fields(template_id, display_order ASC);

CREATE INDEX IF NOT EXISTS idx_documents_template_id
  ON public.documents(template_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_fields ENABLE ROW LEVEL SECURITY;

-- 7. Row Level Security Policies for document_templates
DROP POLICY IF EXISTS "Users can view own templates" ON public.document_templates;
CREATE POLICY "Users can view own templates"
  ON public.document_templates
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own templates" ON public.document_templates;
CREATE POLICY "Users can insert own templates"
  ON public.document_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own templates" ON public.document_templates;
CREATE POLICY "Users can update own templates"
  ON public.document_templates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own templates" ON public.document_templates;
CREATE POLICY "Users can delete own templates"
  ON public.document_templates
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 8. Row Level Security Policies for document_template_fields
DROP POLICY IF EXISTS "Users can view own template fields" ON public.document_template_fields;
CREATE POLICY "Users can view own template fields"
  ON public.document_template_fields
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own template fields" ON public.document_template_fields;
CREATE POLICY "Users can insert own template fields"
  ON public.document_template_fields
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own template fields" ON public.document_template_fields;
CREATE POLICY "Users can update own template fields"
  ON public.document_template_fields
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own template fields" ON public.document_template_fields;
CREATE POLICY "Users can delete own template fields"
  ON public.document_template_fields
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 9. Automatic updated_at Triggers
DROP TRIGGER IF EXISTS trigger_set_document_templates_updated_at ON public.document_templates;
CREATE TRIGGER trigger_set_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trigger_set_template_fields_updated_at ON public.document_template_fields;
CREATE TRIGGER trigger_set_template_fields_updated_at
  BEFORE UPDATE ON public.document_template_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 10. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
