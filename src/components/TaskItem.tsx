import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../types/task';
import { formatTimeDisplay, formatDateDisplay, isToday } from '../utils/date';
import { theme } from '../constants/theme';

interface TaskItemProps {
  task: Task;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  isExpired?: boolean;
  onToggleSelect?: (task: Task) => void;
  onLongPress?: (task: Task) => void;
}

export const TaskItem: React.FC<TaskItemProps> = ({
  task,
  onToggleComplete,
  onEdit,
  onDelete,
  isSelectionMode = false,
  isSelected = false,
  isExpired = false,
  onToggleSelect,
  onLongPress,
}) => {
  const isTaskToday = isToday(task.task_date);
  const formattedTime = formatTimeDisplay(task.task_time);
  const formattedDate = formatDateDisplay(task.task_date);

  const handleCardPress = () => {
    if (isSelectionMode) {
      onToggleSelect?.(task);
    } else {
      onEdit(task);
    }
  };

  const handleCheckboxPress = () => {
    if (isSelectionMode) {
      onToggleSelect?.(task);
    } else {
      onToggleComplete(task);
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        task.completed && styles.cardCompleted,
        isSelected && styles.cardSelected,
        isExpired && !task.completed && styles.cardExpired,
      ]}
      onPress={handleCardPress}
      onLongPress={() => onLongPress?.(task)}
      activeOpacity={0.75}
    >
      {/* Checkbox / Selection Toggle */}
      <TouchableOpacity
        style={styles.checkboxTouch}
        onPress={handleCheckboxPress}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        {isSelectionMode ? (
          <Ionicons
            name={isSelected ? 'checkbox' : 'square-outline'}
            size={24}
            color={isSelected ? theme.colors.primaryLight : theme.colors.textMuted}
          />
        ) : (
          <Ionicons
            name={task.completed ? 'checkbox' : 'square-outline'}
            size={24}
            color={task.completed ? theme.colors.success : theme.colors.textMuted}
          />
        )}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.contentContainer}>
        <Text
          style={[
            styles.title,
            !isSelectionMode && task.completed && styles.titleCompleted,
            isExpired && !task.completed && styles.titleExpired,
          ]}
          numberOfLines={2}
        >
          {task.title}
        </Text>

        {Boolean(task.description) && (
          <Text
            style={[
              styles.description,
              !isSelectionMode && task.completed && styles.descriptionCompleted,
            ]}
            numberOfLines={2}
          >
            {task.description}
          </Text>
        )}

        {/* Metadata badges: Date, Time, Recurring, and Expired */}
        <View style={styles.metaRow}>
          {isExpired && !task.completed && (
            <View style={[styles.badge, styles.expiredBadge]}>
              <Ionicons name="alert-circle" size={12} color="#F87171" />
              <Text style={[styles.badgeText, styles.expiredBadgeText]}>Expired</Text>
            </View>
          )}

          {Boolean(task.recurring_task_id) && (
            <View style={[styles.badge, styles.recurringBadge]}>
              <Ionicons name="repeat-outline" size={12} color="#34D399" />
              <Text style={[styles.badgeText, styles.recurringBadgeText]}>Recurring</Text>
            </View>
          )}

          {!isTaskToday && (
            <View style={styles.badge}>
              <Ionicons name="calendar-outline" size={12} color={theme.colors.textSecondary} />
              <Text style={styles.badgeText}>{formattedDate}</Text>
            </View>
          )}

          {Boolean(formattedTime) && (
            <View style={[styles.badge, styles.timeBadge]}>
              <Ionicons name="time-outline" size={12} color={theme.colors.primaryLight} />
              <Text style={[styles.badgeText, styles.timeBadgeText]}>{formattedTime}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Normal Actions: Edit + Delete (hidden during selection mode) */}
      {!isSelectionMode && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onEdit(task)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Ionicons name="pencil-outline" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onDelete(task)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardCompleted: {
    backgroundColor: 'rgba(19, 23, 34, 0.6)',
    borderColor: 'rgba(35, 42, 59, 0.5)',
  },
  cardSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderColor: theme.colors.primaryLight,
  },
  cardExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  titleExpired: {
    color: '#FCA5A5',
  },
  checkboxTouch: {
    marginRight: theme.spacing.sm,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    lineHeight: 22,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: theme.colors.textMuted,
  },
  description: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  descriptionCompleted: {
    color: 'rgba(100, 116, 139, 0.6)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs + 2,
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  timeBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderColor: 'rgba(99, 102, 241, 0.25)',
  },
  recurringBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  expiredBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  badgeText: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginLeft: 4,
    fontWeight: '500',
  },
  recurringBadgeText: {
    color: '#34D399',
  },
  timeBadgeText: {
    color: theme.colors.primaryLight,
  },
  expiredBadgeText: {
    color: '#F87171',
    fontWeight: '700',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: theme.spacing.xs,
    gap: 4,
  },
  actionButton: {
    padding: 6,
    borderRadius: theme.borderRadius.sm,
  },
});
