/**
 * Date and time helper functions for REM Tasks module.
 * Designed to strictly respect local phone calendar dates and times without timezone offsets.
 */

export function formatDateToISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayISO(): string {
  return formatDateToISO(new Date());
}

export function getTomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateToISO(d);
}

export function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  if (isNaN(hours)) return timeStr;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12

  return `${hours}:${minutes} ${ampm}`;
}

export function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const today = getTodayISO();
  const tomorrow = getTomorrowISO();

  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';

  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);

    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  return dateStr;
}

export function isToday(dateStr: string): boolean {
  return dateStr === getTodayISO();
}

export function isUpcoming(dateStr: string): boolean {
  return dateStr > getTodayISO();
}

export function isPast(dateStr: string): boolean {
  return dateStr < getTodayISO();
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return formatDateToISO(dt);
}

export function getDayOfWeekFromISO(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getDay(); // 0 = Sunday ... 6 = Saturday
}

/**
 * Checks if a time string "HH:mm:ss" or "HH:mm" has already passed for today
 * strictly using device local time.
 */
export function isTimePastToday(timeStr: string, now: Date = new Date()): boolean {
  if (!timeStr) return false;
  const parts = timeStr.split(':');
  if (parts.length < 2) return false;

  const taskH = parseInt(parts[0], 10);
  const taskM = parseInt(parts[1], 10);
  if (isNaN(taskH) || isNaN(taskM)) return false;

  const curH = now.getHours();
  const curM = now.getMinutes();

  if (taskH < curH) return true;
  if (taskH === curH && taskM <= curM) return true;
  return false;
}

/**
 * Determines whether a task is Expired:
 * - Completed tasks are NEVER expired.
 * - Incomplete task with date < today is Expired.
 * - Incomplete task with date == today and a scheduled time < current local time is Expired.
 * - Incomplete task with date == today and no time is NOT expired.
 * - Future tasks are NOT expired.
 */
export function isTaskExpired(
  taskDate: string,
  taskTime: string | null | undefined,
  completed: boolean,
  now: Date = new Date()
): boolean {
  if (completed) return false;

  const todayISO = formatDateToISO(now);

  if (taskDate < todayISO) {
    return true;
  }

  if (taskDate === todayISO && taskTime) {
    return isTimePastToday(taskTime, now);
  }

  return false;
}
