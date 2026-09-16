import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Note } from '../types/note';
import { formatRelativeTime } from '../utils/date';
import { theme } from '../constants/theme';

interface NoteCardProps {
  note: Note;
  onPress: (note: Note) => void;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
  onLongPress?: (note: Note) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onPress,
  onEdit,
  onDelete,
  onLongPress,
}) => {
  const relativeTime = formatRelativeTime(note.updated_at);
  const previewText = note.content ? note.content.trim() : '';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(note)}
      onLongPress={() => onLongPress?.(note)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Note: ${note.title}`}
    >
      {/* Top Header: Title on left, Edit & Delete direct action buttons on right */}
      <View style={styles.cardHeader}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {note.title}
        </Text>

        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onEdit(note)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={`Edit ${note.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="pencil-outline" size={17} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.deleteActionButton]}
            onPress={() => onDelete(note)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={`Delete ${note.title}`}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content Preview */}
      {previewText.length > 0 ? (
        <Text style={styles.contentPreview} numberOfLines={2} ellipsizeMode="tail">
          {previewText}
        </Text>
      ) : (
        <Text style={styles.emptyPreview}>No content</Text>
      )}

      {/* Footer: Timestamp and view hint */}
      <View style={styles.footer}>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={13} color={theme.colors.textSecondary} />
          <Text style={styles.timestampText}>
            {relativeTime ? `Updated ${relativeTime}` : 'Recently updated'}
          </Text>
        </View>

        <View style={styles.viewHint}>
          <Text style={styles.viewHintText}>View</Text>
          <Ionicons name="chevron-forward" size={13} color={theme.colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm + 2,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.sm,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButton: {
    padding: 6,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  contentPreview: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.sm,
  },
  emptyPreview: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    marginBottom: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestampText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  viewHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewHintText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textMuted,
  },
});
