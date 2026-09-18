/**
 * REM Local SQLite Schema
 * Defines the DDL statements for all user data entities and synchronization tracking.
 */

export const CREATE_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  recurring_task_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  task_date TEXT NOT NULL,
  task_time TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_tasks_user_date ON tasks(user_id, task_date);
CREATE INDEX IF NOT EXISTS idx_local_tasks_recurring ON tasks(recurring_task_id);
CREATE INDEX IF NOT EXISTS idx_local_tasks_updated ON tasks(user_id, updated_at DESC);
`;

export const CREATE_RECURRING_TASKS_TABLE = `
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL,
  week_day INTEGER,
  week_days TEXT,
  task_time TEXT,
  start_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_recurring_user ON recurring_tasks(user_id, active);
CREATE INDEX IF NOT EXISTS idx_local_recurring_updated ON recurring_tasks(user_id, updated_at DESC);
`;

export const CREATE_RECURRING_TASK_EXCEPTIONS_TABLE = `
CREATE TABLE IF NOT EXISTS recurring_task_exceptions (
  id TEXT PRIMARY KEY NOT NULL,
  recurring_task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(recurring_task_id, occurrence_date)
);
CREATE INDEX IF NOT EXISTS idx_local_rec_exc_user ON recurring_task_exceptions(user_id);
`;

export const CREATE_NOTES_TABLE = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_notes_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_notes_created ON notes(user_id, created_at DESC);
`;

export const CREATE_DOCUMENTS_TABLE = `
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  template_id TEXT,
  document_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_docs_user_type ON documents(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_local_docs_template ON documents(template_id);
CREATE INDEX IF NOT EXISTS idx_local_docs_updated ON documents(user_id, updated_at DESC);
`;

export const CREATE_DOCUMENT_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS document_templates (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system_template INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_templates_user ON document_templates(user_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_local_templates_updated ON document_templates(user_id, updated_at DESC);
`;

export const CREATE_DOCUMENT_TEMPLATE_FIELDS_TABLE = `
CREATE TABLE IF NOT EXISTS document_template_fields (
  id TEXT PRIMARY KEY NOT NULL,
  template_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  sensitive INTEGER NOT NULL DEFAULT 0,
  mask_enabled INTEGER NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_local_fields_template ON document_template_fields(template_id, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_local_fields_updated ON document_template_fields(user_id, updated_at DESC);
`;

export const CREATE_SYNC_QUEUE_TABLE = `
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_order ON sync_queue(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
`;

export const CREATE_SYNC_METADATA_TABLE = `
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;
