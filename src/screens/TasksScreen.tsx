import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { TaskItem } from '../components/TaskItem';
import { TaskModal, TaskModalSaveData } from '../components/TaskModal';
import { localTaskService } from '../services/localTaskService';
import { notificationService } from '../services/notificationService';
import { Task } from '../types/task';
import {
  isToday,
  isUpcoming,
  isTaskExpired,
  getTodayISO,
} from '../utils/date';
import { theme } from '../constants/theme';

type TaskTab = 'today' | 'today_completed' | 'upcoming' | 'expired' | 'all_completed';

interface TabItem {
  id: TaskTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  { id: 'today', label: 'Today', icon: 'sunny-outline' },
  { id: 'today_completed', label: 'Today Completed', icon: 'checkmark-circle-outline' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar-outline' },
  { id: 'expired', label: 'Expired', icon: 'alert-circle-outline' },
  { id: 'all_completed', label: 'All Completed Task', icon: 'checkmark-done-outline' },
];

export const TasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>('today');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Auto-updating expired timer: re-evaluates every 10 seconds and on foreground return
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        setCurrentTime(new Date());
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const loadTasks = useCallback(async () => {
    setErrorMessage(null);

    // 1. Sync recurring occurrences locally for rolling 30-day window
    try {
      await localTaskService.syncOccurrences();
    } catch (syncErr) {
      console.warn('[TasksScreen] Sync occurrences non-blocking error:', syncErr);
    }

    // 2. Fetch all user tasks from local SQLite
    const { data, error } = await localTaskService.getTasks();
    if (error) {
      setErrorMessage(error);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const onRefresh = () => {
    setRefreshing(true);
    setCurrentTime(new Date());
    loadTasks();
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedTaskIds(new Set());
  };

  const handleToggleSelect = (task: Task) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) {
        next.delete(task.id);
      } else {
        next.add(task.id);
      }
      return next;
    });
  };

  const handleLongPressTask = (task: Task) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedTaskIds(new Set([task.id]));
    }
  };

  const handleCreateOrUpdate = async (data: TaskModalSaveData): Promise<boolean> => {
    if (editingTask) {
      if (data.recurring_task_id) {
        // Editing a recurring task definition
        if (data.repeatType === 'daily' || data.repeatType === 'weekly') {
          const { error: recError } = await localTaskService.updateRecurringTask(
            data.recurring_task_id,
            {
              title: data.title,
              description: data.description,
              frequency: data.repeatType,
              week_days: data.week_days,
              task_time: data.task_time,
              start_date: data.task_date,
            }
          );
          if (recError) {
            Alert.alert('Error updating recurring task', recError);
            return false;
          }
          await loadTasks();
        } else {
          // Changed to 'none': End the recurring series and convert current occurrence to independent task
          await localTaskService.endRecurringSeries(data.recurring_task_id);
          await localTaskService.updateTask(editingTask.id, {
            title: data.title,
            description: data.description,
            task_date: data.task_date,
            task_time: data.task_time,
          });
          await loadTasks();
        }
      } else {
        // Editing a one-time task
        if (data.repeatType === 'daily' || data.repeatType === 'weekly') {
          // Converted from one-time to recurring
          await localTaskService.createRecurringTask({
            title: data.title,
            description: data.description,
            frequency: data.repeatType,
            week_days: data.week_days,
            task_time: data.task_time,
            start_date: data.task_date,
          });
          await localTaskService.deleteTask(editingTask.id);
          await loadTasks();
        } else {
          // Regular one-time task update
          const { data: updated, error, notificationWarning } = await localTaskService.updateTask(
            editingTask.id,
            {
              title: data.title,
              description: data.description,
              task_date: data.task_date,
              task_time: data.task_time,
            }
          );
          if (error) {
            Alert.alert('Error updating task', error);
            return false;
          }
          if (updated) {
            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }
          if (notificationWarning) {
            Alert.alert('Notice', notificationWarning);
          }
        }
      }
    } else {
      // Creating a new task
      if (data.repeatType === 'daily' || data.repeatType === 'weekly') {
        const { error: recError } = await localTaskService.createRecurringTask({
          title: data.title,
          description: data.description,
          frequency: data.repeatType,
          week_days: data.week_days,
          task_time: data.task_time,
          start_date: data.task_date,
        });
        if (recError) {
          Alert.alert('Error creating recurring task', recError);
          return false;
        }
        await loadTasks();
      } else {
        const { data: created, error, notificationWarning } = await localTaskService.createTask(data);
        if (error) {
          Alert.alert('Error creating task', error);
          return false;
        }
        if (created) {
          setTasks((prev) => [...prev, created]);
        }
        if (notificationWarning) {
          Alert.alert('Notice', notificationWarning);
        }
      }
    }

    setEditingTask(null);
    return true;
  };

  const handleToggleComplete = async (task: Task) => {
    // Optimistic UI update: instantly moves between pending/expired and completed
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t))
    );

    const { error } = await localTaskService.toggleTaskCompletion(task.id, task.completed);
    if (error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t))
      );
      Alert.alert('Error', error);
    }
  };

  const handleDelete = (task: Task) => {
    const todayISO = getTodayISO();

    if (task.recurring_task_id) {
      Alert.alert(
        'Recurring Task Actions',
        `"${task.title}" repeats regularly. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete this occurrence',
            onPress: async () => {
              // Immediately update local React state: occurrence disappears instantly
              setTasks((prev) => prev.filter((t) => t.id !== task.id));

              const { error } = await localTaskService.deleteOccurrenceOnly(task);
              if (error) {
                await loadTasks();
                Alert.alert('Error deleting occurrence', error);
              }
            },
          },
          {
            text: 'End recurring series',
            onPress: async () => {
              // Immediately update local React state: remove future uncompleted occurrences of this series
              setTasks((prev) =>
                prev.filter(
                  (t) =>
                    !(
                      t.recurring_task_id === task.recurring_task_id &&
                      t.task_date >= todayISO &&
                      !t.completed
                    )
                )
              );

              const { error } = await localTaskService.endRecurringSeries(
                task.recurring_task_id!
              );
              if (error) {
                await loadTasks();
                Alert.alert('Error ending recurring series', error);
              } else {
                loadTasks();
              }
            },
          },
          {
            text: 'Delete entire series',
            style: 'destructive',
            onPress: async () => {
              // Immediately update local React state: remove future uncompleted occurrences of this series
              setTasks((prev) =>
                prev.filter(
                  (t) =>
                    !(
                      t.recurring_task_id === task.recurring_task_id &&
                      t.task_date >= todayISO &&
                      !t.completed
                    )
                )
              );

              const { error } = await localTaskService.deleteRecurringTask(
                task.recurring_task_id!
              );
              if (error) {
                await loadTasks();
                Alert.alert('Error deleting recurring series', error);
              } else {
                loadTasks();
              }
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }

    // Normal one-time task deletion
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Immediately update local React state: disappears instantly
            setTasks((prev) => prev.filter((t) => t.id !== task.id));

            const { error } = await localTaskService.deleteTask(task.id);
            if (error) {
              await loadTasks();
              Alert.alert('Error deleting task', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleBulkDelete = () => {
    if (selectedTaskIds.size === 0) return;

    const selectedTasks = tasks.filter((t) => selectedTaskIds.has(t.id));
    const recurringCount = selectedTasks.filter((t) => Boolean(t.recurring_task_id)).length;

    const titleText = `Delete ${selectedTasks.length} task${selectedTasks.length > 1 ? 's' : ''}?`;
    const messageText =
      recurringCount > 0
        ? `Delete ${selectedTasks.length} selected tasks?\n\nRecurring occurrences will be deleted only for their selected dates. Their recurring series will continue.`
        : `Are you sure you want to delete ${selectedTasks.length} selected task${selectedTasks.length > 1 ? 's' : ''}? This action cannot be undone.`;

    Alert.alert(
      titleText,
      messageText,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const toDeleteIds = Array.from(selectedTaskIds);
            // Immediately update local state
            setTasks((curr) => curr.filter((t) => !selectedTaskIds.has(t.id)));
            exitSelectionMode();

            try {
              const { error } = await localTaskService.deleteMultipleTasks(selectedTasks);
              if (error) {
                await loadTasks();
                Alert.alert('Error deleting tasks', error);
              }
            } catch (err) {
              console.warn('[TasksScreen] Bulk delete error:', err);
              await loadTasks();
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const openNewTaskModal = () => {
    setEditingTask(null);
    setModalVisible(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setModalVisible(true);
  };

  // Grouping tasks using live local device clock
  // 1. Expired: Incomplete tasks where date < today OR (date == today AND time <= current time)
  const expiredTasks = tasks.filter((t) =>
    isTaskExpired(t.task_date, t.task_time, t.completed, currentTime)
  );

  // 2. Today Active: Incomplete tasks for today that have not expired yet
  const todayActiveTasks = tasks.filter(
    (t) =>
      isToday(t.task_date) &&
      !t.completed &&
      !isTaskExpired(t.task_date, t.task_time, t.completed, currentTime)
  );

  // 3. Today Completed: Completed tasks scheduled for today
  const todayCompletedTasks = tasks.filter((t) => isToday(t.task_date) && t.completed);

  // 4. Upcoming: Incomplete future tasks (task_date > today)
  const upcomingTasks = tasks.filter(
    (t) =>
      isUpcoming(t.task_date) &&
      !t.completed &&
      !isTaskExpired(t.task_date, t.task_time, t.completed, currentTime)
  );

  // 5. All Completed: Entire completed task history
  const allCompletedTasks = tasks.filter((t) => t.completed);

  const getTabCount = (tabId: TaskTab): number => {
    switch (tabId) {
      case 'today':
        return todayActiveTasks.length;
      case 'today_completed':
        return todayCompletedTasks.length;
      case 'upcoming':
        return upcomingTasks.length;
      case 'expired':
        return expiredTasks.length;
      case 'all_completed':
        return allCompletedTasks.length;
    }
  };

  const getVisibleTasksForActiveTab = (): Task[] => {
    switch (activeTab) {
      case 'today':
        return todayActiveTasks;
      case 'today_completed':
        return todayCompletedTasks;
      case 'upcoming':
        return upcomingTasks;
      case 'expired':
        return expiredTasks;
      case 'all_completed':
        return allCompletedTasks;
    }
  };

  const visibleTasks = getVisibleTasksForActiveTab();
  const isAllSelectedInTab =
    visibleTasks.length > 0 && visibleTasks.every((t) => selectedTaskIds.has(t.id));

  const handleSelectAllToggle = () => {
    if (isAllSelectedInTab) {
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        visibleTasks.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        visibleTasks.forEach((t) => next.add(t.id));
        return next;
      });
    }
  };

  return (
    <ScreenContainer headerSubtitle="Tasks & Responsibilities">
      {/* Top Bar or Selection Action Bar */}
      {isSelectionMode ? (
        <View style={styles.selectionBar}>
          <View style={styles.selectionBarLeft}>
            <Text style={styles.selectionCountText}>
              {selectedTaskIds.size} selected
            </Text>
            <TouchableOpacity onPress={handleSelectAllToggle} style={styles.selectAllButton}>
              <Text style={styles.selectAllText}>
                {isAllSelectedInTab ? 'Deselect' : 'Select All'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.selectionBarRight}>
            <TouchableOpacity
              style={[
                styles.deleteSelectedButton,
                selectedTaskIds.size === 0 && styles.deleteSelectedButtonDisabled,
              ]}
              disabled={selectedTaskIds.size === 0}
              onPress={handleBulkDelete}
            >
              <Ionicons name="trash" size={16} color="#FFFFFF" />
              <Text style={styles.deleteSelectedText}>Delete</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelSelectionButton} onPress={exitSelectionMode}>
              <Text style={styles.cancelSelectionText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.topBar}>
          <View style={styles.topBarText}>
            <Text style={styles.topHeading}>My Tasks</Text>
            <Text style={styles.topSubheading}>
              {todayActiveTasks.length} active for today
            </Text>
          </View>

          <View style={styles.topBarActions}>
            <TouchableOpacity
              style={styles.selectModeButton}
              onPress={() => setIsSelectionMode(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.selectModeButtonText}>Select</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addButton}
              onPress={openNewTaskModal}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Horizontal Tabs Switcher */}
      <View style={styles.tabsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsScrollContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = getTabCount(tab.id);
            const isExpiredTab = tab.id === 'expired';
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabChip,
                  isActive && styles.tabChipActive,
                  isExpiredTab && count > 0 && !isActive && styles.tabChipExpiredNotice,
                ]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={
                    isActive
                      ? '#FFFFFF'
                      : isExpiredTab && count > 0
                      ? '#F87171'
                      : theme.colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.tabChipText,
                    isActive && styles.tabChipTextActive,
                    isExpiredTab && count > 0 && !isActive && styles.tabChipTextExpired,
                  ]}
                >
                  {tab.label}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    isActive && styles.tabBadgeActive,
                    isExpiredTab && count > 0 && !isActive && styles.tabBadgeExpired,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabBadgeText,
                      isActive && styles.tabBadgeTextActive,
                      isExpiredTab && count > 0 && !isActive && styles.tabBadgeTextExpired,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Error Banner */}
      {errorMessage && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={loadTasks} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primaryLight}
              colors={[theme.colors.primary]}
            />
          }
        >
          {/* TAB 1: TODAY (Active tasks scheduled for today) */}
          {activeTab === 'today' && (
            <View style={styles.sectionContainer}>
              {todayActiveTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={theme.colors.success} />
                  <Text style={styles.emptyText}>All clear for today!</Text>
                  <Text style={styles.emptySubtext}>
                    {expiredTasks.length > 0
                      ? 'You have missed tasks in the Expired tab.'
                      : 'Tap "+ Add Task" to schedule a task.'}
                  </Text>
                </View>
              ) : (
                todayActiveTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpired={false}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TAB 2: TODAY COMPLETED */}
          {activeTab === 'today_completed' && (
            <View style={styles.sectionContainer}>
              {todayCompletedTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="time-outline" size={36} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>No completed tasks today</Text>
                  <Text style={styles.emptySubtext}>Finish today's tasks to track your daily progress.</Text>
                </View>
              ) : (
                todayCompletedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpired={false}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TAB 3: UPCOMING */}
          {activeTab === 'upcoming' && (
            <View style={styles.sectionContainer}>
              {upcomingTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={36} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>No upcoming tasks</Text>
                  <Text style={styles.emptySubtext}>Future tasks and recurring occurrences appear here.</Text>
                </View>
              ) : (
                upcomingTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpired={false}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TAB 4: EXPIRED (Incomplete tasks whose date or time has passed) */}
          {activeTab === 'expired' && (
            <View style={styles.sectionContainer}>
              {expiredTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-done-circle-outline" size={36} color={theme.colors.success} />
                  <Text style={styles.emptyText}>No expired tasks!</Text>
                  <Text style={styles.emptySubtext}>
                    Great job! You haven't missed any scheduled tasks.
                  </Text>
                </View>
              ) : (
                expiredTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpired={true}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TAB 5: ALL COMPLETED TASK */}
          {activeTab === 'all_completed' && (
            <View style={styles.sectionContainer}>
              {allCompletedTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-done-outline" size={36} color={theme.colors.textMuted} />
                  <Text style={styles.emptyText}>No completed tasks yet</Text>
                  <Text style={styles.emptySubtext}>Completed task history will appear here.</Text>
                </View>
              ) : (
                allCompletedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
                    isExpired={false}
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TOTAL EMPTY STATE */}
          {tasks.length === 0 && (
            <View style={styles.fullEmptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="checkbox-outline" size={48} color={theme.colors.primaryLight} />
              </View>
              <Text style={styles.fullEmptyTitle}>No Tasks Yet</Text>
              <Text style={styles.fullEmptyDesc}>
                Add tasks you want to remember (e.g., "Gym every day at 6:00 AM").
              </Text>
              <TouchableOpacity style={styles.emptyAddButton} onPress={openNewTaskModal}>
                <Text style={styles.emptyAddButtonText}>Create Your First Task</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* Add / Edit Task Modal */}
      <TaskModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingTask(null);
        }}
        onSave={handleCreateOrUpdate}
        initialTask={editingTask}
      />

      {/* WhatsApp-style Floating Action Button (FAB) */}
      {!isSelectionMode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={openNewTaskModal}
          activeOpacity={0.85}
          accessibilityLabel="Add Task"
          accessibilityRole="button"
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  topBarText: {
    flex: 1,
  },
  topHeading: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  topSubheading: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
  },
  selectModeButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: theme.typography.fontSizes.xs,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.typography.fontSizes.xs,
    marginLeft: 4,
  },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
  },
  selectionBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionCountText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  selectAllButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primaryLight,
  },
  selectionBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteSelectedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
    gap: 4,
  },
  deleteSelectedButtonDisabled: {
    opacity: 0.4,
  },
  deleteSelectedText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.typography.fontSizes.xs,
  },
  cancelSelectionButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  cancelSelectionText: {
    color: theme.colors.textSecondary,
    fontWeight: '600',
    fontSize: theme.typography.fontSizes.xs,
  },
  tabsContainer: {
    marginBottom: theme.spacing.md,
  },
  tabsScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
    paddingRight: theme.spacing.md,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryLight,
  },
  tabChipExpiredNotice: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  tabChipText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabChipTextExpired: {
    color: '#F87171',
    fontWeight: '600',
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabBadgeExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
  },
  tabBadgeTextExpired: {
    color: '#F87171',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: theme.spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.danger,
    marginLeft: theme.spacing.xs,
  },
  retryButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  retryText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.primaryLight,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: 110,
  },
  sectionContainer: {
    marginBottom: theme.spacing.lg,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  fullEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl * 2,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  fullEmptyTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  fullEmptyDesc: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  emptyAddButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
  },
  emptyAddButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.typography.fontSizes.sm,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    zIndex: 99,
  },
});
