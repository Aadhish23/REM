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

/**
 * Formats an ISO date/time string into a human-friendly relative time label:
 * - "just now" (< 1 min)
 * - "X min ago" (< 60 min)
 * - "X hour(s) ago" (< 24 hours and today)
 * - "yesterday"
 * - "Sep 15" (current year)
 * - "Sep 15, 2025" (different year)
 */
export function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 0) return 'just now'; // slight clock skew
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24 && date.getDate() === now.getDate()) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return 'yesterday';
  }

  // Same year: "Sep 15"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  // Different year: "Sep 15, 2025"
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date/time string for full date & time display (e.g. NoteView):
 * e.g. "Sep 16, 2026, 9:30 PM"
 */
export function formatDateTimeDisplay(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Formats a calendar date string (YYYY-MM-DD) into standard document display "DD MMM YYYY".
 * Strictly uses date components without timezone shifts.
 * e.g. "2000-01-01" -> "01 Jan 2000"
 */
export function formatDocumentDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return dateStr;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = months[month - 1] || '';
  const paddedDay = String(day).padStart(2, '0');

  return `${paddedDay} ${monthName} ${year}`;
}

