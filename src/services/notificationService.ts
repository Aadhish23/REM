import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task } from '../types/task';

const NOTIFICATION_MAP_STORAGE_KEY = 'rem_task_notification_mapping';
const CHANNEL_ID = 'task-reminders';

// Configure foreground notification behavior for Expo SDK 57
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Initializes the Android notification channel for task alarms
 */
export async function initNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Task Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        sound: 'default',
        enableVibrate: true,
      });
    } catch (e) {
      // In Expo Go, custom channel creation may be handled by the default system channel
      console.log('[NotificationService] Android notification channel setup notice:', e);
    }
  }
}

/**
 * Local persistent mapping between Supabase Task ID and Expo Notification ID
 */
async function getNotificationMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setNotificationMap(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_MAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage failure
  }
}

export const notificationService = {
  /**
   * Check if notification permission is currently granted
   */
  async checkPermission(): Promise<boolean> {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  /**
   * Request notification permission from user (Android 13+)
   */
  async requestPermission(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      if (existingStatus === 'granted') {
        return true;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  },

  /**
   * Parse a task's date and time into a device-local Date object
   */
  getTaskScheduledDate(taskDateStr: string, taskTimeStr: string | null | undefined): Date | null {
    if (!taskDateStr || !taskTimeStr) return null;

    try {
      const [year, month, day] = taskDateStr.split('-').map(Number);
      const [hours, minutes] = taskTimeStr.split(':').map(Number);

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
        return null;
      }

      // Constructs local date exactly on the phone's local timezone
      return new Date(year, month - 1, day, hours, minutes, 0, 0);
    } catch {
      return null;
    }
  },

  /**
   * Schedule a local notification for a task.
   * Cancels any prior notification for this task to guarantee zero duplicates.
   */
  async scheduleTaskNotification(
    task: Task
  ): Promise<{ scheduled: boolean; reason?: string }> {
    try {
      // 1. If task is completed or has no time, ensure any prior notification is cancelled
      if (task.completed || !task.task_time) {
        await this.cancelTaskNotification(task.id);
        return { scheduled: false, reason: 'task_completed_or_no_time' };
      }

      // 2. Parse target date/time in phone's local timezone
      const scheduledDate = this.getTaskScheduledDate(task.task_date, task.task_time);
      if (!scheduledDate) {
        await this.cancelTaskNotification(task.id);
        return { scheduled: false, reason: 'invalid_date_time' };
      }

      // 3. Prevent scheduling notifications in the past
      if (scheduledDate.getTime() <= Date.now()) {
        await this.cancelTaskNotification(task.id);
        return { scheduled: false, reason: 'past_time' };
      }

      // 4. Check / Request permissions
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        return { scheduled: false, reason: 'permission_denied' };
      }

      // 5. Cancel any prior notification for this task
      await this.cancelTaskNotification(task.id);

      // 6. Schedule with Expo local notifications
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'REM Reminder',
          body: task.title,
          data: { taskId: task.id },
          sound: 'default',
          color: '#6366F1',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: scheduledDate,
          channelId: CHANNEL_ID,
        },
      });

      // 7. Persist mapping: taskId -> notificationId
      const map = await getNotificationMap();
      map[task.id] = notificationId;
      await setNotificationMap(map);

      return { scheduled: true };
    } catch (err) {
      console.warn('[NotificationService] Schedule failed:', err);
      return { scheduled: false, reason: 'scheduling_error' };
    }
  },

  /**
   * Cancel a task's scheduled notification and remove from mapping
   */
  async cancelTaskNotification(taskId: string): Promise<void> {
    try {
      const map = await getNotificationMap();
      const existingNotificationId = map[taskId];

      if (existingNotificationId) {
        await Notifications.cancelScheduledNotificationAsync(existingNotificationId).catch(() => {});
        delete map[taskId];
        await setNotificationMap(map);
      }
    } catch (err) {
      console.warn('[NotificationService] Cancel failed:', err);
    }
  },

  /**
   * Retrieve all currently scheduled notifications on the device (for debugging/testing)
   */
  async getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch {
      return [];
    }
  },
};
