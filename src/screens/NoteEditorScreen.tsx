import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NotesStackParamList } from '../types/note';
import { localNoteService } from '../services/localNoteService';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<NotesStackParamList, 'NoteEditor'>;

export const NoteEditorScreen: React.FC<Props> = ({ route, navigation }) => {
  const noteId = route.params?.noteId;
  const isEditing = Boolean(noteId);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [initialTitle, setInitialTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<TextInput>(null);

  useEffect(() => {
    let isMounted = true;

    if (noteId) {
      (async () => {
        setLoading(true);
        const { data, error } = await localNoteService.getNote(noteId);
        if (!isMounted) return;

        if (error || !data) {
          Alert.alert('Error', error || 'Could not load note.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          setTitle(data.title);
          setContent(data.content || '');
          setInitialTitle(data.title);
          setInitialContent(data.content || '');
        }
        setLoading(false);
      })();
    } else {
      // Focus title input on new note creation
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }

    return () => {
      isMounted = false;
    };
  }, [noteId, navigation]);

  const isDirty = title !== initialTitle || content !== initialContent;

  const handleCancel = () => {
    Keyboard.dismiss();
    if (isDirty) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Please enter a title.');
      titleInputRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      if (isEditing && noteId) {
        const { error } = await localNoteService.updateNote(noteId, {
          title: trimmedTitle,
          content,
        });

        if (error) {
          Alert.alert('Unable to Save', error);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await localNoteService.createNote({
          title: trimmedTitle,
          content,
        });

        if (error) {
          Alert.alert('Unable to Save', error);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      navigation.goBack();
    } catch (err) {
      console.warn('[NoteEditorScreen] Save error:', err);
      Alert.alert('Unable to Save', 'Unable to save note. Please try again.');
      setSaving(false);
    }
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleCancel}
          activeOpacity={0.7}
          disabled={saving}
          accessibilityLabel="Cancel editing"
        >
          <Ionicons name="close-outline" size={24} color={theme.colors.textSecondary} />
          <Text style={styles.headerButtonText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{isEditing ? 'Edit Note' : 'New Note'}</Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          activeOpacity={0.8}
          disabled={saving}
          accessibilityLabel="Save note"
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-sharp" size={18} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Save</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Title Input */}
          <TextInput
            ref={titleInputRef}
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="next"
            maxLength={200}
            autoCapitalize="sentences"
            selectionColor={theme.colors.primaryLight}
          />

          <View style={styles.divider} />

          {/* Content Multiline Input */}
          <TextInput
            style={styles.contentInput}
            value={content}
            onChangeText={setContent}
            placeholder="Start typing your note..."
            placeholderTextColor={theme.colors.textMuted}
            multiline={true}
            textAlignVertical="top"
            autoCapitalize="sentences"
            selectionColor={theme.colors.primaryLight}
            scrollEnabled={false}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 4,
  },
  headerButtonText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    gap: 4,
    minWidth: 74,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: theme.typography.fontSizes.sm,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: 40,
    flexGrow: 1,
  },
  titleInput: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    paddingVertical: 8,
    lineHeight: 28,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  contentInput: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textPrimary,
    lineHeight: 24,
    minHeight: 300,
    paddingVertical: 8,
  },
});
