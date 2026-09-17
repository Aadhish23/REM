import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocumentTemplate } from '../types/documentTemplate';
import { theme } from '../constants/theme';

interface TemplateCardProps {
  template: DocumentTemplate;
  onPress: (template: DocumentTemplate) => void;
  onEdit: (template: DocumentTemplate) => void;
  onDelete: (template: DocumentTemplate) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onPress,
  onEdit,
  onDelete,
}) => {
  const fields = template.fields || [];
  const fieldsCount = fields.length;
  const previewFields = fields
    .slice(0, 3)
    .map((f) => f.field_label)
    .join(' • ');

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(template)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`Template: ${template.name}`}
    >
      <View style={styles.header}>
        <View style={styles.titleInfo}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text-outline" size={18} color={theme.colors.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
              {template.name}
            </Text>
            {template.description ? (
              <Text style={styles.description} numberOfLines={1} ellipsizeMode="tail">
                {template.description}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onEdit(template)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={`Edit ${template.name}`}
            accessibilityRole="button"
          >
            <Ionicons name="pencil-outline" size={17} color={theme.colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => onDelete(template)}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityLabel={`Delete ${template.name}`}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={17} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.badge}>
          <Ionicons name="list-outline" size={13} color={theme.colors.primaryLight} />
          <Text style={styles.badgeText}>
            {fieldsCount} {fieldsCount === 1 ? 'field' : 'fields'}
          </Text>
        </View>

        {previewFields ? (
          <Text style={styles.fieldsPreview} numberOfLines={1} ellipsizeMode="tail">
            {previewFields}
            {fieldsCount > 3 ? ` +${fieldsCount - 3} more` : ''}
          </Text>
        ) : null}
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
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  titleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  description: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  deleteBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(35, 42, 59, 0.5)',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },
  badgeText: {
    fontSize: theme.typography.fontSizes.xs - 1,
    fontWeight: '600',
    color: theme.colors.primaryLight,
    marginLeft: 4,
  },
  fieldsPreview: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.xs - 1,
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
});
