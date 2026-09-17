import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { DocumentCard } from '../components/DocumentCard';
import { AddDocumentModal } from '../components/AddDocumentModal';
import { documentService } from '../services/documentService';
import { documentTemplateService } from '../services/documentTemplateService';
import {
  VaultStackParamList,
  DocumentItem,
  DocumentType,
} from '../types/document';
import { DocumentTemplate } from '../types/documentTemplate';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<VaultStackParamList, 'VaultList'>;

export const VaultScreen: React.FC<Props> = ({ navigation }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [customTemplates, setCustomTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    setErrorMessage(null);

    // Fetch documents and custom templates in parallel
    const [docsResult, templatesResult] = await Promise.all([
      documentService.getDocuments(),
      documentTemplateService.getTemplates(),
    ]);

    if (docsResult.error) {
      setErrorMessage(docsResult.error);
    } else {
      setDocuments(docsResult.data || []);
    }

    if (!templatesResult.error && templatesResult.data) {
      setCustomTemplates(templatesResult.data);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    loadData(true);
  };

  const handleOpenDocument = (doc: DocumentItem) => {
    navigation.navigate('DocumentView', { documentId: doc.id });
  };

  const handleSelectNewDocType = (type: DocumentType) => {
    navigation.navigate('DocumentEditor', { documentType: type });
  };

  const handleSelectCustomTemplate = (template: DocumentTemplate) => {
    navigation.navigate('DocumentEditor', {
      templateId: template.id,
      documentType: 'custom',
    });
  };

  const handleEditExisting = (type: DocumentType) => {
    const existing = documents.find((d) => d.document_type === type);
    if (existing) {
      navigation.navigate('DocumentEditor', {
        documentId: existing.id,
        documentType: type,
      });
    }
  };

  const handleCreateTemplate = () => {
    navigation.navigate('TemplateEditor', {});
  };

  const handleManageTemplates = () => {
    navigation.navigate('TemplateList');
  };

  const handleCopySuccess = (message: string) => {
    setCopyToast(message);
    setTimeout(() => {
      setCopyToast(null);
    }, 2500);
  };

  const existingBuiltinTypes = documents
    .filter((d) => d.document_type !== 'custom')
    .map((d) => d.document_type);

  return (
    <ScreenContainer headerSubtitle="Document Vault">
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Text style={styles.topHeading}>Your Documents</Text>
          <Text style={styles.topSubheading}>
            {loading
              ? 'Loading vault...'
              : `${documents.length} document${documents.length === 1 ? '' : 's'} stored`}
          </Text>
        </View>

        <View style={styles.topActionsRow}>
          <TouchableOpacity
            style={styles.templatesButton}
            onPress={handleManageTemplates}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Manage Templates"
          >
            <Ionicons name="layers-outline" size={17} color={theme.colors.textPrimary} />
            <Text style={styles.templatesButtonText}>Templates</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add Document"
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Copy Toast Notification */}
      {copyToast && (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
          <Text style={styles.toastText}>{copyToast}</Text>
        </View>
      )}

      {/* Error Message */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadData()}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Loading Indicator */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading vault...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={[
            styles.scrollContainer,
            documents.length === 0 && styles.emptyScrollContainer,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primaryLight}
              colors={[theme.colors.primaryLight]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {documents.length === 0 ? (
            /* Empty State */
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={44}
                  color={theme.colors.textSecondary}
                />
              </View>
              <Text style={styles.emptyTitle}>Your vault is empty</Text>
              <Text style={styles.emptySubtitle}>
                Store structured records for Aadhaar, PAN, Driving Licence, or your own custom templates (College ID, Passport, Insurance).
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.emptyButtonText}>Add your first document</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Document Cards List */
            <>
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  onPress={handleOpenDocument}
                  onCopySuccess={handleCopySuccess}
                />
              ))}

              <View style={styles.privacyNote}>
                <Ionicons name="lock-closed" size={13} color={theme.colors.textMuted} />
                <Text style={styles.privacyNoteText}>
                  Protected by PostgreSQL Row Level Security. Encrypted vault.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Add Document Type Picker Modal */}
      <AddDocumentModal
        visible={modalVisible}
        existingTypes={existingBuiltinTypes}
        customTemplates={customTemplates}
        onClose={() => setModalVisible(false)}
        onSelectType={handleSelectNewDocType}
        onSelectCustomTemplate={handleSelectCustomTemplate}
        onEditExisting={handleEditExisting}
        onCreateTemplate={handleCreateTemplate}
        onManageTemplates={handleManageTemplates}
      />
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  topBarText: {
    flex: 1,
  },
  topHeading: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  topSubheading: {
    fontSize: theme.typography.fontSizes.xs + 1,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  templatesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  templatesButtonText: {
    fontSize: theme.typography.fontSizes.xs + 1,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginLeft: 5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
    elevation: 3,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  addButtonText: {
    fontSize: theme.typography.fontSizes.xs + 1,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 3,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  toastText: {
    fontSize: theme.typography.fontSizes.xs + 1,
    fontWeight: '600',
    color: theme.colors.success,
    marginLeft: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs + 1,
    color: theme.colors.danger,
    marginLeft: theme.spacing.sm,
  },
  retryButton: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: theme.borderRadius.sm,
    marginLeft: theme.spacing.sm,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.danger,
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
  scrollContent: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 90,
  },
  emptyScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.18)',
  },
  emptyTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: theme.spacing.lg,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.full,
    elevation: 3,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  privacyNoteText: {
    fontSize: theme.typography.fontSizes.xs - 1,
    color: theme.colors.textMuted,
    marginLeft: 6,
    textAlign: 'center',
  },
});
