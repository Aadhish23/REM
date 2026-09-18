import { getDatabase, withTransaction } from '../database/database';
import { supabase } from './supabase';
import { networkService } from './networkService';
import { SyncQueueItem, SyncStatus, SyncState, SyncEntityType } from '../types/sync';
import { Task, RecurringTask, RecurringTaskException } from '../types/task';
import { Note } from '../types/note';
import { DocumentItem } from '../types/document';
import { DocumentTemplate, DocumentTemplateField } from '../types/documentTemplate';

type SyncStatusListener = (status: SyncStatus) => void;

// Entity sync priority order: Parents before children
const ENTITY_PRIORITY: Record<SyncEntityType, number> = {
  document_template: 1,
  document_template_field: 2,
  document: 3,
  recurring_task: 4,
  recurring_task_exception: 5,
  task: 6,
  note: 7,
};

class SyncService {
  private isSyncing: boolean = false;
  private currentUserId: string | null = null;
  private lastSyncedAt: string | null = null;
  private syncState: SyncState = 'synced';
  private errorMessage: string | null = null;
  private listeners: Set<SyncStatusListener> = new Set();
  private networkUnsubscribe: (() => void) | null = null;

  constructor() {
    this.networkUnsubscribe = networkService.subscribe((isOnline) => {
      if (isOnline && this.currentUserId) {
        this.syncNow().catch(() => {});
      } else if (!isOnline) {
        this.updateStatus('offline', null);
      }
    });
  }

  /**
   * Initializes sync for the active authenticated user.
   */
  public async initializeSync(userId: string): Promise<void> {
    this.currentUserId = userId;

    try {
      const db = getDatabase();
      const meta = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM sync_metadata WHERE key = ?',
        ['last_pulled_at']
      );
      this.lastSyncedAt = meta?.value || null;
    } catch {
      this.lastSyncedAt = null;
    }

