import { supabase } from './supabase';
import {
  RecurringTask,
  CreateRecurringTaskDTO,
  UpdateRecurringTaskDTO,
  Task,
} from '../types/task';
import { getTodayISO, addDaysToDate, getDayOfWeekFromISO, isTimePastToday } from '../utils/date';
import { notificationService } from './notificationService';

function formatRecurringError(error: Error | null): string {
  if (!error) return 'An unexpected error occurred.';
  console.warn('[RecurringTaskService Error]:', error.message, error);
  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Access denied. You do not have permission to modify recurring tasks.';
  }
  return error.message;
}

function normalizeWeekDays(weekDays?: number[] | null, legacyWeekDay?: number | null): number[] | null {
  if (Array.isArray(weekDays) && weekDays.length > 0) {
    // Unique, sorted between 0 and 6
    const unique = Array.from(new Set(weekDays.filter((d) => d >= 0 && d <= 6)));
    unique.sort((a, b) => a - b);
    return unique.length > 0 ? unique : null;
  }
  if (legacyWeekDay !== undefined && legacyWeekDay !== null && legacyWeekDay >= 0 && legacyWeekDay <= 6) {
    return [legacyWeekDay];
  }
  return null;
}

export const recurringTaskService = {
  /**
   * Fetch all recurring tasks for the current authenticated user
   */
  async getRecurringTasks(): Promise<{ data: RecurringTask[] | null; error: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const { data, error } = await supabase
        .from('recurring_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return { data: null, error: formatRecurringError(error) };
      }

      return { data: data as RecurringTask[], error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to fetch recurring tasks.',
      };
    }
  },

  /**
   * Fetch a single recurring task by ID
   */
  async getRecurringTaskById(
    id: string
  ): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('recurring_tasks')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        return { data: null, error: formatRecurringError(error) };
      }

      return { data: data as RecurringTask, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to fetch recurring task.',
      };
    }
  },

  /**
   * Create a new recurring task definition and immediately generate rolling window occurrences
   */
  async createRecurringTask(
    dto: CreateRecurringTaskDTO
  ): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const startDate = dto.start_date || getTodayISO();
      const normalizedDays = dto.frequency === 'weekly' ? normalizeWeekDays(dto.week_days, dto.week_day) : null;

      const { data, error } = await supabase
        .from('recurring_tasks')
        .insert({
          user_id: user.id,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          frequency: dto.frequency,
          week_day: normalizedDays && normalizedDays.length > 0 ? normalizedDays[0] : null,
          week_days: normalizedDays,
          task_time: dto.task_time || null,
          start_date: startDate,
          active: true,
        })
        .select()
        .single();

      if (error) {
        return { data: null, error: formatRecurringError(error) };
      }

      const created = data as RecurringTask;

      // Automatically generate rolling occurrences for this new recurring definition
      await this.syncOccurrences();

      return { data: created, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to create recurring task.',
      };
    }
  },

  /**
   * Update an existing recurring task definition.
   * If recurrence parameters change, cleans up obsolete future occurrences and resyncs.
   * Historical completed occurrences are preserved.
   */
  async updateRecurringTask(
    id: string,
    dto: UpdateRecurringTaskDTO
  ): Promise<{ data: RecurringTask | null; error: string | null }> {
    try {
      const payload: Partial<RecurringTask> = {};
      if (dto.title !== undefined) payload.title = dto.title.trim();
      if (dto.description !== undefined) payload.description = dto.description?.trim() || null;
      if (dto.frequency !== undefined) payload.frequency = dto.frequency;

      if (dto.frequency === 'weekly' || dto.week_days !== undefined || dto.week_day !== undefined) {
        const normalized = normalizeWeekDays(dto.week_days, dto.week_day);
        payload.week_days = normalized;
        payload.week_day = normalized && normalized.length > 0 ? normalized[0] : null;
      } else if (dto.frequency === 'daily') {
        payload.week_days = null;
        payload.week_day = null;
      }

      if (dto.task_time !== undefined) payload.task_time = dto.task_time || null;
      if (dto.start_date !== undefined) payload.start_date = dto.start_date;
      if (dto.active !== undefined) payload.active = dto.active;

      const { data, error } = await supabase
        .from('recurring_tasks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { data: null, error: formatRecurringError(error) };
      }

      const todayISO = getTodayISO();

      // If deactivated, cancel future notifications and delete future uncompleted occurrences
      if (dto.active === false) {
        await this.cancelFutureNotificationsForDefinition(id);
        await supabase
          .from('tasks')
          .delete()
          .eq('recurring_task_id', id)
          .eq('completed', false)
          .gte('task_date', todayISO);
      } else {
        // If schedule or time was changed, cancel and delete future uncompleted occurrences
        // so the new schedule generates cleanly without orphaned rows. Completed tasks remain intact.
        await this.cancelFutureNotificationsForDefinition(id);
        await supabase
          .from('tasks')
          .delete()
          .eq('recurring_task_id', id)
          .eq('completed', false)
          .gte('task_date', todayISO);

        // Resync with new configuration
        await this.syncOccurrences();
      }

      return { data: data as RecurringTask, error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to update recurring task.',
      };
    }
  },

  /**
   * Record a recurrence exception (occurrence exclusion) for a specific date.
   * This guarantees that sliding-window synchronization will NEVER recreate this occurrence.
   */
  async addException(recurringTaskId: string, occurrenceDate: string): Promise<{ error: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { error: 'User is not authenticated.' };
      }

      const { error } = await supabase.from('recurring_task_exceptions').upsert(
        {
          recurring_task_id: recurringTaskId,
          user_id: user.id,
          occurrence_date: occurrenceDate,
        },
        { onConflict: 'recurring_task_id,occurrence_date' }
      );

      if (error) {
        console.warn('[RecurringTaskService] addException warning:', error);
      }

      return { error: null };
    } catch (err) {
      console.warn('[RecurringTaskService] addException error:', err);
      return { error: null };
    }
  },

  /**
   * Delete ONLY this specific occurrence of a recurring task.
   * 1. Cancels its local notification.
   * 2. Adds an exclusion record into recurring_task_exceptions (so sliding window never recreates it).
   * 3. Deletes the occurrence row from tasks.
   * 4. Keeps the recurring series active.
   */
  async deleteOccurrenceOnly(task: Task): Promise<{ error: string | null }> {
    try {
      // 1. Cancel notification
      await notificationService.cancelTaskNotification(task.id);

      // 2. Record exception if it is part of a recurring series
      if (task.recurring_task_id) {
        await this.addException(task.recurring_task_id, task.task_date);
      }

      // 3. Delete the task record
      const { error } = await supabase.from('tasks').delete().eq('id', task.id);
      if (error) {
        return { error: formatRecurringError(error) };
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to delete occurrence.',
      };
    }
  },

  /**
   * End/stop a recurring series (deactivates recurrence).
   * 1. Marks active = false.
   * 2. Cancels all future notifications for this series.
   * 3. Removes future uncompleted occurrences from tasks table.
   * 4. Preserves all historical and completed occurrences.
   */
  async endRecurringSeries(recurringTaskId: string): Promise<{ error: string | null }> {
    try {
      const todayISO = getTodayISO();

      // 1. Cancel future notifications
      await this.cancelFutureNotificationsForDefinition(recurringTaskId);

      // 2. Remove future uncompleted occurrences
      await supabase
        .from('tasks')
        .delete()
        .eq('recurring_task_id', recurringTaskId)
        .eq('completed', false)
        .gte('task_date', todayISO);

      // 3. Mark recurring definition as inactive
      const { error } = await supabase
        .from('recurring_tasks')
        .update({ active: false })
        .eq('id', recurringTaskId);

      if (error) {
        return { error: formatRecurringError(error) };
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to end recurring series.',
      };
    }
  },

  /**
   * Permanently delete a recurring task definition.
   * Cancels future uncompleted notifications, deletes uncompleted future occurrences,
   * and preserves historical completed occurrences (FK ON DELETE SET NULL).
   */
  async deleteRecurringTask(id: string): Promise<{ error: string | null }> {
    try {
      const todayISO = getTodayISO();

      // 1. Cancel future notifications for pending tasks
      await this.cancelFutureNotificationsForDefinition(id);

      // 2. Delete pending future occurrences
      await supabase
        .from('tasks')
        .delete()
        .eq('recurring_task_id', id)
        .eq('completed', false)
        .gte('task_date', todayISO);

      // 3. Delete recurring definition (historical completed tasks have recurring_task_id set to NULL by FK)
      const { error } = await supabase.from('recurring_tasks').delete().eq('id', id);

      if (error) {
        return { error: formatRecurringError(error) };
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to delete recurring task.',
      };
    }
  },

  /**
   * Helper: Cancel future notifications for pending tasks belonging to a recurring definition
   */
  async cancelFutureNotificationsForDefinition(recurringTaskId: string): Promise<void> {
    try {
      const todayISO = getTodayISO();
      const { data: futureTasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('recurring_task_id', recurringTaskId)
        .eq('completed', false)
        .gte('task_date', todayISO);

      if (futureTasks && futureTasks.length > 0) {
        await Promise.all(
          futureTasks.map((t) => notificationService.cancelTaskNotification(t.id))
        );
      }
    } catch (err) {
      console.warn('[RecurringTaskService] Cancel future notifications failure:', err);
    }
  },

  /**
   * Sliding-window occurrence generator.
   * Continuously maintains a rolling 30-day future window relative to today:
   * [today, today + daysAhead]
   *
   * Idempotent & Exception-aware:
   * - Respects start_date.
   * - Checks recurring_task_exceptions (deleted occurrences are NEVER recreated).
   * - Checks existing tasks to avoid duplicate rows.
   * - Protected at database level by partial unique index idx_tasks_recurring_task_date.
   * - Schedules notifications for newly created future timed occurrences.
   */
  async syncOccurrences(daysAhead: number = 30): Promise<{ count: number; error: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { count: 0, error: 'User is not authenticated.' };
      }

      // 1. Fetch active recurring tasks
      const { data: activeRecurring, error: fetchError } = await supabase
        .from('recurring_tasks')
        .select('*')
        .eq('active', true);

      if (fetchError) {
        return { count: 0, error: formatRecurringError(fetchError) };
      }

      if (!activeRecurring || activeRecurring.length === 0) {
        return { count: 0, error: null };
      }

      const todayISO = getTodayISO();
      const maxDateISO = addDaysToDate(todayISO, daysAhead);
      const recurringIds = activeRecurring.map((r) => r.id);

      // 2. Fetch deleted-occurrence exceptions in this window
      const { data: exceptionsData, error: exceptionsError } = await supabase
        .from('recurring_task_exceptions')
        .select('recurring_task_id, occurrence_date')
        .in('recurring_task_id', recurringIds)
        .gte('occurrence_date', todayISO)
        .lte('occurrence_date', maxDateISO);

      if (exceptionsError) {
        console.warn('[RecurringTaskService] Fetch exceptions warning:', exceptionsError.message);
      }

      const exceptionSet = new Set<string>();
      (exceptionsData || []).forEach((item) => {
        if (item.recurring_task_id && item.occurrence_date) {
          exceptionSet.add(`${item.recurring_task_id}|${item.occurrence_date}`);
        }
      });

      // 3. Fetch existing task occurrences for this user in the window
      const { data: existingOccurrences, error: existingError } = await supabase
        .from('tasks')
        .select('recurring_task_id, task_date')
        .in('recurring_task_id', recurringIds)
        .gte('task_date', todayISO)
        .lte('task_date', maxDateISO);

      if (existingError) {
        return { count: 0, error: formatRecurringError(existingError) };
      }

      const existingSet = new Set<string>();
      (existingOccurrences || []).forEach((item) => {
        if (item.recurring_task_id && item.task_date) {
          existingSet.add(`${item.recurring_task_id}|${item.task_date}`);
        }
      });

      // 4. Compute missing occurrences across the rolling window
      const toInsert: Array<{
        user_id: string;
        recurring_task_id: string;
        title: string;
        description: string | null;
        task_date: string;
        task_time: string | null;
        completed: boolean;
      }> = [];

      for (const def of activeRecurring) {
        // Normalize week days (supports array week_days or fallback to legacy week_day)
        const activeDays =
          def.frequency === 'weekly'
            ? normalizeWeekDays(def.week_days, def.week_day) || []
            : [];

        for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
          const targetDate = addDaysToDate(todayISO, dayOffset);

          // Respect start_date
          if (targetDate < def.start_date) {
            continue;
          }

          // Check recurrence frequency
          let matches = false;
          if (def.frequency === 'daily') {
            matches = true;
          } else if (def.frequency === 'weekly' && activeDays.length > 0) {
            const dayOfWeek = getDayOfWeekFromISO(targetDate);
            matches = activeDays.includes(dayOfWeek);
          }

          if (matches) {
            // If target date is today and scheduled time has already passed today, do not create today's occurrence
            if (targetDate === todayISO && def.task_time && isTimePastToday(def.task_time)) {
              continue;
            }

            const key = `${def.id}|${targetDate}`;

            // Check if user previously deleted this occurrence (exception)
            if (exceptionSet.has(key)) {
              continue; // Excluded! Never recreate.
            }

            // Check if occurrence already exists
            if (!existingSet.has(key)) {
              toInsert.push({
                user_id: user.id,
                recurring_task_id: def.id,
                title: def.title,
                description: def.description,
                task_date: targetDate,
                task_time: def.task_time,
                completed: false,
              });
              existingSet.add(key); // prevent intra-batch duplicates
            }
          }
        }
      }

      if (toInsert.length === 0) {
        return { count: 0, error: null };
      }

      // 5. Insert missing occurrences into public.tasks
      const { data: insertedTasks, error: insertError } = await supabase
        .from('tasks')
        .insert(toInsert)
        .select();

      if (insertError) {
        return { count: 0, error: formatRecurringError(insertError) };
      }

      // 6. Schedule local notifications for newly inserted occurrences
      const createdList = (insertedTasks || []) as Task[];
      for (const task of createdList) {
        if (task.task_time) {
          notificationService.scheduleTaskNotification(task).catch((err) => {
            console.warn('[RecurringTaskService] Schedule notification non-blocking error:', err);
          });
        }
      }

      return { count: createdList.length, error: null };
    } catch (err) {
      return {
        count: 0,
        error: err instanceof Error ? formatRecurringError(err) : 'Failed to sync recurring occurrences.',
      };
    }
  },
};
