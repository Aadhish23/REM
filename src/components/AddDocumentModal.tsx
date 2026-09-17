import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DocumentType } from '../types/document';
import { DocumentTemplate } from '../types/documentTemplate';
import { theme } from '../constants/theme';

interface AddDocumentModalProps {
  visible: boolean;
  existingTypes: DocumentType[];
  customTemplates: DocumentTemplate[];
  onClose: () => void;
  onSelectType: (type: DocumentType) => void;
  onSelectCustomTemplate: (template: DocumentTemplate) => void;
  onEditExisting: (type: DocumentType) => void;
  onCreateTemplate: () => void;
  onManageTemplates: () => void;
}

interface BuiltinOption {
  type: DocumentType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const BUILTIN_OPTIONS: BuiltinOption[] = [
  {
    type: 'aadhaar',
    title: 'Aadhaar',
    subtitle: '12-digit Unique Identification Number',
    icon: 'finger-print-outline',
  },
  {
    type: 'pan',
    title: 'PAN',
    subtitle: 'Permanent Account Number',
    icon: 'card-outline',
  },
  {
    type: 'driving_license',
    title: 'Driving Licence',
    subtitle: 'Motor Vehicle Driving License & Validity',
    icon: 'car-outline',
  },
];

export const AddDocumentModal: React.FC<AddDocumentModalProps> = ({
  visible,
  existingTypes,
  customTemplates,
  onClose,
  onSelectType,
  onSelectCustomTemplate,
  onEditExisting,
  onCreateTemplate,
  onManageTemplates,
}) => {
  const handleBuiltinPress = (option: BuiltinOption) => {
    const isExisting = existingTypes.includes(option.type);

    if (isExisting) {
      Alert.alert(
        `${option.title} already exists`,
        `You already have an ${option.title} record in your vault. Would you like to edit it?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Edit Existing',
            onPress: () => {
              onClose();
              onEditExisting(option.type);
            },
          },
        ]
      );
      return;
    }

    onClose();
    onSelectType(option.type);
  };

  const handleCustomTemplatePress = (template: DocumentTemplate) => {
    onClose();
    onSelectCustomTemplate(template);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                  <Ionicons name="shield-checkmark" size={22} color={theme.colors.primaryLight} />
                  <Text style={styles.title}>Add Document</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close modal"
                >
                  <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.scrollList}
                showsVerticalScrollIndicator={false}
              >
                {/* Section 1: Built-in Templates */}
                <Text style={styles.sectionLabel}>BUILT-IN TEMPLATES</Text>
                <View style={styles.optionsList}>
                  {BUILTIN_OPTIONS.map((opt) => {
                    const alreadyAdded = existingTypes.includes(opt.type);

                    return (
                      <TouchableOpacity
                        key={opt.type}
                        style={[styles.optionCard, alreadyAdded && styles.optionCardAdded]}
                        onPress={() => handleBuiltinPress(opt)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.iconCircle}>
                          <Ionicons name={opt.icon} size={22} color={theme.colors.primaryLight} />
                        </View>

                        <View style={styles.optionInfo}>
                          <View style={styles.optionTitleRow}>
                            <Text style={styles.optionTitle}>{opt.title}</Text>
                            {alreadyAdded && (
                              <View style={styles.addedBadge}>
                                <Ionicons name="checkmark-circle" size={12} color={theme.colors.success} />
                                <Text style={styles.addedBadgeText}>Added</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Section 2: Custom User Templates */}
                {customTemplates && customTemplates.length > 0 && (
                  <>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionLabel}>YOUR CUSTOM TEMPLATES</Text>
                      <TouchableOpacity
                        onPress={() => {
                          onClose();
                          onManageTemplates();
                        }}
                      >
                        <Text style={styles.manageLinkText}>Manage</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.optionsList}>
                      {customTemplates.map((tpl) => (
                        <TouchableOpacity
                          key={tpl.id}
                          style={styles.optionCard}
                          onPress={() => handleCustomTemplatePress(tpl)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.iconCircle, styles.customIconCircle]}>
                            <Ionicons name="document-text-outline" size={20} color={theme.colors.accent} />
                          </View>

                          <View style={styles.optionInfo}>
                            <View style={styles.optionTitleRow}>
                              <Text style={styles.optionTitle}>{tpl.name}</Text>
                              <View style={styles.fieldsCountBadge}>
                                <Text style={styles.fieldsCountText}>
                                  {tpl.fields?.length || 0} fields
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.optionSubtitle} numberOfLines={1}>
                              {tpl.description || 'Custom template document'}
                            </Text>
                          </View>

                          <Ionicons
                            name="chevron-forward"
                            size={18}
                            color={theme.colors.textMuted}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Section 3: Template Creation & Management Actions */}
                <View style={styles.footerActions}>
                  <TouchableOpacity
                    style={styles.createTemplateBtn}
                    onPress={() => {
                      onClose();
                      onCreateTemplate();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={theme.colors.primaryLight} />
                    <Text style={styles.createTemplateBtnText}>Create Custom Template</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.manageTemplatesBtn}
                    onPress={() => {
                      onClose();
                      onManageTemplates();
                    }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="layers-outline" size={16} color={theme.colors.textSecondary} />
                    <Text style={styles.manageTemplatesBtnText}>Manage All Templates</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.sm,
  },
  closeButton: {
    padding: 4,
  },
  scrollList: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: theme.typography.fontSizes.xs - 1,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: theme.spacing.xs + 2,
    marginTop: theme.spacing.xs,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs + 2,
  },
  manageLinkText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.primaryLight,
    fontWeight: '600',
  },
  optionsList: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  optionCardAdded: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(19, 23, 34, 0.85)',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  customIconCircle: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    marginLeft: 8,
  },
  addedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.success,
    marginLeft: 3,
  },
  fieldsCountBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    marginLeft: 8,
  },
  fieldsCountText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  optionSubtitle: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  footerActions: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  createTemplateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  createTemplateBtnText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: theme.colors.primaryLight,
    marginLeft: 8,
  },
  manageTemplatesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  manageTemplatesBtnText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
});