    if (networkService.isOnline()) {
      await this.syncNow();
    } else {
      await this.refreshPendingCount('offline');
    }
  }

  /**
   * Resets sync service state on user logout.
   */
  public clearSync(): void {
    this.currentUserId = null;
    this.lastSyncedAt = null;
    this.syncState = 'synced';
    this.errorMessage = null;
    this.notifyStatus();
  }

  /**
   * Triggers an immediate synchronization cycle if online.
   */
  public async syncNow(): Promise<void> {
    if (!this.currentUserId) return;
    if (this.isSyncing) return;

    if (!networkService.isOnline()) {
      await this.refreshPendingCount('offline');
      return;
    }

    this.isSyncing = true;
    this.updateStatus('syncing', null);

    try {
      // 1. Push local changes from sync_queue to Supabase
      await this.processSyncQueue();

      // 2. Pull remote changes from Supabase to SQLite
      await this.pullRemoteChanges();

      this.lastSyncedAt = new Date().toISOString();
      const db = getDatabase();
      await db.runAsync(
        'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
        ['last_pulled_at', this.lastSyncedAt]
      );

      await this.refreshPendingCount('synced');
    } catch (err) {
      console.warn('[SyncService] Sync cycle ended with notice');
      const isNet = !networkService.isOnline();
      await this.refreshPendingCount(isNet ? 'offline' : 'error', 'Unable to complete cloud synchronization.');
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pushes pending operations in the sync_queue to Supabase.
   */
  public async processSyncQueue(): Promise<void> {
    const db = getDatabase();
    const queueItems = await db.getAllAsync<SyncQueueItem>(
      'SELECT * FROM sync_queue WHERE user_id = ? ORDER BY created_at ASC',
      [this.currentUserId!]
    );

    if (queueItems.length === 0) {
      return;
    }

    // Sort by dependency priority: templates -> fields -> documents -> recurring -> tasks -> notes
    queueItems.sort((a, b) => {
      const priorityA = ENTITY_PRIORITY[a.entity_type] ?? 99;
      const priorityB = ENTITY_PRIORITY[b.entity_type] ?? 99;
      return priorityA - priorityB;
    });

    const now = Date.now();

    for (const item of queueItems) {
      // Exponential backoff check: 0: 0s, 1: 30s, 2: 60s, 3: 120s, 4+: 300s
      const delayMs = this.getBackoffDelay(item.retry_count);
      const itemCreatedMs = new Date(item.created_at).getTime();
      if (item.retry_count > 0 && now - itemCreatedMs < delayMs) {
        continue;
      }

      try {
        await this.syncQueueItem(item);
        // On success: remove from sync_queue
        await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      } catch (err: any) {
        const errorMsg = err?.message || 'Sync failed';
        console.warn(`[SyncService] Operation failed for entity: ${item.entity_type}, op: ${item.operation}`);

        // If 404 or record already gone on delete, treat as succeeded
        if (item.operation === 'delete' && (errorMsg.includes('not found') || errorMsg.includes('PGRST116'))) {
          await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
          continue;
        }

        // Increment retry count and update last_error
        await db.runAsync(
          'UPDATE sync_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
          [errorMsg, item.id]
        );
      }
    }
  }

  /**
   * Executes a single sync operation against Supabase.
   */
  private async syncQueueItem(item: SyncQueueItem): Promise<void> {
    const payload = item.payload ? JSON.parse(item.payload) : null;

    switch (item.entity_type) {
      case 'task':
        await this.pushTask(item.operation, item.entity_id, payload);
        break;
      case 'recurring_task':
        await this.pushRecurringTask(item.operation, item.entity_id, payload);
        break;
      case 'recurring_task_exception':
        await this.pushRecurringTaskException(item.operation, item.entity_id, payload);
        break;
      case 'note':
        await this.pushNote(item.operation, item.entity_id, payload);
        break;
      case 'document':
        await this.pushDocument(item.operation, item.entity_id, payload);
        break;
      case 'document_template':
        await this.pushDocumentTemplate(item.operation, item.entity_id, payload);
        break;
      case 'document_template_field':
        await this.pushDocumentTemplateField(item.operation, item.entity_id, payload);
        break;
    }
  }

  // --- Push Handlers with Last-Write-Wins and Idempotency ---

  private async pushTask(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    // Upsert task (create or update)
    const { error } = await supabase.from('tasks').upsert({
      id,
      user_id: payload.user_id,
      recurring_task_id: payload.recurring_task_id || null,
      title: payload.title,
      description: payload.description || null,
      task_date: payload.task_date,
      task_time: payload.task_time || null,
      completed: Boolean(payload.completed),
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  private async pushRecurringTask(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('recurring_tasks').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('recurring_tasks').upsert({
      id,
      user_id: payload.user_id,
      title: payload.title,
      description: payload.description || null,
      frequency: payload.frequency,
      week_day: payload.week_day !== undefined ? payload.week_day : null,
      week_days: payload.week_days ? (Array.isArray(payload.week_days) ? payload.week_days : JSON.parse(payload.week_days)) : null,
      task_time: payload.task_time || null,
      start_date: payload.start_date,
      active: Boolean(payload.active),
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  private async pushRecurringTaskException(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('recurring_task_exceptions').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('recurring_task_exceptions').upsert({
      id,
      recurring_task_id: payload.recurring_task_id,
      user_id: payload.user_id,
      occurrence_date: payload.occurrence_date,
      created_at: payload.created_at,
    }, { onConflict: 'recurring_task_id,occurrence_date' });

    if (error) throw error;
  }

  private async pushNote(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('notes').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('notes').upsert({
      id,
      user_id: payload.user_id,
      title: payload.title,
      content: payload.content || '',
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  private async pushDocument(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const docData = typeof payload.document_data === 'string'
      ? JSON.parse(payload.document_data)
      : payload.document_data;

    const { error } = await supabase.from('documents').upsert({
      id,
      user_id: payload.user_id,
      document_type: payload.document_type,
      template_id: payload.template_id || null,
      document_data: docData,
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  private async pushDocumentTemplate(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('document_templates').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('document_templates').upsert({
      id,
      user_id: payload.user_id,
      name: payload.name,
      description: payload.description || null,
      is_system_template: Boolean(payload.is_system_template),
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  private async pushDocumentTemplateField(operation: string, id: string, payload: any): Promise<void> {
    if (operation === 'delete') {
      const { error } = await supabase.from('document_template_fields').delete().eq('id', id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase.from('document_template_fields').upsert({
      id,
      template_id: payload.template_id,
      user_id: payload.user_id,
      field_key: payload.field_key,
      field_label: payload.field_label,
      field_type: payload.field_type,
      required: Boolean(payload.required),
      sensitive: Boolean(payload.sensitive),
      mask_enabled: Boolean(payload.mask_enabled),
      display_order: payload.display_order ?? 0,
      created_at: payload.created_at,
      updated_at: payload.updated_at,
    }, { onConflict: 'id' });

    if (error) throw error;
  }

  // --- Pull Remote Changes ---

  /**
   * Pulls remote changes from Supabase down to local SQLite.
   */
  public async pullRemoteChanges(): Promise<void> {
    const db = getDatabase();

    // 1. Process tombstones (deleted items from other devices)
    await this.processRemoteTombstones();

    // 2. Pull templates and fields
    await this.pullTemplates();

    // 3. Pull documents
    await this.pullDocuments();

    // 4. Pull recurring tasks and exceptions
    await this.pullRecurringTasks();

    // 5. Pull tasks
    await this.pullTasks();

    // 6. Pull notes
    await this.pullNotes();
  }

  private async processRemoteTombstones(): Promise<void> {
    const db = getDatabase();

    try {
      let query = supabase.from('tombstones').select('*');
      if (this.lastSyncedAt) {
        query = query.gt('deleted_at', this.lastSyncedAt);
      }

      const { data: tombstones, error } = await query;
      if (error || !tombstones || tombstones.length === 0) {
        return;
      }

      await withTransaction(async (tx) => {
        for (const t of tombstones) {
          const entityId = t.entity_id;
          switch (t.entity_type) {
            case 'tasks':
              await tx.runAsync('DELETE FROM tasks WHERE id = ?', [entityId]);
              break;
            case 'notes':
              await tx.runAsync('DELETE FROM notes WHERE id = ?', [entityId]);
              break;
            case 'documents':
              await tx.runAsync('DELETE FROM documents WHERE id = ?', [entityId]);
              break;
            case 'document_templates':
              await tx.runAsync('DELETE FROM document_template_fields WHERE template_id = ?', [entityId]);
              await tx.runAsync('DELETE FROM document_templates WHERE id = ?', [entityId]);
              break;
            case 'recurring_tasks':
              await tx.runAsync('DELETE FROM recurring_tasks WHERE id = ?', [entityId]);
              await tx.runAsync('DELETE FROM recurring_task_exceptions WHERE recurring_task_id = ?', [entityId]);
              break;
          }
          // Remove any pending create/update in sync_queue for this deleted entity
          await tx.runAsync('DELETE FROM sync_queue WHERE entity_id = ?', [entityId]);
        }
      });
    } catch {
      // Tombstone query may fail if table is not yet migrated in Supabase; non-blocking
    }
  }

  private async pullTemplates(): Promise<void> {
    const db = getDatabase();
    let query = supabase.from('document_templates').select('*');
    if (this.lastSyncedAt) {
      query = query.gt('updated_at', this.lastSyncedAt);
    }
    const { data: templates } = await query;

    if (templates && templates.length > 0) {
      const templateIds = templates.map((t) => t.id);
      const { data: fields } = await supabase
        .from('document_template_fields')
        .select('*')
        .in('template_id', templateIds);

      await withTransaction(async (tx) => {
        for (const t of templates as DocumentTemplate[]) {
          // Check if local queue has pending update for this template
          const hasPending = await tx.getFirstAsync(
            'SELECT id FROM sync_queue WHERE entity_id = ?',
            [t.id]
          );
          if (!hasPending) {
            await tx.runAsync(
              `INSERT OR REPLACE INTO document_templates (id, user_id, name, description, is_system_template, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [t.id, t.user_id, t.name, t.description || null, t.is_system_template ? 1 : 0, t.created_at, t.updated_at]
            );
          }
        }

        if (fields && fields.length > 0) {
          for (const f of fields as DocumentTemplateField[]) {
            const hasPendingField = await tx.getFirstAsync(
              'SELECT id FROM sync_queue WHERE entity_id = ?',
              [f.id]
            );
            if (!hasPendingField) {
              await tx.runAsync(
                `INSERT OR REPLACE INTO document_template_fields
                 (id, template_id, user_id, field_key, field_label, field_type, required, sensitive, mask_enabled, display_order, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  f.id,
                  f.template_id,
                  f.user_id,
                  f.field_key,
                  f.field_label,
                  f.field_type,
                  f.required ? 1 : 0,
                  f.sensitive ? 1 : 0,
                  f.mask_enabled ? 1 : 0,
                  f.display_order ?? 0,
                  f.created_at,
                  f.updated_at,
                ]
              );
            }
          }
        }
      });
    }
  }

  private async pullDocuments(): Promise<void> {
    let query = supabase.from('documents').select('*');
    if (this.lastSyncedAt) {
      query = query.gt('updated_at', this.lastSyncedAt);
    }
    const { data: remoteDocs } = await query;

    if (remoteDocs && remoteDocs.length > 0) {
      await withTransaction(async (tx) => {
        for (const doc of remoteDocs as DocumentItem[]) {
          const hasPending = await tx.getFirstAsync(
            'SELECT id FROM sync_queue WHERE entity_id = ?',
            [doc.id]
          );
          if (!hasPending) {
            const docDataStr = typeof doc.document_data === 'string'
              ? doc.document_data
              : JSON.stringify(doc.document_data || {});

            await tx.runAsync(
              `INSERT OR REPLACE INTO documents (id, user_id, document_type, template_id, document_data, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [doc.id, doc.user_id, doc.document_type, doc.template_id || null, docDataStr, doc.created_at, doc.updated_at]
            );
          }
        }
      });
    }
  }

  private async pullRecurringTasks(): Promise<void> {
    let recQuery = supabase.from('recurring_tasks').select('*');
    if (this.lastSyncedAt) {
      recQuery = recQuery.gt('updated_at', this.lastSyncedAt);
    }
    const { data: remoteRecurring } = await recQuery;

    if (remoteRecurring && remoteRecurring.length > 0) {
      await withTransaction(async (tx) => {
        for (const r of remoteRecurring as RecurringTask[]) {
          const hasPending = await tx.getFirstAsync(
            'SELECT id FROM sync_queue WHERE entity_id = ?',
            [r.id]
          );
          if (!hasPending) {
            const weekDaysStr = r.week_days ? JSON.stringify(r.week_days) : null;
            await tx.runAsync(
              `INSERT OR REPLACE INTO recurring_tasks
               (id, user_id, title, description, frequency, week_day, week_days, task_time, start_date, active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                r.id,
                r.user_id,
                r.title,
                r.description || null,
                r.frequency,
                r.week_day !== undefined ? r.week_day : null,
                weekDaysStr,
                r.task_time || null,
                r.start_date,
                r.active ? 1 : 0,
                r.created_at,
                r.updated_at,
              ]
            );
          }
        }
      });
    }

    // Pull exceptions
    let excQuery = supabase.from('recurring_task_exceptions').select('*');
    if (this.lastSyncedAt) {
      excQuery = excQuery.gt('created_at', this.lastSyncedAt);
    }
    const { data: remoteExceptions } = await excQuery;

    if (remoteExceptions && remoteExceptions.length > 0) {
      await withTransaction(async (tx) => {
        for (const exc of remoteExceptions as RecurringTaskException[]) {
          await tx.runAsync(
            `INSERT OR REPLACE INTO recurring_task_exceptions (id, recurring_task_id, user_id, occurrence_date, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [exc.id, exc.recurring_task_id, exc.user_id, exc.occurrence_date, exc.created_at]
          );
        }
      });
    }
  }

  private async pullTasks(): Promise<void> {
    let query = supabase.from('tasks').select('*');
    if (this.lastSyncedAt) {
      query = query.gt('updated_at', this.lastSyncedAt);
    }
    const { data: remoteTasks } = await query;

    if (remoteTasks && remoteTasks.length > 0) {
      await withTransaction(async (tx) => {
        for (const task of remoteTasks as Task[]) {
          const hasPending = await tx.getFirstAsync(
            'SELECT id FROM sync_queue WHERE entity_id = ?',
            [task.id]
          );
          if (!hasPending) {
            await tx.runAsync(
              `INSERT OR REPLACE INTO tasks
               (id, user_id, recurring_task_id, title, description, task_date, task_time, completed, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                task.id,
                task.user_id,
                task.recurring_task_id || null,
                task.title,
                task.description || null,
                task.task_date,
                task.task_time || null,
                task.completed ? 1 : 0,
                task.created_at,
                task.updated_at,
              ]
            );
          }
        }
      });
    }
  }

  private async pullNotes(): Promise<void> {
    let query = supabase.from('notes').select('*');
    if (this.lastSyncedAt) {
      query = query.gt('updated_at', this.lastSyncedAt);
    }
    const { data: remoteNotes } = await query;

    if (remoteNotes && remoteNotes.length > 0) {
      await withTransaction(async (tx) => {
        for (const note of remoteNotes as Note[]) {
          const hasPending = await tx.getFirstAsync(
            'SELECT id FROM sync_queue WHERE entity_id = ?',
            [note.id]
          );
          if (!hasPending) {
            await tx.runAsync(
              `INSERT OR REPLACE INTO notes (id, user_id, title, content, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [note.id, note.user_id, note.title, note.content || '', note.created_at, note.updated_at]
            );
          }
        }
      });
    }
  }

  // --- Helpers ---

  private getBackoffDelay(retryCount: number): number {
    switch (retryCount) {
      case 0:
        return 0;
      case 1:
        return 30 * 1000; // 30 seconds
      case 2:
        return 60 * 1000; // 1 minute
      case 3:
        return 120 * 1000; // 2 minutes
      default:
        return Math.min(300 * 1000, retryCount * 60 * 1000); // up to 5 minutes
    }
  }

  private async refreshPendingCount(state?: SyncState, error?: string | null) {
    let count = 0;
    try {
      if (this.currentUserId) {
        const db = getDatabase();
        const res = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM sync_queue WHERE user_id = ?',
          [this.currentUserId]
        );
        count = res?.count ?? 0;
      }
    } catch {
      count = 0;
    }

    const nextState = state ?? this.syncState;
    this.updateStatus(nextState, error ?? this.errorMessage, count);
  }

  private updateStatus(state: SyncState, error: string | null = null, pendingCount?: number) {
    this.syncState = state;
    this.errorMessage = error;
    this.notifyStatus(pendingCount);
  }

  public getStatus(): SyncStatus {
    return {
      state: this.syncState,
      pendingCount: 0,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.errorMessage,
    };
  }

  public subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    this.refreshPendingCount().then(() => {
      listener(this.getStatus());
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStatus(pendingCount?: number) {
    const status: SyncStatus = {
      state: this.syncState,
      pendingCount: pendingCount ?? 0,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.errorMessage,
    };

    this.listeners.forEach((l) => {
      try {
        l(status);
      } catch {}
    });
  }

  public cleanup() {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
    this.listeners.clear();
  }
}

export const syncService = new SyncService();
