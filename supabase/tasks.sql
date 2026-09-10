-- ==============================================================================
-- REM: Phase 3 Tasks Table & Row Level Security (RLS)
-- Purpose: Task Manager Core - storage for tasks, dates, times, and completion.
-- Run this script in the Supabase SQL Editor (Dashboard > SQL Editor > New Query).
-- ==============================================================================

-- 1. Create public.tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  task_time TIME WITHOUT TIME ZONE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Ensure user_id defaults to auth.uid() if table already existed
ALTER TABLE public.tasks ALTER COLUMN user_id SET DEFAULT auth.uid();

-- 2. Explicit Postgres Grants
-- Essential: PostgREST requires explicit table permissions for the 'authenticated' role
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_user_id_task_date
  ON public.tasks(user_id, task_date);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id_completed
  ON public.tasks(user_id, completed);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies
-- SELECT: Users can only view their own tasks
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
CREATE POLICY "Users can view own tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT: Users can only insert tasks assigned to their own user_id
DROP POLICY IF EXISTS "Users can insert own tasks" ON public.tasks;
CREATE POLICY "Users can insert own tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own tasks
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
CREATE POLICY "Users can update own tasks"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own tasks
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;
CREATE POLICY "Users can delete own tasks"
  ON public.tasks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Updated_at Trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_tasks_updated_at ON public.tasks;
CREATE TRIGGER trigger_set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
