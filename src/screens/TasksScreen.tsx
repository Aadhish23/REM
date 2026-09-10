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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { TaskItem } from '../components/TaskItem';
import { TaskModal, TaskModalSaveData } from '../components/TaskModal';
import { taskService } from '../services/taskService';
import { recurringTaskService } from '../services/recurringTaskService';
import { notificationService } from '../services/notificationService';
import { supabase } from '../services/supabase';
import { Task } from '../types/task';
import { isToday, isUpcoming, isPast } from '../utils/date';
import { theme } from '../constants/theme';

type TaskTab = 'today' | 'today_completed' | 'upcoming' | 'all_completed';

interface TabItem {
  id: TaskTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  { id: 'today', label: 'Today', icon: 'sunny-outline' },
  { id: 'today_completed', label: 'Today Completed', icon: 'checkmark-circle-outline' },
  { id: 'upcoming', label: 'Upcoming', icon: 'calendar-outline' },
  { id: 'all_completed', label: 'All Completed Task', icon: 'checkmark-done-outline' },
];

export const TasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskTab>('today');

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    setErrorMessage(null);

    // 1. Sync recurring occurrences for rolling 30-day window
    try {
      await recurringTaskService.syncOccurrences();
    } catch (syncErr) {
      console.warn('[TasksScreen] Sync occurrences non-blocking error:', syncErr);
    }

    // 2. Fetch all user tasks
    const { data, error } = await taskService.getTasks();
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
          const { error: recError } = await recurringTaskService.updateRecurringTask(
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
          await recurringTaskService.endRecurringSeries(data.recurring_task_id);
          await taskService.updateTask(editingTask.id, {
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
          await recurringTaskService.createRecurringTask({
            title: data.title,
            description: data.description,
            frequency: data.repeatType,
            week_days: data.week_days,
            task_time: data.task_time,
            start_date: data.task_date,
          });
          await taskService.deleteTask(editingTask.id);
          await loadTasks();
        } else {
          // Regular one-time task update
          const { data: updated, error, notificationWarning } = await taskService.updateTask(
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
        const { error: recError } = await recurringTaskService.createRecurringTask({
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
        const { data: created, error, notificationWarning } = await taskService.createTask(data);
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
    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t))
    );

    const { error } = await taskService.toggleTaskCompletion(task.id, task.completed);
    if (error) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: task.completed } : t))
      );
      Alert.alert('Error', error);
    }
  };

  const handleDelete = (task: Task) => {
    if (task.recurring_task_id) {
      Alert.alert(
        'Recurring Task Actions',
        `"${task.title}" repeats regularly. What would you like to do?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete this occurrence',
            onPress: async () => {
              const previousTasks = [...tasks];
              setTasks((prev) => prev.filter((t) => t.id !== task.id));

              const { error } = await recurringTaskService.deleteOccurrenceOnly(task);
              if (error) {
                setTasks(previousTasks);
                Alert.alert('Error deleting occurrence', error);
              }
            },
          },
          {
            text: 'End recurring series',
            onPress: async () => {
              const { error } = await recurringTaskService.endRecurringSeries(
                task.recurring_task_id!
              );
              if (error) {
                Alert.alert('Error ending recurring series', error);
              } else {
                await loadTasks();
              }
            },
          },
          {
            text: 'Delete entire series',
            style: 'destructive',
            onPress: async () => {
              const { error } = await recurringTaskService.deleteRecurringTask(
                task.recurring_task_id!
              );
              if (error) {
                Alert.alert('Error deleting recurring series', error);
              } else {
                await loadTasks();
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
            const previousTasks = [...tasks];
            setTasks((prev) => prev.filter((t) => t.id !== task.id));

            const { error } = await taskService.deleteTask(task.id);
            if (error) {
              setTasks(previousTasks);
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
            const prev = [...tasks];
            setTasks((curr) => curr.filter((t) => !selectedTaskIds.has(t.id)));
            exitSelectionMode();

            try {
              // 1. Cancel notifications
              await Promise.all(
                selectedTasks.map((t) => notificationService.cancelTaskNotification(t.id))
              );

              // 2. Add exceptions for recurring occurrences so they never return
              const recurringOccurrences = selectedTasks.filter((t) => Boolean(t.recurring_task_id));
              if (recurringOccurrences.length > 0) {
                await Promise.all(
                  recurringOccurrences.map((t) =>
                    recurringTaskService.addException(t.recurring_task_id!, t.task_date)
                  )
                );
              }

              // 3. Delete from database
              const { error } = await supabase.from('tasks').delete().in('id', toDeleteIds);
              if (error) {
                setTasks(prev);
                Alert.alert('Error deleting tasks', error.message);
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

  // Grouping tasks
  const todayPendingTasks = tasks.filter((t) => isToday(t.task_date) && !t.completed);
  const pastPendingTasks = tasks.filter((t) => isPast(t.task_date) && !t.completed);
  const todayCompletedTasks = tasks.filter((t) => isToday(t.task_date) && t.completed);
  const upcomingTasks = tasks.filter((t) => isUpcoming(t.task_date) && !t.completed);
  const allCompletedTasks = tasks.filter((t) => t.completed);

  const getTabCount = (tabId: TaskTab): number => {
    switch (tabId) {
      case 'today':
        return todayPendingTasks.length + pastPendingTasks.length;
      case 'today_completed':
        return todayCompletedTasks.length;
      case 'upcoming':
        return upcomingTasks.length;
      case 'all_completed':
        return allCompletedTasks.length;
    }
  };

  const getVisibleTasksForActiveTab = (): Task[] => {
    switch (activeTab) {
      case 'today':
        return [...pastPendingTasks, ...todayPendingTasks];
      case 'today_completed':
        return todayCompletedTasks;
      case 'upcoming':
        return upcomingTasks;
      case 'all_completed':
        return allCompletedTasks;
    }
  };

  const visibleTasks = getVisibleTasksForActiveTab();
  const isAllSelectedInTab =
    visibleTasks.length > 0 && visibleTasks.every((t) => selectedTaskIds.has(t.id));

  const handleSelectAllToggle = () => {
    if (isAllSelectedInTab) {
      // Deselect visible
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        visibleTasks.forEach((t) => next.delete(t.id));
        return next;
      });
    } else {
      // Select all visible
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
              {todayPendingTasks.length} pending for today
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
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tabChip, isActive && styles.tabChipActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={tab.icon}
                  size={15}
                  color={isActive ? '#FFFFFF' : theme.colors.textSecondary}
                />
                <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                  {tab.label}
                </Text>
                <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>
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
          {/* TAB 1: TODAY (Includes Overdue if any) */}
          {activeTab === 'today' && (
            <View style={styles.sectionContainer}>
              {pastPendingTasks.length > 0 && (
                <View style={styles.subSection}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleRow}>
                      <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
                      <Text style={[styles.sectionTitle, { color: theme.colors.danger }]}>
                        Overdue
                      </Text>
                    </View>
                    <View style={[styles.countBadge, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                      <Text style={[styles.countBadgeText, { color: theme.colors.danger }]}>
                        {pastPendingTasks.length}
                      </Text>
                    </View>
                  </View>
                  {pastPendingTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleComplete={handleToggleComplete}
                      onEdit={openEditTaskModal}
                      onDelete={handleDelete}
                      isSelectionMode={isSelectionMode}
                      isSelected={selectedTaskIds.has(task.id)}
                      onToggleSelect={handleToggleSelect}
                      onLongPress={handleLongPressTask}
                    />
                  ))}
                </View>
              )}

              {pastPendingTasks.length > 0 && todayPendingTasks.length > 0 && (
                <View style={[styles.sectionHeader, { marginTop: theme.spacing.sm }]}>
                  <View style={styles.sectionTitleRow}>
                    <Ionicons name="sunny" size={18} color={theme.colors.warning} />
                    <Text style={styles.sectionTitle}>Today's Pending</Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{todayPendingTasks.length}</Text>
                  </View>
                </View>
              )}

              {todayPendingTasks.length === 0 && pastPendingTasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={theme.colors.success} />
                  <Text style={styles.emptyText}>All clear for today!</Text>
                  <Text style={styles.emptySubtext}>Tap "+ Add Task" to schedule a task.</Text>
                </View>
              ) : (
                todayPendingTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onEdit={openEditTaskModal}
                    onDelete={handleDelete}
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedTaskIds.has(task.id)}
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
                    onToggleSelect={handleToggleSelect}
                    onLongPress={handleLongPressTask}
                  />
                ))
              )}
            </View>
          )}

          {/* TAB 4: ALL COMPLETED TASK */}
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
                Add tasks you want to remember (e.g., "Buy ice cream for mom today at 6:00 PM").
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
  tabChipText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  tabChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  tabBadgeTextActive: {
    color: '#FFFFFF',
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
    paddingBottom: theme.spacing.xl + 20,
  },
  subSection: {
    marginBottom: theme.spacing.md,
  },
  sectionContainer: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs + 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  countBadge: {
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  countBadgeText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontWeight: '700',
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
});
