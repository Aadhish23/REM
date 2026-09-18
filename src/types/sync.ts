export type SyncEntityType =
  | 'task'
  | 'note'
  | 'document'
  | 'document_template'
  | 'document_template_field'
  | 'recurring_task'
  | 'recurring_task_exception';

export type SyncOperation = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  id: string;
  user_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  payload: string | null;
  created_at: string;
  retry_count: number;
  last_error: string | null;
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  pendingCount: number;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}
