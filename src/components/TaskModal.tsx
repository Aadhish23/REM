import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Task, RecurrenceFrequency, RecurringTask } from '../types/task';
import {
  getTodayISO,
  getTomorrowISO,
  formatDateToISO,
  formatDateDisplay,
  formatTimeDisplay,
  WEEKDAY_SHORT,
  getDayOfWeekFromISO,
  isTimePastToday,
} from '../utils/date';
import { recurringTaskService } from '../services/recurringTaskService';
import { theme } from '../constants/theme';

export interface TaskModalSaveData {
  title: string;
  description: string;
  task_date: string;
  task_time: string | null;
  repeatType: 'none' | 'daily' | 'weekly';
  daysPerWeek?: number;
  week_days?: number[] | null;
  recurring_task_id?: string | null;
}

interface TaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: TaskModalSaveData) => Promise<boolean>;
  initialTask?: Task | null;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  visible,
  onClose,
  onSave,
  initialTask,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayISO());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [repeatType, setRepeatType] = useState<'none' | 'daily' | 'weekly'>('none');
  const [daysPerWeek, setDaysPerWeek] = useState<number>(1);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeData = async () => {
      setValidationError(null);

      if (initialTask) {
        setTitle(initialTask.title);
        setDescription(initialTask.description || '');
        setSelectedDate(initialTask.task_date);
        setSelectedTime(initialTask.task_time || null);

        if (initialTask.recurring_task_id) {
          setLoadingRecurring(true);
          try {
            const { data: recData } = await recurringTaskService.getRecurringTaskById(
              initialTask.recurring_task_id
            );
            if (isMounted && recData) {
              setRepeatType(recData.frequency);
              const days =
                recData.week_days && recData.week_days.length > 0
                  ? recData.week_days
                  : recData.week_day !== null && recData.week_day !== undefined
                  ? [recData.week_day]
                  : [getDayOfWeekFromISO(initialTask.task_date)];

              setSelectedWeekdays(days);
              setDaysPerWeek(days.length);
              setSelectedDate(recData.start_date || initialTask.task_date);
              setSelectedTime(recData.task_time || initialTask.task_time || null);
            }
          } catch (e) {
            console.warn('[TaskModal] Error fetching recurring task:', e);
          } finally {
            if (isMounted) setLoadingRecurring(false);
          }
        } else {
          setRepeatType('none');
          setDaysPerWeek(1);
          setSelectedWeekdays([getDayOfWeekFromISO(initialTask.task_date)]);
        }
      } else {
        setTitle('');
        setDescription('');
        const today = getTodayISO();
        setSelectedDate(today);
        setSelectedTime(null);
        setRepeatType('none');
        setDaysPerWeek(1);
        setSelectedWeekdays([getDayOfWeekFromISO(today)]);
      }
    };

    if (visible) {
      initializeData();
    }

    return () => {
      isMounted = false;
    };
  }, [initialTask, visible]);

  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (event.type === 'set' && date) {
      const newDateStr = formatDateToISO(date);
      setSelectedDate(newDateStr);

      // If switched to today and the current selected time is already in the past, clear it and warn
      if (newDateStr === todayISO && selectedTime && repeatType === 'none' && isTimePastToday(selectedTime)) {
        setSelectedTime(null);
        setValidationError('Time was cleared because it has already passed for today.');
      } else {
        setValidationError(null);
      }
    }
  };

  const handleTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    setShowTimePicker(false);
    if (event.type === 'set' && date) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}:00`;

      // If scheduled for today and one-time, block past time
      if (selectedDate === todayISO && repeatType === 'none' && isTimePastToday(timeStr)) {
        setValidationError('Please choose a future time for today.');
        return;
      }

      setValidationError(null);
      setSelectedTime(timeStr);
    }
  };

  const handleDaysPerWeekChange = (newCount: number) => {
    if (newCount < 1 || newCount > 7) return;
    setValidationError(null);
    setDaysPerWeek(newCount);

    if (newCount === 7) {
      // Auto-select all 7 days
      setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6]);
    } else if (selectedWeekdays.length > newCount) {
      // Trim excess
      setSelectedWeekdays((prev) => prev.slice(0, newCount));
    }
  };

  const toggleWeekday = (dayIdx: number) => {
    setValidationError(null);
    if (selectedWeekdays.includes(dayIdx)) {
      if (selectedWeekdays.length > 1) {
        setSelectedWeekdays((prev) => prev.filter((d) => d !== dayIdx));
      }
    } else {
      if (selectedWeekdays.length < daysPerWeek) {
        setSelectedWeekdays((prev) => [...prev, dayIdx].sort((a, b) => a - b));
      } else if (daysPerWeek === 1) {
        setSelectedWeekdays([dayIdx]);
      } else {
        // Swap earliest selection with the new choice
        const next = [...selectedWeekdays.slice(1), dayIdx].sort((a, b) => a - b);
        setSelectedWeekdays(next);
      }
    }
  };

  const handleSave = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setValidationError('Please enter a task title.');
      return;
    }

    // Time validation for Today (one-time task)
    if (selectedDate === todayISO && selectedTime && repeatType === 'none' && isTimePastToday(selectedTime)) {
      setValidationError('Please choose a future time for today.');
      return;
    }

    if (repeatType === 'weekly') {
      if (selectedWeekdays.length !== daysPerWeek) {
        setValidationError(
          `Please select exactly ${daysPerWeek} weekday${daysPerWeek > 1 ? 's' : ''} (currently selected: ${selectedWeekdays.length}).`
        );
        return;
      }
    }

    setSaving(true);
    setValidationError(null);

    const success = await onSave({
      title: cleanTitle,
      description: description.trim(),
      task_date: selectedDate,
      task_time: selectedTime,
      repeatType,
      daysPerWeek: repeatType === 'weekly' ? daysPerWeek : undefined,
      week_days: repeatType === 'weekly' ? selectedWeekdays : null,
      recurring_task_id: initialTask?.recurring_task_id || null,
    });

    setSaving(false);

    if (success) {
      onClose();
    }
  };

  const isEditing = Boolean(initialTask);
  const isRecurringTask = Boolean(initialTask?.recurring_task_id);
  const todayISO = getTodayISO();
  const tomorrowISO = getTomorrowISO();

  const is9AMPastToday = selectedDate === todayISO && repeatType === 'none' && isTimePastToday('09:00:00');
  const is6PMPastToday = selectedDate === todayISO && repeatType === 'none' && isTimePastToday('18:00:00');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {isRecurringTask
                ? 'Edit Recurring Task'
                : isEditing
                ? 'Edit Task'
                : 'New Task'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {/* Recurring Task Occurrence Banner */}
            {isRecurringTask && (
              <View style={styles.recurringBanner}>
                <Ionicons name="repeat-outline" size={16} color="#34D399" />
                <Text style={styles.recurringBannerText}>
                  This task belongs to a recurring series. Changes will update the schedule.
                </Text>
              </View>
            )}

            {/* Loading Indicator for Recurring Data */}
            {loadingRecurring && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={theme.colors.primaryLight} />
                <Text style={styles.loadingText}>Loading recurrence details...</Text>
              </View>
            )}

            {/* Validation Error Banner */}
            {validationError && (
              <View style={styles.errorBanner}>
                <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
                <Text style={styles.errorText}>{validationError}</Text>
              </View>
            )}

            {/* Title Input */}
            <Text style={styles.label}>Task Title *</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="e.g., Gym / Buy ice cream"
              placeholderTextColor={theme.colors.textMuted}
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                if (validationError) setValidationError(null);
              }}
              autoCapitalize="sentences"
              editable={!saving}
              autoFocus={!isEditing}
            />

            {/* Description Input */}
            <Text style={[styles.label, styles.mt12]}>Description (Optional)</Text>
            <TextInput
              style={styles.descInput}
              placeholder="Add details, instructions, or notes..."
              placeholderTextColor={theme.colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!saving}
            />

            {/* Date Selection / Start Date */}
            <Text style={[styles.label, styles.mt16]}>
              {repeatType !== 'none' ? 'Start Date' : 'Date'}
            </Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, selectedDate === todayISO && styles.chipActive]}
                onPress={() => setSelectedDate(todayISO)}
              >
                <Text style={[styles.chipText, selectedDate === todayISO && styles.chipTextActive]}>
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, selectedDate === tomorrowISO && styles.chipActive]}
                onPress={() => setSelectedDate(tomorrowISO)}
              >
                <Text style={[styles.chipText, selectedDate === tomorrowISO && styles.chipTextActive]}>
                  Tomorrow
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  selectedDate !== todayISO && selectedDate !== tomorrowISO && styles.chipActive,
                ]}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={
                    selectedDate !== todayISO && selectedDate !== tomorrowISO
                      ? '#FFFFFF'
                      : theme.colors.textSecondary
                  }
                  style={styles.chipIcon}
                />
                <Text
                  style={[
                    styles.chipText,
                    selectedDate !== todayISO && selectedDate !== tomorrowISO && styles.chipTextActive,
                  ]}
                >
                  {selectedDate !== todayISO && selectedDate !== tomorrowISO
                    ? formatDateDisplay(selectedDate)
                    : 'Pick Date'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Time Selection */}
            <Text style={[styles.label, styles.mt16]}>Time (Optional)</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, selectedTime === null && styles.chipActive]}
                onPress={() => {
                  setValidationError(null);
                  setSelectedTime(null);
                }}
              >
                <Text style={[styles.chipText, selectedTime === null && styles.chipTextActive]}>
                  No Time
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  selectedTime === '09:00:00' && styles.chipActive,
                  is9AMPastToday && styles.chipDisabled,
                ]}
                onPress={() => {
                  if (is9AMPastToday) {
                    setValidationError('9:00 AM has already passed today.');
                    return;
                  }
                  setValidationError(null);
                  setSelectedTime('09:00:00');
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedTime === '09:00:00' && styles.chipTextActive,
                    is9AMPastToday && styles.chipTextDisabled,
                  ]}
                >
                  9:00 AM
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  selectedTime === '18:00:00' && styles.chipActive,
                  is6PMPastToday && styles.chipDisabled,
                ]}
                onPress={() => {
                  if (is6PMPastToday) {
                    setValidationError('6:00 PM has already passed today.');
                    return;
                  }
                  setValidationError(null);
                  setSelectedTime('18:00:00');
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selectedTime === '18:00:00' && styles.chipTextActive,
                    is6PMPastToday && styles.chipTextDisabled,
                  ]}
                >
                  6:00 PM
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.chip,
                  selectedTime !== null &&
                    selectedTime !== '09:00:00' &&
                    selectedTime !== '18:00:00' &&
                    styles.chipActive,
                ]}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={
                    selectedTime !== null &&
                    selectedTime !== '09:00:00' &&
                    selectedTime !== '18:00:00'
                      ? '#FFFFFF'
                      : theme.colors.textSecondary
                  }
                  style={styles.chipIcon}
                />
                <Text
                  style={[
                    styles.chipText,
                    selectedTime !== null &&
                      selectedTime !== '09:00:00' &&
                      selectedTime !== '18:00:00' &&
                      styles.chipTextActive,
                  ]}
                >
                  {selectedTime !== null &&
                  selectedTime !== '09:00:00' &&
                  selectedTime !== '18:00:00'
                    ? formatTimeDisplay(selectedTime)
                    : 'Pick Time'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Repeat Options — ALWAYS EXPOSED FOR NEW AND EDITING TASKS */}
            <Text style={[styles.label, styles.mt16]}>Repeat</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, repeatType === 'none' && styles.chipActive]}
                onPress={() => setRepeatType('none')}
              >
                <Text style={[styles.chipText, repeatType === 'none' && styles.chipTextActive]}>
                  None
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, repeatType === 'daily' && styles.chipActive]}
                onPress={() => setRepeatType('daily')}
              >
                <Ionicons
                  name="repeat-outline"
                  size={14}
                  color={repeatType === 'daily' ? '#FFFFFF' : theme.colors.textSecondary}
                  style={styles.chipIcon}
                />
                <Text style={[styles.chipText, repeatType === 'daily' && styles.chipTextActive]}>
                  Every day
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, repeatType === 'weekly' && styles.chipActive]}
                onPress={() => setRepeatType('weekly')}
              >
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={repeatType === 'weekly' ? '#FFFFFF' : theme.colors.textSecondary}
                  style={styles.chipIcon}
                />
                <Text style={[styles.chipText, repeatType === 'weekly' && styles.chipTextActive]}>
                  Every week
                </Text>
              </TouchableOpacity>
            </View>

            {/* Weekday Selector with Stepper for Weekly Repeat */}
            {repeatType === 'weekly' && (
              <View style={styles.weekdayContainer}>
                {/* Stepper: Days per week: [-] 1..7 [+] */}
                <View style={styles.stepperRow}>
                  <Text style={styles.subLabel}>Days per week</Text>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity
                      style={[styles.stepperButton, daysPerWeek <= 1 && styles.stepperButtonDisabled]}
                      disabled={daysPerWeek <= 1}
                      onPress={() => handleDaysPerWeekChange(daysPerWeek - 1)}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={daysPerWeek <= 1 ? theme.colors.textMuted : theme.colors.textPrimary}
                      />
                    </TouchableOpacity>

                    <View style={styles.stepperValueContainer}>
                      <Text style={styles.stepperValueText}>{daysPerWeek}</Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.stepperButton, daysPerWeek >= 7 && styles.stepperButtonDisabled]}
                      disabled={daysPerWeek >= 7}
                      onPress={() => handleDaysPerWeekChange(daysPerWeek + 1)}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={daysPerWeek >= 7 ? theme.colors.textMuted : theme.colors.textPrimary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Weekday Chips */}
                <View style={styles.weekdayHeaderRow}>
                  <Text style={styles.subLabel}>Selected days</Text>
                  <Text style={styles.weekdayCountBadge}>
                    {selectedWeekdays.length} of {daysPerWeek} selected
                  </Text>
                </View>

                <View style={styles.weekdayRow}>
                  {WEEKDAY_SHORT.map((dayName, idx) => {
                    const isSelected = selectedWeekdays.includes(idx);
                    return (
                      <TouchableOpacity
                        key={dayName}
                        style={[styles.weekdayChip, isSelected && styles.weekdayChipActive]}
                        onPress={() => toggleWeekday(idx)}
                      >
                        <Text
                          style={[
                            styles.weekdayChipText,
                            isSelected && styles.weekdayChipTextActive,
                          ]}
                        >
                          {dayName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Native Date Picker */}
            {showDatePicker && (
              <DateTimePicker
                value={new Date(selectedDate)}
                mode="date"
                display="default"
                onChange={handleDateChange}
              />
            )}

            {/* Native Time Picker */}
            {showTimePicker && (
              <DateTimePicker
                value={new Date()}
                mode="time"
                is24Hour={false}
                display="default"
                onChange={handleTimeChange}
              />
            )}

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {isRecurringTask
                    ? 'Save Recurring Schedule'
                    : isEditing
                    ? 'Save Changes'
                    : 'Create Task'}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  closeButton: {
    padding: theme.spacing.xs,
  },
  sheetContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl + 20,
  },
  label: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mt12: {
    marginTop: 12,
  },
  mt16: {
    marginTop: 16,
  },
  titleInput: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  descInput: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 70,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryLight,
  },
  chipIcon: {
    marginRight: 4,
  },
  chipText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  chipDisabled: {
    opacity: 0.35,
  },
  chipTextDisabled: {
    color: theme.colors.textMuted,
    textDecorationLine: 'line-through',
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
  },
  recurringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    marginBottom: theme.spacing.md,
  },
  recurringBannerText: {
    fontSize: theme.typography.fontSizes.sm,
    color: '#34D399',
    marginLeft: theme.spacing.xs,
    fontWeight: '500',
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: 8,
  },
  loadingText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  weekdayContainer: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  stepperButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonDisabled: {
    opacity: 0.3,
  },
  stepperValueContainer: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  weekdayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  weekdayCountBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.primaryLight,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  weekdayChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryLight,
  },
  weekdayChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  weekdayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
});
