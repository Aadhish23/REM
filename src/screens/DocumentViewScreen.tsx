import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import {
  VaultStackParamList,
  DocumentItem,
  AadhaarData,
  PanData,
  DrivingLicenseData,
} from '../types/document';
import { DocumentTemplateField } from '../types/documentTemplate';
import { localDocumentService } from '../services/localDocumentService';
import { formatDocumentDate } from '../utils/date';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<VaultStackParamList, 'DocumentView'>;

export const DocumentViewScreen: React.FC<Props> = ({ route, navigation }) => {
  const { documentId } = route.params;
  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchDocument = useCallback(async () => {
    const { data, error } = await localDocumentService.getDocument(documentId);
    if (error || !data) {
      Alert.alert('Document Unavailable', error || 'Could not load document.', [
        { text: 'Back', onPress: () => navigation.goBack() },
      ]);
    } else {
      setDocument(data);
    }
    setLoading(false);
  }, [documentId, navigation]);

  useFocusEffect(
    useCallback(() => {
      setIsRevealed(false);
      setCopiedKey(null);
      fetchDocument();

      return () => {
        setIsRevealed(false);
      };
    }, [fetchDocument])
  );

  const handleCopyValue = async (value: string, key = 'primary') => {
    if (!value) return;

    try {
      await Clipboard.setStringAsync(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey(null);
      }, 2000);
    } catch {
      // Fail silently without logging sensitive data
    }
  };

  const handleEdit = () => {
    if (!document) return;
    navigation.navigate('DocumentEditor', {
      documentId: document.id,
      documentType: document.document_type,
      templateId: document.template_id || undefined,
    });
  };

  const handleDelete = () => {
    if (!document) return;

    const displayName = localDocumentService.getDisplayName(document.document_type, document);

    Alert.alert(
      'Delete document?',
      `This ${displayName} will be permanently deleted from your vault.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await localDocumentService.deleteDocument(document.id);
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
          <Text style={styles.loadingText}>Loading document details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!document) {
    return null;
  }

  const displayName = localDocumentService.getDisplayName(
    document.document_type,
    document
  );
  const cardHolder = localDocumentService.getHolderName(document);
  const rawIdentifier = localDocumentService.getIdentifierNumber(document);
  const identifierLabel = localDocumentService.getIdentifierLabel(document);

  const formattedIdentifier =
    document.document_type === 'custom'
      ? rawIdentifier
      : localDocumentService.formatDisplayNumber(document.document_type, rawIdentifier);

  const maskedIdentifier = localDocumentService.maskNumber(
    document.document_type,
    rawIdentifier
  );
  const displayedNumber = isRevealed ? formattedIdentifier : maskedIdentifier;
  const identifier = rawIdentifier;

  const data = (document.document_data || {}) as any;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Identifier Card with Show/Hide and Copy */}
        {identifier ? (
          <View style={styles.identifierCard}>
            <View style={styles.identifierHeader}>
              <Text style={styles.identifierLabel}>{identifierLabel}</Text>

              <View style={styles.securityPill}>
                <Ionicons name="lock-closed" size={11} color={theme.colors.success} />
                <Text style={styles.securityPillText}>Protected</Text>
              </View>
            </View>

            <View style={styles.numberDisplayBox}>
              <Text
                style={[
                  styles.numberText,
                  isRevealed && styles.numberTextRevealed,
                ]}
                selectable={false}
              >
                {displayedNumber}
              </Text>
            </View>

            {/* Action buttons: Show/Hide & Copy */}
            <View style={styles.numberActionsRow}>
              <TouchableOpacity
                style={styles.actionPill}
                onPress={() => setIsRevealed(!isRevealed)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={isRevealed ? 'Hide number' : 'Show number'}
              >
                <Ionicons
                  name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={theme.colors.primaryLight}
                />
                <Text style={styles.actionPillText}>{isRevealed ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionPill, copiedKey === 'primary' && styles.actionPillSuccess]}
                onPress={() => handleCopyValue(identifier, 'primary')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Copy number"
              >
                <Ionicons
                  name={copiedKey === 'primary' ? 'checkmark-circle' : 'copy-outline'}
                  size={16}
                  color={copiedKey === 'primary' ? theme.colors.success : theme.colors.textPrimary}
                />
                <Text
                  style={[
                    styles.actionPillText,
                    copiedKey === 'primary' && styles.actionPillTextSuccess,
                  ]}
                >
                  {copiedKey === 'primary' ? 'Copied' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Structured Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionHeading}>DOCUMENT DETAILS</Text>

          {/* CUSTOM TEMPLATE FIELDS */}
          {document.document_type === 'custom' ? (
            <View>
              {(document.template?.fields || []).map((f: DocumentTemplateField, index: number) => {
                const rawVal = data[f.field_key];
                const isFieldCopied = copiedKey === f.field_key;

                let displayVal = '—';
                if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                  if (f.field_type === 'date') {
                    displayVal = formatDocumentDate(String(rawVal));
                  } else if (f.field_type === 'boolean') {
                    displayVal = rawVal ? 'Yes' : 'No';
                  } else {
                    displayVal = String(rawVal);
                  }
                }

                // If field is sensitive/masked and not revealed
                const isMaskedField = (f.sensitive || f.mask_enabled) && !isRevealed && displayVal !== '—';
                const shownVal = isMaskedField
                  ? localDocumentService.maskNumber('custom', displayVal)
                  : displayVal;

                return (
                  <React.Fragment key={f.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.fieldRowWithCopy}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.fieldLabelRow}>
                          <Text style={styles.fieldLabel}>{f.field_label}</Text>
                          {f.sensitive && (
                            <View style={styles.sensitiveDot}>
                              <Text style={styles.sensitiveDotText}>Sensitive</Text>
                            </View>
                          )}
                        </View>
                        <Text
                          style={[
                            styles.fieldValue,
                            isMaskedField && styles.maskedFieldValue,
                          ]}
                        >
                          {shownVal}
                        </Text>
                      </View>

                      {/* Individual field copy button (Requirement 22) */}
                      {rawVal ? (
                        <TouchableOpacity
                          style={[styles.miniCopyBtn, isFieldCopied && styles.miniCopyBtnSuccess]}
                          onPress={() => handleCopyValue(String(rawVal), f.field_key)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`Copy ${f.field_label}`}
                        >
                          <Ionicons
                            name={isFieldCopied ? 'checkmark' : 'copy-outline'}
                            size={14}
                            color={isFieldCopied ? theme.colors.success : theme.colors.textSecondary}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          ) : (
            /* BUILT-IN DOCUMENT FIELDS */
            <View>
              {/* Name Field */}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Name</Text>
                <Text style={styles.fieldValue}>{data.name || '—'}</Text>
              </View>

              {/* Aadhaar specific */}
              {document.document_type === 'aadhaar' && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Date of Birth</Text>
                    <Text style={styles.fieldValue}>
                      {formatDocumentDate((data as AadhaarData).dateOfBirth) || '—'}
                    </Text>
                  </View>
                </>
              )}

              {/* Driving Licence specific */}
              {document.document_type === 'driving_license' && (
                <>
                  <View style={styles.divider} />
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Date of Birth</Text>
                    <Text style={styles.fieldValue}>
                      {formatDocumentDate((data as DrivingLicenseData).dateOfBirth) || '—'}
                    </Text>
                  </View>

                  <View style={styles.divider} />
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Valid From</Text>
                    <Text style={styles.fieldValue}>
                      {formatDocumentDate((data as DrivingLicenseData).validFrom) || '—'}
                    </Text>
                  </View>

                  <View style={styles.divider} />
                  <View style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>Valid Until</Text>
                    <Text style={styles.fieldValue}>
                      {formatDocumentDate((data as DrivingLicenseData).validUntil) || '—'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {/* Edit & Delete Action Buttons (Mandatory in Detail Screen) */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={handleEdit}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Edit Document"
          >
            <Ionicons name="create-outline" size={20} color="#FFFFFF" />
            <Text style={styles.editButtonText}>Edit Document</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Delete Document"
          >
            {deleting ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                <Text style={styles.deleteButtonText}>Delete Document</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    maxWidth: '75%',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  identifierCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  identifierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  identifierLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
  },
  securityPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.success,
    marginLeft: 4,
  },
  numberDisplayBox: {
    backgroundColor: 'rgba(11, 13, 19, 0.8)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(35, 42, 59, 0.8)',
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
  },
  numberText: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 3,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  numberTextRevealed: {
    color: theme.colors.primaryLight,
  },
  numberActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    minWidth: 90,
    justifyContent: 'center',
  },
  actionPillSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  actionPillText: {
    fontSize: theme.typography.fontSizes.xs + 1,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginLeft: 6,
  },
  actionPillTextSuccess: {
    color: theme.colors.success,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.xl,
  },
  sectionHeading: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.md,
  },
  fieldRow: {
    paddingVertical: 6,
  },
  fieldRowWithCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  sensitiveDot: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.borderRadius.full,
    marginLeft: 6,
  },
  sensitiveDotText: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.warning,
  },
  fieldValue: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  maskedFieldValue: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1.5,
  },
  miniCopyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: 12,
  },
  miniCopyBtnSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.sm,
  },
  bottomActions: {
    gap: theme.spacing.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  editButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  deleteButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.danger,
    marginLeft: 8,
  },
});
