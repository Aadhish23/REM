import { getDatabase, withTransaction, getActiveUserId } from '../database/database';
import {
  Task,
  CreateTaskDTO,
  UpdateTaskDTO,
  RecurringTask,
  CreateRecurringTaskDTO,
  UpdateRecurringTaskDTO,
} from '../types/task';
import { generateUUID } from '../utils/uuid';
import { notificationService } from './notificationService';
import { syncService } from './syncService';
import {
  getTodayISO,
  addDaysToDate,
  getDayOfWeekFromISO,
  isTimePastToday,
} from '../utils/date';

function normalizeWeekDays(weekDays?: number[] | null, legacyWeekDay?: number | null): number[] | null {
  if (Array.isArray(weekDays) && weekDays.length > 0) {
    const unique = Array.from(new Set(weekDays.filter((d) => d >= 0 && d <= 6)));
    unique.sort((a, b) => a - b);
    return unique.length > 0 ? unique : null;
  }
  if (legacyWeekDay !== undefined && legacyWeekDay !== null && legacyWeekDay >= 0 && legacyWeekDay <= 6) {
    return [legacyWeekDay];
  }
  return null;
}

export const localTaskService = {
  /**
   * Retrieves all tasks for the current active user from local SQLite,
   * sorted by task_date ASC and task_time ASC.
   */
  async getTasks(): Promise<{ data: Task[]; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) {
        return { data: [], error: 'User is not authenticated.' };
      }

      const rows = await db.getAllAsync<any>(
        `SELECT * FROM tasks WHERE user_id = ?
         ORDER BY task_date ASC, task_time ASC`,
        [userId]
      );

      const tasks: Task[] = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        recurring_task_id: r.recurring_task_id || null,
        title: r.title,
        description: r.description || null,
        task_date: r.task_date,
        task_time: r.task_time || null,
        completed: Boolean(r.completed),
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      return { data: tasks, error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Failed to load local tasks.' };
    }
  },

  /**
   * Atomically creates a task in SQLite and logs a 'create' operation in the sync queue.
   */
  async createTask(
    dto: CreateTaskDTO
  ): Promise<{ data: Task | null; error: string | null; notificationWarning?: string | null }> {
    try {
      const userId = getActiveUserId();
      if (!userId) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const id = generateUUID();
      const now = new Date().toISOString();
      const newTask: Task = {
        id,
        user_id: userId,
        recurring_task_id: dto.recurring_task_id || null,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        task_date: dto.task_date,
        task_time: dto.task_time || null,
        completed: false,
        created_at: now,
        updated_at: now,
      };

      await withTransaction(async (db) => {
        // 1. Insert into local tasks
        await db.runAsync(
          `INSERT INTO tasks (id, user_id, recurring_task_id, title, description, task_date, task_time, completed, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            newTask.id,
            newTask.user_id,
            newTask.recurring_task_id ?? null,
            newTask.title,
            newTask.description ?? null,
            newTask.task_date,
            newTask.task_time,
            newTask.created_at,
            newTask.updated_at,
          ]
        );

        // 2. Enqueue create operation
        await db.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'task', ?, 'create', ?, ?, 0)`,
          [generateUUID(), userId, newTask.id, JSON.stringify(newTask), now]
        );
      });

      // 3. Schedule notification locally (offline-safe)
      let notificationWarning: string | null = null;
      try {
        const notifResult = await notificationService.scheduleTaskNotification(newTask);
        if (notifResult.reason === 'permission_denied') {
          notificationWarning =
            'Task saved, but reminders are disabled. You can enable notifications anytime in your Android Settings.';
        }
      } catch (notifErr) {
        console.warn('[LocalTaskService] Notification schedule notice:', notifErr);
      }

      // 4. Trigger non-blocking cloud sync if online
      syncService.syncNow().catch(() => {});

      return { data: newTask, error: null, notificationWarning };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to create task.' };
    }
  },

  /**
   * Atomically updates a task in SQLite and logs an 'update' operation in the sync queue.
   */
  async updateTask(
    id: string,
    dto: UpdateTaskDTO
  ): Promise<{ data: Task | null; error: string | null; notificationWarning?: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!existing) {
        return { data: null, error: 'Task not found.' };
      }

      const now = new Date().toISOString();
      const updatedTask: Task = {
        id: existing.id,
        user_id: existing.user_id,
        recurring_task_id: existing.recurring_task_id || null,
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        description: dto.description !== undefined ? dto.description?.trim() || null : existing.description,
        task_date: dto.task_date !== undefined ? dto.task_date : existing.task_date,
        task_time: dto.task_time !== undefined ? dto.task_time || null : existing.task_time,
        completed: dto.completed !== undefined ? Boolean(dto.completed) : Boolean(existing.completed),
        created_at: existing.created_at,
        updated_at: now,
      };

      await withTransaction(async (tx) => {
        // 1. Update SQLite
        await tx.runAsync(
          `UPDATE tasks
           SET title = ?, description = ?, task_date = ?, task_time = ?, completed = ?, updated_at = ?
           WHERE id = ?`,
          [
            updatedTask.title,
            updatedTask.description,
            updatedTask.task_date,
            updatedTask.task_time,
            updatedTask.completed ? 1 : 0,
            updatedTask.updated_at,
            id,
          ]
        );

        // 2. Check if a pending 'create' operation exists in sync_queue
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          // Update the payload of the pending create so it pushes the latest state
          await tx.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?', [
            JSON.stringify(updatedTask),
            pendingCreate.id,
          ]);
        } else {
          // Enqueue update operation
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'task', ?, 'update', ?, ?, 0)`,
            [generateUUID(), updatedTask.user_id, id, JSON.stringify(updatedTask), now]
          );
        }
      });

      // 3. Reschedule notification
      let notificationWarning: string | null = null;
      try {
        const notifResult = await notificationService.scheduleTaskNotification(updatedTask);
        if (notifResult.reason === 'permission_denied') {
          notificationWarning =
            'Task updated, but reminders are disabled. You can enable notifications anytime in your Android Settings.';
        }
      } catch (notifErr) {
        console.warn('[LocalTaskService] Notification reschedule notice:', notifErr);
      }

      // 4. Trigger non-blocking cloud sync
      syncService.syncNow().catch(() => {});

      return { data: updatedTask, error: null, notificationWarning };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to update task.' };
    }
  },

  async toggleTaskCompletion(
    id: string,
    currentStatus: boolean
  ): Promise<{ data: Task | null; error: string | null }> {
    return this.updateTask(id, { completed: !currentStatus });
  },

  /**
   * Atomically deletes a task from SQLite and logs a 'delete' operation in the sync queue.
   */
  async deleteTask(id: string): Promise<{ error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (!existing) {
        return { error: null };
      }

      // 1. Cancel local notification
      await notificationService.cancelTaskNotification(id).catch(() => {});

      const userId = existing.user_id;
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        // 2. Remove from local SQLite
        await tx.runAsync('DELETE FROM tasks WHERE id = ?', [id]);

        // 3. If it was created offline and never synced, remove pending create from queue without sending delete to cloud
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );

        if (pendingCreate) {
          await tx.runAsync('DELETE FROM sync_queue WHERE entity_id = ?', [id]);
        } else {
          // Remove any existing pending updates for this task
          await tx.runAsync(`DELETE FROM sync_queue WHERE entity_id = ? AND operation = 'update'`, [id]);

          // Enqueue delete operation
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'task', ?, 'delete', NULL, ?, 0)`,
            [generateUUID(), userId, id, now]
          );
        }
      });

      // 4. Trigger non-blocking cloud sync
      syncService.syncNow().catch(() => {});

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete task.' };
    }
  },

  // --- RECURRING TASKS & ROLLING SLIDING WINDOW ---

  async getRecurringTasks(): Promise<{ data: RecurringTask[]; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) return { data: [], error: 'User is not authenticated.' };

      const rows = await db.getAllAsync<any>(
        'SELECT * FROM recurring_tasks WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );

      const items: RecurringTask[] = rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        title: r.title,
        description: r.description || null,
        frequency: r.frequency,
        week_day: r.week_day !== undefined ? r.week_day : null,
        week_days: r.week_days ? JSON.parse(r.week_days) : null,
        task_time: r.task_time || null,
        start_date: r.start_date,
        active: Boolean(r.active),
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      return { data: items, error: null };
    } catch (err: any) {
      return { data: [], error: err?.message || 'Failed to fetch recurring tasks.' };
    }
  },

  async getRecurringTaskById(id: string): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const db = getDatabase();
      const r = await db.getFirstAsync<any>('SELECT * FROM recurring_tasks WHERE id = ?', [id]);
      if (!r) return { data: null, error: 'Recurring task not found.' };

      return {
        data: {
          id: r.id,
          user_id: r.user_id,
          title: r.title,
          description: r.description || null,
          frequency: r.frequency,
          week_day: r.week_day !== undefined ? r.week_day : null,
          week_days: r.week_days ? JSON.parse(r.week_days) : null,
          task_time: r.task_time || null,
          start_date: r.start_date,
          active: Boolean(r.active),
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
        error: null,
      };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to fetch recurring task.' };
    }
  },

  async createRecurringTask(
    dto: CreateRecurringTaskDTO
  ): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const userId = getActiveUserId();
      if (!userId) return { data: null, error: 'User is not authenticated.' };

      const id = generateUUID();
      const now = new Date().toISOString();
      const startDate = dto.start_date || getTodayISO();
      const normalizedDays = dto.frequency === 'weekly' ? normalizeWeekDays(dto.week_days, dto.week_day) : null;

      const newRec: RecurringTask = {
        id,
        user_id: userId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        frequency: dto.frequency,
        week_day: normalizedDays && normalizedDays.length > 0 ? normalizedDays[0] : null,
        week_days: normalizedDays,
        task_time: dto.task_time || null,
        start_date: startDate,
        active: true,
        created_at: now,
        updated_at: now,
      };

      const weekDaysStr = normalizedDays ? JSON.stringify(normalizedDays) : null;

      await withTransaction(async (db) => {
        // 1. Insert recurring definition
        await db.runAsync(
          `INSERT INTO recurring_tasks
           (id, user_id, title, description, frequency, week_day, week_days, task_time, start_date, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            newRec.id,
            newRec.user_id,
            newRec.title,
            newRec.description ?? null,
            newRec.frequency,
            newRec.week_day ?? null,
            weekDaysStr,
            newRec.task_time,
            newRec.start_date,
            newRec.created_at,
            newRec.updated_at,
          ]
        );

        // 2. Enqueue create operation
        await db.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'recurring_task', ?, 'create', ?, ?, 0)`,
          [generateUUID(), userId, newRec.id, JSON.stringify(newRec), now]
        );
      });

      // 3. Immediately generate sliding-window occurrences locally in SQLite
      await this.syncOccurrences();

      // 4. Trigger cloud sync
      syncService.syncNow().catch(() => {});

      return { data: newRec, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to create recurring task.' };
    }
  },

  async updateRecurringTask(
    id: string,
    dto: UpdateRecurringTaskDTO
  ): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const db = getDatabase();
      const existing = await db.getFirstAsync<any>('SELECT * FROM recurring_tasks WHERE id = ?', [id]);
      if (!existing) return { data: null, error: 'Recurring task not found.' };

      const now = new Date().toISOString();
      const frequency = dto.frequency !== undefined ? dto.frequency : existing.frequency;
      const normalizedDays =
        frequency === 'weekly'
          ? normalizeWeekDays(dto.week_days, dto.week_day ?? (existing.week_day ? existing.week_day : null))
          : null;

      const updated: RecurringTask = {
        id: existing.id,
        user_id: existing.user_id,
        title: dto.title !== undefined ? dto.title.trim() : existing.title,
        description: dto.description !== undefined ? dto.description?.trim() || null : existing.description,
        frequency,
        week_day: normalizedDays && normalizedDays.length > 0 ? normalizedDays[0] : null,
        week_days: normalizedDays,
        task_time: dto.task_time !== undefined ? dto.task_time || null : existing.task_time,
        start_date: dto.start_date !== undefined ? dto.start_date : existing.start_date,
        active: dto.active !== undefined ? Boolean(dto.active) : Boolean(existing.active),
        created_at: existing.created_at,
        updated_at: now,
      };

      const weekDaysStr = normalizedDays ? JSON.stringify(normalizedDays) : null;
      const todayISO = getTodayISO();

      await withTransaction(async (tx) => {
        // 1. Update definition
        await tx.runAsync(
          `UPDATE recurring_tasks
           SET title = ?, description = ?, frequency = ?, week_day = ?, week_days = ?, task_time = ?, start_date = ?, active = ?, updated_at = ?
           WHERE id = ?`,
          [
            updated.title,
            updated.description ?? null,
            updated.frequency,
            updated.week_day ?? null,
            weekDaysStr,
            updated.task_time,
            updated.start_date,
            updated.active ? 1 : 0,
            updated.updated_at,
            id,
          ]
        );

        // 2. Enqueue update
        const pendingCreate = await tx.getFirstAsync<any>(
          `SELECT id FROM sync_queue WHERE entity_id = ? AND operation = 'create'`,
          [id]
        );
        if (pendingCreate) {
          await tx.runAsync('UPDATE sync_queue SET payload = ? WHERE id = ?', [
            JSON.stringify(updated),
            pendingCreate.id,
          ]);
        } else {
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'recurring_task', ?, 'update', ?, ?, 0)`,
            [generateUUID(), updated.user_id, id, JSON.stringify(updated), now]
          );
        }

        // 3. Cancel notifications for future uncompleted occurrences
        const futureTasks = await tx.getAllAsync<any>(
          `SELECT id FROM tasks WHERE recurring_task_id = ? AND completed = 0 AND task_date >= ?`,
          [id, todayISO]
        );
        for (const t of futureTasks) {
          notificationService.cancelTaskNotification(t.id).catch(() => {});
          await tx.runAsync('DELETE FROM tasks WHERE id = ?', [t.id]);
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'task', ?, 'delete', NULL, ?, 0)`,
            [generateUUID(), updated.user_id, t.id, now]
          );
        }
      });

      // 4. Regenerate occurrences if still active
      if (updated.active) {
        await this.syncOccurrences();
      }

      syncService.syncNow().catch(() => {});
      return { data: updated, error: null };
    } catch (err: any) {
      return { data: null, error: err?.message || 'Failed to update recurring task.' };
    }
  },

  async addException(recurringTaskId: string, occurrenceDate: string): Promise<{ error: string | null }> {
    try {
      const userId = getActiveUserId();
      if (!userId) return { error: 'User is not authenticated.' };

      const excId = generateUUID();
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        await tx.runAsync(
          `INSERT OR REPLACE INTO recurring_task_exceptions (id, recurring_task_id, user_id, occurrence_date, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [excId, recurringTaskId, userId, occurrenceDate, now]
        );

        await tx.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'recurring_task_exception', ?, 'create', ?, ?, 0)`,
          [
            generateUUID(),
            userId,
            excId,
            JSON.stringify({
              id: excId,
              recurring_task_id: recurringTaskId,
              user_id: userId,
              occurrence_date: occurrenceDate,
              created_at: now,
            }),
            now,
          ]
        );
      });

      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to add exception.' };
    }
  },

  async deleteMultipleTasks(tasks: Task[]): Promise<{ error: string | null }> {
    try {
      for (const t of tasks) {
        if (t.recurring_task_id) {
          await this.deleteOccurrenceOnly(t);
        } else {
          await this.deleteTask(t.id);
        }
      }
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete multiple tasks.' };
    }
  },

  async deleteOccurrenceOnly(task: Task): Promise<{ error: string | null }> {
    try {
      await notificationService.cancelTaskNotification(task.id).catch(() => {});
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        // 1. If part of recurring task, record recurrence exception
        if (task.recurring_task_id) {
          const excId = generateUUID();
          await tx.runAsync(
            `INSERT OR REPLACE INTO recurring_task_exceptions (id, recurring_task_id, user_id, occurrence_date, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [excId, task.recurring_task_id, task.user_id, task.task_date, now]
          );

          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'recurring_task_exception', ?, 'create', ?, ?, 0)`,
            [
              generateUUID(),
              task.user_id,
              excId,
              JSON.stringify({
                id: excId,
                recurring_task_id: task.recurring_task_id,
                user_id: task.user_id,
                occurrence_date: task.task_date,
                created_at: now,
              }),
              now,
            ]
          );
        }

        // 2. Delete task row
        await tx.runAsync('DELETE FROM tasks WHERE id = ?', [task.id]);

        // 3. Enqueue delete
        await tx.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'task', ?, 'delete', NULL, ?, 0)`,
          [generateUUID(), task.user_id, task.id, now]
        );
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete occurrence.' };
    }
  },

  async endRecurringSeries(recurringTaskId: string): Promise<{ error: string | null }> {
    try {
      const todayISO = getTodayISO();
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        // 1. Mark active = 0
        await tx.runAsync(
          'UPDATE recurring_tasks SET active = 0, updated_at = ? WHERE id = ?',
          [now, recurringTaskId]
        );

        const rec = await tx.getFirstAsync<any>('SELECT * FROM recurring_tasks WHERE id = ?', [recurringTaskId]);
        if (rec) {
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'recurring_task', ?, 'update', ?, ?, 0)`,
            [generateUUID(), rec.user_id, recurringTaskId, JSON.stringify(rec), now]
          );
        }

        // 2. Remove future uncompleted occurrences
        const futureTasks = await tx.getAllAsync<any>(
          `SELECT id FROM tasks WHERE recurring_task_id = ? AND completed = 0 AND task_date >= ?`,
          [recurringTaskId, todayISO]
        );

        for (const t of futureTasks) {
          notificationService.cancelTaskNotification(t.id).catch(() => {});
          await tx.runAsync('DELETE FROM tasks WHERE id = ?', [t.id]);
          if (rec) {
            await tx.runAsync(
              `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
               VALUES (?, ?, 'task', ?, 'delete', NULL, ?, 0)`,
              [generateUUID(), rec.user_id, t.id, now]
            );
          }
        }
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to end recurring series.' };
    }
  },

  async deleteRecurringTask(id: string): Promise<{ error: string | null }> {
    try {
      const todayISO = getTodayISO();
      const now = new Date().toISOString();

      await withTransaction(async (tx) => {
        const rec = await tx.getFirstAsync<any>('SELECT * FROM recurring_tasks WHERE id = ?', [id]);
        if (!rec) return;

        // 1. Delete recurring definition
        await tx.runAsync('DELETE FROM recurring_tasks WHERE id = ?', [id]);
        await tx.runAsync('DELETE FROM recurring_task_exceptions WHERE recurring_task_id = ?', [id]);

        await tx.runAsync(
          `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
           VALUES (?, ?, 'recurring_task', ?, 'delete', NULL, ?, 0)`,
          [generateUUID(), rec.user_id, id, now]
        );

        // 2. Delete future uncompleted occurrences
        const futureTasks = await tx.getAllAsync<any>(
          `SELECT id FROM tasks WHERE recurring_task_id = ? AND completed = 0 AND task_date >= ?`,
          [id, todayISO]
        );

        for (const t of futureTasks) {
          notificationService.cancelTaskNotification(t.id).catch(() => {});
          await tx.runAsync('DELETE FROM tasks WHERE id = ?', [t.id]);
          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'task', ?, 'delete', NULL, ?, 0)`,
            [generateUUID(), rec.user_id, t.id, now]
          );
        }

        // 3. For historical completed tasks, set recurring_task_id to NULL
        await tx.runAsync('UPDATE tasks SET recurring_task_id = NULL WHERE recurring_task_id = ?', [id]);
      });

      syncService.syncNow().catch(() => {});
      return { error: null };
    } catch (err: any) {
      return { error: err?.message || 'Failed to delete recurring task.' };
    }
  },

  /**
   * Generates rolling window occurrences locally in SQLite.
   * Completely independent of internet connection.
   */
  async syncOccurrences(daysAhead: number = 30): Promise<{ count: number; error: string | null }> {
    try {
      const db = getDatabase();
      const userId = getActiveUserId();
      if (!userId) return { count: 0, error: 'User is not authenticated.' };

      // 1. Fetch active recurring tasks from SQLite
      const activeRecurring = await db.getAllAsync<any>(
        'SELECT * FROM recurring_tasks WHERE user_id = ? AND active = 1',
        [userId]
      );

      if (!activeRecurring || activeRecurring.length === 0) {
        return { count: 0, error: null };
      }

      const todayISO = getTodayISO();
      const maxDateISO = addDaysToDate(todayISO, daysAhead);

      // 2. Fetch exceptions
      const exceptions = await db.getAllAsync<any>(
        `SELECT recurring_task_id, occurrence_date FROM recurring_task_exceptions
         WHERE user_id = ? AND occurrence_date >= ? AND occurrence_date <= ?`,
        [userId, todayISO, maxDateISO]
      );

      const exceptionSet = new Set<string>();
      exceptions.forEach((e) => {
        exceptionSet.add(`${e.recurring_task_id}|${e.occurrence_date}`);
      });

      // 3. Fetch existing occurrences
      const existingOccurrences = await db.getAllAsync<any>(
        `SELECT recurring_task_id, task_date FROM tasks
         WHERE user_id = ? AND recurring_task_id IS NOT NULL AND task_date >= ? AND task_date <= ?`,
        [userId, todayISO, maxDateISO]
      );

      const existingSet = new Set<string>();
      existingOccurrences.forEach((o) => {
        existingSet.add(`${o.recurring_task_id}|${o.task_date}`);
      });

      const toInsert: Task[] = [];
      const now = new Date().toISOString();

      for (const def of activeRecurring) {
        const weekDays = def.week_days ? JSON.parse(def.week_days) : null;
        const activeDays = def.frequency === 'weekly' ? normalizeWeekDays(weekDays, def.week_day) || [] : [];

        for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
          const targetDate = addDaysToDate(todayISO, dayOffset);
          if (targetDate < def.start_date) continue;

          let matches = false;
          if (def.frequency === 'daily') {
            matches = true;
          } else if (def.frequency === 'weekly' && activeDays.length > 0) {
            const dayOfWeek = getDayOfWeekFromISO(targetDate);
            matches = activeDays.includes(dayOfWeek);
          }

          if (matches) {
            if (targetDate === todayISO && def.task_time && isTimePastToday(def.task_time)) {
              continue;
            }

            const key = `${def.id}|${targetDate}`;
            if (exceptionSet.has(key)) continue;

            if (!existingSet.has(key)) {
              const taskId = generateUUID();
              toInsert.push({
                id: taskId,
                user_id: userId,
                recurring_task_id: def.id,
                title: def.title,
                description: def.description || null,
                task_date: targetDate,
                task_time: def.task_time || null,
                completed: false,
                created_at: now,
                updated_at: now,
              });
              existingSet.add(key);
            }
          }
        }
      }

      if (toInsert.length === 0) {
        return { count: 0, error: null };
      }

      // 4. Batch insert into SQLite tasks and sync_queue atomically
      await withTransaction(async (tx) => {
        for (const task of toInsert) {
          await tx.runAsync(
            `INSERT INTO tasks (id, user_id, recurring_task_id, title, description, task_date, task_time, completed, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
            [
              task.id,
              task.user_id,
              task.recurring_task_id ?? null,
              task.title,
              task.description ?? null,
              task.task_date,
              task.task_time,
              task.created_at,
              task.updated_at,
            ]
          );

          await tx.runAsync(
            `INSERT INTO sync_queue (id, user_id, entity_type, entity_id, operation, payload, created_at, retry_count)
             VALUES (?, ?, 'task', ?, 'create', ?, ?, 0)`,
            [generateUUID(), task.user_id, task.id, JSON.stringify(task), now]
          );
        }
      });

      // 5. Schedule local notifications for newly generated future occurrences
      for (const task of toInsert) {
        if (task.task_time) {
          notificationService.scheduleTaskNotification(task).catch(() => {});
        }
      }

      return { count: toInsert.length, error: null };
    } catch (err: any) {
      return { count: 0, error: err?.message || 'Failed to sync occurrences locally.' };
    }
  },
};
