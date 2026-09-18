-- ==============================================================================
-- REM: Phase 8 Offline-First Tombstones Table & Row Level Security (RLS)
-- Purpose: Records deleted entities across devices so offline and secondary
--          devices purge deleted records and never resurrect them on sync.
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ==============================================================================

-- 1. Create public.tombstones table
CREATE TABLE IF NOT EXISTS public.tombstones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure user_id defaults to auth.uid()
ALTER TABLE public.tombstones ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Explicit Postgres Grants
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON TABLE public.tombstones TO authenticated;
GRANT ALL ON TABLE public.tombstones TO service_role;

-- 3. Performance & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_tombstones_user_id_deleted_at
  ON public.tombstones(user_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_tombstones_entity
  ON public.tombstones(entity_type, entity_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tombstones ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies
DROP POLICY IF EXISTS "Users can view own tombstones" ON public.tombstones;
CREATE POLICY "Users can view own tombstones"
  ON public.tombstones
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tombstones" ON public.tombstones;
CREATE POLICY "Users can insert own tombstones"
  ON public.tombstones
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tombstones" ON public.tombstones;
CREATE POLICY "Users can delete own tombstones"
  ON public.tombstones
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Trigger Function to automatically log tombstones on delete
CREATE OR REPLACE FUNCTION public.log_tombstone()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.tombstones (user_id, entity_type, entity_id, deleted_at)
  VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, timezone('utc'::text, now()));
  RETURN OLD;
END;
$$;

-- 7. Attach Triggers to entities
DROP TRIGGER IF EXISTS trigger_tombstone_tasks ON public.tasks;
CREATE TRIGGER trigger_tombstone_tasks
  AFTER DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tombstone();

DROP TRIGGER IF EXISTS trigger_tombstone_notes ON public.notes;
CREATE TRIGGER trigger_tombstone_notes
  AFTER DELETE ON public.notes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tombstone();

DROP TRIGGER IF EXISTS trigger_tombstone_documents ON public.documents;
CREATE TRIGGER trigger_tombstone_documents
  AFTER DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tombstone();

DROP TRIGGER IF EXISTS trigger_tombstone_templates ON public.document_templates;
CREATE TRIGGER trigger_tombstone_templates
  AFTER DELETE ON public.document_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tombstone();

DROP TRIGGER IF EXISTS trigger_tombstone_recurring ON public.recurring_tasks;
CREATE TRIGGER trigger_tombstone_recurring
  AFTER DELETE ON public.recurring_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tombstone();

-- 8. Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
