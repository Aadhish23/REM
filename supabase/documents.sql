-- ==============================================================================
-- REM: Phase 7 Secure Document Vault Table & Row Level Security (RLS)
-- Purpose: Encrypted & isolated document vault for personal structured records.
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ==============================================================================

-- 1. Create public.documents table
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT check_document_type CHECK (
    document_type IN ('aadhaar', 'pan', 'driving_license')
  ),
  CONSTRAINT unique_user_document_type UNIQUE (user_id, document_type)
);

-- Ensure user_id defaults to auth.uid() if table already existed
ALTER TABLE public.documents ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Explicit Postgres Grants
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON TABLE public.documents TO authenticated;
GRANT ALL ON TABLE public.documents TO service_role;

-- 3. Performance & Lookup Indexes
-- Note: The UNIQUE constraint (user_id, document_type) already creates an index on (user_id, document_type).
-- Add index for sorting by created_at per user
CREATE INDEX IF NOT EXISTS idx_documents_user_id_created_at
  ON public.documents(user_id, created_at ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies
-- SELECT: Users can only view their own documents
DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: Users can only insert documents for their own user_id
DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own documents
DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own documents
DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Automatic updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_documents_updated_at ON public.documents;
CREATE TRIGGER trigger_set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 7. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
