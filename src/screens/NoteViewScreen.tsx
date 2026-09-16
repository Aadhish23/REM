import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NotesStackParamList, Note } from '../types/note';
import { noteService } from '../services/noteService';
import { formatDateTimeDisplay, formatRelativeTime } from '../utils/date';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<NotesStackParamList, 'NoteView'>;

export const NoteViewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { noteId } = route.params;
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchNote = useCallback(async () => {
    const { data, error } = await noteService.getNote(noteId);
    if (error || !data) {
      Alert.alert('Note Unavailable', error || 'Could not load note.', [
        { text: 'Back', onPress: () => navigation.goBack() },
      ]);
    } else {
      setNote(data);
    }
    setLoading(false);
  }, [noteId, navigation]);

  useFocusEffect(
    useCallback(() => {
      fetchNote();
    }, [fetchNote])
  );

  const handleEdit = () => {
    if (!note) return;
    navigation.navigate('NoteEditor', { noteId: note.id });
  };

  const handleDelete = () => {
    if (!note) return;

    Alert.alert(
      'Delete note?',
      'This note will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await noteService.deleteNote(note.id);
            if (error) {
              setDeleting(false);
              Alert.alert('Unable to Delete', error);
            } else {
              navigation.goBack();
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading note...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!note) {
    return null;
  }

  const createdDisplay = formatDateTimeDisplay(note.created_at);
  const updatedDisplay = formatDateTimeDisplay(note.updated_at);
  const relativeUpdated = formatRelativeTime(note.updated_at);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
          accessibilityLabel="Back to notes"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEdit}
            activeOpacity={0.8}
            disabled={deleting}
            accessibilityLabel="Edit note"
          >
            <Ionicons name="pencil-outline" size={18} color="#FFFFFF" />
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            activeOpacity={0.8}
            disabled={deleting}
            accessibilityLabel="Delete note"
          >
            {deleting ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Scrollable Note Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Title */}
        <Text style={styles.title} selectable={true}>
          {note.title}
        </Text>

        {/* Timestamps Metadata Box */}
        <View style={styles.metaBox}>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.metaLabel}>Created:</Text>
            <Text style={styles.metaValue}>{createdDisplay}</Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
            <Text style={styles.metaLabel}>Updated:</Text>
            <Text style={styles.metaValue}>
              {updatedDisplay} {relativeUpdated ? `(${relativeUpdated})` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Full Content */}
        {note.content && note.content.trim().length > 0 ? (
          <Text style={styles.content} selectable={true}>
            {note.content}
          </Text>
        ) : (
          <Text style={styles.emptyContent}>No content in this note.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.sm,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  backButton: {
    padding: 6,
    borderRadius: theme.borderRadius.full,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    gap: 4,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.typography.fontSizes.xs,
  },
  deleteButton: {
    padding: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: 60,
  },
  title: {
    fontSize: theme.typography.fontSizes.xxl,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    lineHeight: 32,
    marginBottom: theme.spacing.md,
  },
  metaBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm + 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textMuted,
    minWidth: 54,
  },
  metaValue: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.lg,
  },
  content: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textPrimary,
    lineHeight: 26,
  },
  emptyContent: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: theme.spacing.md,
  },
});
