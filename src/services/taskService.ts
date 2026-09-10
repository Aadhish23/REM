import { supabase } from './supabase';
import { Task, CreateTaskDTO, UpdateTaskDTO } from '../types/task';
import { notificationService } from './notificationService';

function formatTaskError(error: Error | null): string {
  if (!error) return 'An unexpected error occurred.';
  console.warn('[TaskService Error]:', error.message, error);
  const message = error.message.toLowerCase();

  if (message.includes('network') || message.includes('fetch') || message.includes('failed to connect')) {
    return 'Network connection issue. Please check your internet connection.';
  }
  if (message.includes('row-level security') || message.includes('permission denied')) {
    return 'Access denied. You do not have permission to modify this task.';
  }
  if (message.includes('jwt expired') || message.includes('invalid claim')) {
    return 'Your session has expired. Please sign in again.';
  }

  return error.message;
}

export const taskService = {
  async getTasks(): Promise<{ data: Task[] | null; error: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('task_date', { ascending: true })
        .order('task_time', { ascending: true, nullsFirst: false });

      if (error) {
        return { data: null, error: formatTaskError(error) };
      }

      return { data: data as Task[], error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatTaskError(err) : 'Failed to fetch tasks.',
      };
    }
  },

  async createTask(
    dto: CreateTaskDTO
  ): Promise<{ data: Task | null; error: string | null; notificationWarning?: string | null }> {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        return { data: null, error: 'User is not authenticated.' };
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          task_date: dto.task_date,
          task_time: dto.task_time || null,
          completed: false,
          recurring_task_id: dto.recurring_task_id || null,
        })
        .select()
        .single();

      if (error) {
        return { data: null, error: formatTaskError(error) };
      }

      const createdTask = data as Task;
      let notificationWarning: string | null = null;

      try {
        const notifResult = await notificationService.scheduleTaskNotification(createdTask);
        if (notifResult.reason === 'permission_denied') {
          notificationWarning =
            'Task saved, but reminders are disabled. You can enable notifications anytime in your Android Settings.';
        }
      } catch (notifErr) {
        console.warn('[TaskService] Notification schedule non-blocking failure:', notifErr);
      }

      return { data: createdTask, error: null, notificationWarning };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatTaskError(err) : 'Failed to create task.',
      };
    }
  },

  async updateTask(
    id: string,
    dto: UpdateTaskDTO
  ): Promise<{ data: Task | null; error: string | null; notificationWarning?: string | null }> {
    try {
      const payload: Partial<Task> = {};
      if (dto.title !== undefined) payload.title = dto.title.trim();
      if (dto.description !== undefined) payload.description = dto.description?.trim() || null;
      if (dto.task_date !== undefined) payload.task_date = dto.task_date;
      if (dto.task_time !== undefined) payload.task_time = dto.task_time || null;
      if (dto.completed !== undefined) payload.completed = dto.completed;

      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return { data: null, error: formatTaskError(error) };
      }

      const updatedTask = data as Task;
      let notificationWarning: string | null = null;

      try {
        const notifResult = await notificationService.scheduleTaskNotification(updatedTask);
        if (notifResult.reason === 'permission_denied') {
          notificationWarning =
            'Task updated, but reminders are disabled. You can enable notifications anytime in your Android Settings.';
        }
      } catch (notifErr) {
        console.warn('[TaskService] Notification reschedule non-blocking failure:', notifErr);
      }

      return { data: updatedTask, error: null, notificationWarning };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? formatTaskError(err) : 'Failed to update task.',
      };
    }
  },

  async toggleTaskCompletion(
    id: string,
    currentStatus: boolean
  ): Promise<{ data: Task | null; error: string | null }> {
    return this.updateTask(id, { completed: !currentStatus });
  },

  async deleteTask(id: string): Promise<{ error: string | null }> {
    try {
      // 1. Cancel its scheduled notification first to prevent orphaned reminders
      await notificationService.cancelTaskNotification(id).catch((err) => {
        console.warn('[TaskService] Notification cancellation non-blocking failure:', err);
      });

      // 2. Delete task from Supabase
      const { error } = await supabase.from('tasks').delete().eq('id', id);

      if (error) {
        return { error: formatTaskError(error) };
      }

      return { error: null };
    } catch (err) {
      return {
        error: err instanceof Error ? formatTaskError(err) : 'Failed to delete task.',
      };
    }
  },
};
