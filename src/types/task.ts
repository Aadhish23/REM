export type RecurrenceFrequency = 'daily' | 'weekly';

export interface RecurringTask {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  frequency: RecurrenceFrequency;
  week_day?: number | null; // Legacy single day (0=Sun, 1=Mon, ..., 6=Sat)
  week_days: number[] | null; // Multi-day weekly recurrence: array of 0..6
  task_time: string | null; // HH:mm:ss
  start_date: string; // YYYY-MM-DD
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringTaskDTO {
  title: string;
  description?: string | null;
  frequency: RecurrenceFrequency;
  week_day?: number | null;
  week_days?: number[] | null;
  task_time?: string | null;
  start_date?: string;
}

export interface UpdateRecurringTaskDTO {
  title?: string;
  description?: string | null;
  frequency?: RecurrenceFrequency;
  week_day?: number | null;
  week_days?: number[] | null;
  task_time?: string | null;
  start_date?: string;
  active?: boolean;
}

export interface RecurringTaskException {
  id: string;
  recurring_task_id: string;
  user_id: string;
  occurrence_date: string; // YYYY-MM-DD
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  recurring_task_id?: string | null;
  title: string;
  description: string | null;
  task_date: string; // ISO Date YYYY-MM-DD
  task_time: string | null; // HH:mm:ss
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTaskDTO {
  title: string;
  description?: string | null;
  task_date: string; // YYYY-MM-DD
  task_time?: string | null; // HH:mm:ss or null
  recurring_task_id?: string | null;
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string | null;
  task_date?: string;
  task_time?: string | null;
  completed?: boolean;
}
