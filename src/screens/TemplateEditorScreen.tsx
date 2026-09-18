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
import { VaultStackParamList } from '../types/document';
import { CreateTemplateFieldDTO } from '../types/documentTemplate';
import { localTemplateService } from '../services/localTemplateService';
import { TemplateFieldEditor } from '../components/TemplateFieldEditor';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<VaultStackParamList, 'TemplateEditor'>;

export const TemplateEditorScreen: React.FC<Props> = ({ route, navigation }) => {
  const { templateId } = route.params || {};
  const isEditing = Boolean(templateId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<CreateTemplateFieldDTO[]>([]);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Baseline state for dirty check
  const [initialBaseline, setInitialBaseline] = useState({
    name: '',
    description: '',
    fieldsCount: 0,
  });

  const nameInputRef = useRef<TextInput>(null);

  useEffect(() => {
    let isMounted = true;

    if (templateId) {
      (async () => {
        setLoading(true);
        const { data, error } = await localTemplateService.getTemplate(templateId);
        if (!isMounted) return;

        if (error || !data) {
          Alert.alert('Error', error || 'Could not load template.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          setName(data.name);
          setDescription(data.description || '');
          const loadedFields: CreateTemplateFieldDTO[] = (data.fields || []).map((f) => ({
            id: f.id,
            field_key: f.field_key,
            field_label: f.field_label,
            field_type: f.field_type,
            required: f.required,
            sensitive: f.sensitive,
            mask_enabled: f.mask_enabled,
            display_order: f.display_order,
          }));
          setFields(loadedFields);
          setInitialBaseline({
            name: data.name,
            description: data.description || '',
            fieldsCount: loadedFields.length,
          });
        }
        setLoading(false);
      })();
    } else {
      // Create mode: start with 2 sample starter fields
      const defaultFields: CreateTemplateFieldDTO[] = [
        {
          field_key: 'identifier_number',
          field_label: 'ID Number',
          field_type: 'text',
          required: true,
          sensitive: true,
          mask_enabled: true,
          display_order: 0,
        },
        {
          field_key: 'holder_name',
          field_label: 'Holder Name',
          field_type: 'text',
          required: true,
          sensitive: false,
          mask_enabled: false,
          display_order: 1,
        },
      ];
      setFields(defaultFields);
      setInitialBaseline({
        name: '',
        description: '',
        fieldsCount: 2,
      });
    }

    return () => {
      isMounted = false;
    };
  }, [templateId, navigation]);

  const isDirty =
    name !== initialBaseline.name ||
    description !== initialBaseline.description ||
    fields.length !== initialBaseline.fieldsCount;

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

  const handleAddField = () => {
    setValidationError(null);
    const newOrder = fields.length;
    const newField: CreateTemplateFieldDTO = {
      field_key: `field_${newOrder + 1}`,
      field_label: '',
      field_type: 'text',
      required: false,
      sensitive: false,
      mask_enabled: false,
      display_order: newOrder,
    };
    setFields([...fields, newField]);
  };

  const handleFieldChange = (index: number, updatedField: CreateTemplateFieldDTO) => {
    setValidationError(null);
    const newFields = [...fields];
    newFields[index] = updatedField;
    setFields(newFields);
  };

  const handleRemoveField = (index: number) => {
    if (fields.length <= 1) {
      Alert.alert('Cannot Remove', 'A template must have at least one field.');
      return;
    }
    const newFields = fields.filter((_, i) => i !== index);
    setFields(newFields);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newFields = [...fields];
    const temp = newFields[index - 1];
    newFields[index - 1] = newFields[index];
    newFields[index] = temp;
    setFields(newFields);
  };

  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1) return;
    const newFields = [...fields];
    const temp = newFields[index + 1];
    newFields[index + 1] = newFields[index];
    newFields[index] = temp;
    setFields(newFields);
  };

  const handleSave = async () => {
    Keyboard.dismiss();
    setValidationError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Please enter a template name.');
      nameInputRef.current?.focus();
      return;
    }

    if (fields.length === 0) {
      setValidationError('A template must have at least one field.');
      return;
    }

    // Validate fields
    const seenKeys = new Set<string>();
    const seenLabels = new Set<string>();

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const trimmedLabel = f.field_label.trim();
      if (!trimmedLabel) {
        setValidationError(`Field #${i + 1} has an empty label. Please enter a label.`);
        return;
      }

      const normalizedKey = f.field_key.trim().toLowerCase();
      if (seenKeys.has(normalizedKey) || seenLabels.has(trimmedLabel.toLowerCase())) {
        setValidationError(`Duplicate field "${trimmedLabel}". Each field in the template must be unique.`);
        return;
      }
      seenKeys.add(normalizedKey);
      seenLabels.add(trimmedLabel.toLowerCase());
    }

    setSaving(true);

    try {
      if (isEditing && templateId) {
        const { error } = await localTemplateService.updateTemplate(templateId, {
          name: trimmedName,
          description: description.trim() || undefined,
          fields,
        });

        if (error) {
          setSaving(false);
          Alert.alert('Unable to Save Template', error);
          return;
        }
      } else {
        const { error } = await localTemplateService.createTemplate({
          name: trimmedName,
          description: description.trim() || undefined,
          fields,
        });

        if (error) {
          setSaving(false);
          Alert.alert('Unable to Save Template', error);
          return;
        }
      }

      navigation.goBack();
    } catch {
      setSaving(false);
      Alert.alert('Unable to Save Template', 'An unexpected error occurred. Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading template...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={handleCancel}
          disabled={saving}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isEditing ? 'Edit Template' : 'Create Template'}
        </Text>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Validation Error Banner */}
          {validationError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
              <Text style={styles.errorBannerText}>{validationError}</Text>
            </View>
          )}

          {/* Template Info Card */}
          <View style={styles.card}>
            <Text style={styles.cardSectionLabel}>TEMPLATE DETAILS</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                Template Name <Text style={styles.requiredMark}>*</Text>
              </Text>
              <TextInput
                ref={nameInputRef}
                style={styles.input}
                placeholder="e.g. College ID, Passport, Bike Insurance"
                placeholderTextColor={theme.colors.textMuted}
                value={name}
                onChangeText={(val) => {
                  setName(val);
                  setValidationError(null);
                }}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description (Optional)</Text>
              <TextInput
                style={[styles.input, styles.descInput]}
                placeholder="Brief description of this document template"
                placeholderTextColor={theme.colors.textMuted}
                value={description}
                onChangeText={(val) => {
                  setDescription(val);
                  setValidationError(null);
                }}
                multiline
                numberOfLines={2}
              />
            </View>
          </View>

          {/* Fields Section Header */}
          <View style={styles.fieldsSectionHeader}>
            <View>
              <Text style={styles.fieldsHeading}>TEMPLATE FIELDS</Text>
              <Text style={styles.fieldsSubheading}>
                Define the dynamic inputs for documents created with this template.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.addFieldButton}
              onPress={handleAddField}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.addFieldButtonText}>Add Field</Text>
            </TouchableOpacity>
          </View>

          {/* Fields Editors List */}
          {fields.map((f, idx) => (
            <TemplateFieldEditor
              key={f.id || `field_${idx}`}
              index={idx}
              field={f}
              totalFields={fields.length}
              onChange={(updated) => handleFieldChange(idx, updated)}
              onRemove={() => handleRemoveField(idx)}
              onMoveUp={() => handleMoveUp(idx)}
              onMoveDown={() => handleMoveDown(idx)}
            />
          ))}

          {/* Bottom Add Field Button */}
          <TouchableOpacity
            style={styles.bottomAddBtn}
            onPress={handleAddField}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.primaryLight} />
            <Text style={styles.bottomAddBtnText}>Add Another Field</Text>
          </TouchableOpacity>
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
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.md + 1,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    minWidth: 64,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: theme.spacing.md,
    paddingBottom: 50,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: theme.spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs + 1,
    color: theme.colors.danger,
    marginLeft: 8,
    lineHeight: 18,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.lg,
  },
  cardSectionLabel: {
    fontSize: theme.typography.fontSizes.xs - 1,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.md,
  },
  formGroup: {
    marginBottom: theme.spacing.md,
  },
  label: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  requiredMark: {
    color: theme.colors.danger,
  },
  input: {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textPrimary,
  },
  descInput: {
    minHeight: 50,
    textAlignVertical: 'top',
  },
  fieldsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  fieldsHeading: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
  },
  fieldsSubheading: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  addFieldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  addFieldButtonText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 4,
  },
  bottomAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    borderStyle: 'dashed',
    marginTop: theme.spacing.xs,
  },
  bottomAddBtnText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.primaryLight,
    marginLeft: 6,
  },
});
