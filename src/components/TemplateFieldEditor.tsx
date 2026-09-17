import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocumentFieldType, CreateTemplateFieldDTO } from '../types/documentTemplate';
import { documentTemplateService } from '../services/documentTemplateService';
import { theme } from '../constants/theme';

interface TemplateFieldEditorProps {
  index: number;
  field: CreateTemplateFieldDTO;
  totalFields: number;
  onChange: (updated: CreateTemplateFieldDTO) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

interface TypeOption {
  type: DocumentFieldType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FIELD_TYPE_OPTIONS: TypeOption[] = [
  { type: 'text', label: 'Text', icon: 'text-outline' },
  { type: 'number', label: 'Number', icon: 'calculator-outline' },
  { type: 'date', label: 'Date', icon: 'calendar-outline' },
  { type: 'multiline', label: 'Multiline Text', icon: 'reorder-four-outline' },
  { type: 'phone', label: 'Phone', icon: 'call-outline' },
  { type: 'email', label: 'Email', icon: 'mail-outline' },
  { type: 'boolean', label: 'Yes / No', icon: 'toggle-outline' },
];

export const TemplateFieldEditor: React.FC<TemplateFieldEditorProps> = ({
  index,
  field,
  totalFields,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}) => {
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  const handleLabelChange = (text: string) => {
    // If user hasn't explicitly customized field_key, auto-generate it from label
    const autoKey = documentTemplateService.generateFieldKey(text);
    onChange({
      ...field,
      field_label: text,
      field_key: autoKey,
    });
  };

  const currentTypeOption =
    FIELD_TYPE_OPTIONS.find((t) => t.type === field.field_type) || FIELD_TYPE_OPTIONS[0];

  return (
    <View style={styles.container}>
      {/* Top Header Row with Index, Ordering and Delete */}
      <View style={styles.topRow}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>#{index + 1}</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.moveBtn, index === 0 && styles.disabledBtn]}
            onPress={onMoveUp}
            disabled={index === 0}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Move field up"
          >
            <Ionicons
              name="chevron-up"
              size={18}
              color={index === 0 ? theme.colors.borderLight : theme.colors.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.moveBtn, index === totalFields - 1 && styles.disabledBtn]}
            onPress={onMoveDown}
            disabled={index === totalFields - 1}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityLabel="Move field down"
          >
            <Ionicons
              name="chevron-down"
              size={18}
              color={index === totalFields - 1 ? theme.colors.borderLight : theme.colors.textPrimary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Remove field"
          >
            <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Field Label Input */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Field Label <Text style={styles.requiredMark}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Student Name, Policy Number"
          placeholderTextColor={theme.colors.textMuted}
          value={field.field_label}
          onChangeText={handleLabelChange}
        />
        <Text style={styles.keyPreview}>
          Key: <Text style={styles.keyText}>{field.field_key || '—'}</Text>
        </Text>
      </View>

      {/* Field Type Selector Button */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Field Type</Text>
        <TouchableOpacity
          style={styles.typeSelector}
          onPress={() => setTypeModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={styles.typeLeft}>
            <Ionicons name={currentTypeOption.icon} size={18} color={theme.colors.primaryLight} />
            <Text style={styles.typeSelectorText}>{currentTypeOption.label}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Option Toggles Row: Required, Sensitive, Mask */}
      <View style={styles.togglesRow}>
        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Required</Text>
          <Switch
            value={Boolean(field.required)}
            onValueChange={(val) => onChange({ ...field, required: val })}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.primary }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Sensitive</Text>
          <Switch
            value={Boolean(field.sensitive)}
            onValueChange={(val) => {
              // If sensitive is enabled, default mask_enabled to true as well
              onChange({
                ...field,
                sensitive: val,
                mask_enabled: val ? true : field.mask_enabled,
              });
            }}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.warning }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={styles.toggleItem}>
          <Text style={styles.toggleLabel}>Mask</Text>
          <Switch
            value={Boolean(field.mask_enabled)}
            onValueChange={(val) => onChange({ ...field, mask_enabled: val })}
            trackColor={{ false: theme.colors.surfaceElevated, true: theme.colors.success }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      {/* Field Type Selection Modal */}
      <Modal
        visible={typeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTypeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTypeModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalHeading}>Select Field Type</Text>
            {FIELD_TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.type}
                style={[
                  styles.typeOptionRow,
                  field.field_type === opt.type && styles.typeOptionSelected,
                ]}
                onPress={() => {
                  onChange({ ...field, field_type: opt.type });
                  setTypeModalVisible(false);
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={
                    field.field_type === opt.type
                      ? theme.colors.primaryLight
                      : theme.colors.textSecondary
                  }
                />
                <Text
                  style={[
                    styles.typeOptionLabel,
                    field.field_type === opt.type && styles.typeOptionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                {field.field_type === opt.type && (
                  <Ionicons name="checkmark" size={18} color={theme.colors.primaryLight} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  indexBadge: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.sm,
  },
  indexText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.primaryLight,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moveBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  inputGroup: {
    marginBottom: theme.spacing.sm + 2,
  },
  label: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
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
  keyPreview: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  keyText: {
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  typeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 11,
  },
  typeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeSelectorText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textPrimary,
    marginLeft: 8,
    fontWeight: '500',
  },
  togglesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 13, 19, 0.5)',
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs + 2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: 4,
  },
  toggleItem: {
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalHeading: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  typeOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
  },
  typeOptionSelected: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
  },
  typeOptionLabel: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textPrimary,
    marginLeft: 12,
    flex: 1,
  },
  typeOptionLabelSelected: {
    fontWeight: '700',
    color: theme.colors.primaryLight,
  },
});
