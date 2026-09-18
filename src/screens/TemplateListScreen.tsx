import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { VaultStackParamList, DocumentTemplate } from '../types/document';
import { localTemplateService } from '../services/localTemplateService';
import { TemplateCard } from '../components/TemplateCard';
import { theme } from '../constants/theme';

type Props = NativeStackScreenProps<VaultStackParamList, 'TemplateList'>;

export const TemplateListScreen: React.FC<Props> = ({ navigation }) => {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadTemplates = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setErrorMessage(null);

    const { data, error } = await localTemplateService.getTemplates();
    if (error) {
      setErrorMessage(error);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [loadTemplates])
  );

  const handleCreate = () => {
    navigation.navigate('TemplateEditor', {});
  };

  const handleEdit = (template: DocumentTemplate) => {
    navigation.navigate('TemplateEditor', { templateId: template.id });
  };

  const handleDelete = (template: DocumentTemplate) => {
    Alert.alert(
      'Delete template?',
      `Are you sure you want to delete "${template.name}"? If any documents are using this template, deletion will be blocked to protect your records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await localTemplateService.deleteTemplate(template.id);
            if (error) {
              Alert.alert('Unable to Delete Template', error);
            } else {
              setTemplates((prev) => prev.filter((t) => t.id !== template.id));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Document Templates</Text>
          <Text style={styles.headerSubtitle}>
            {loading ? 'Loading...' : `${templates.length} custom template${templates.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleCreate}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={styles.createBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Error banner */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={18} color={theme.colors.danger} />
          <Text style={styles.errorText}>{errorMessage}</Text>
          <TouchableOpacity onPress={() => loadTemplates()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Loading templates...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          contentContainerStyle={[
            styles.scrollContainer,
            templates.length === 0 && styles.emptyScrollContainer,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadTemplates(true)}
              tintColor={theme.colors.primaryLight}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {templates.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="copy-outline" size={40} color={theme.colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>No Custom Templates</Text>
              <Text style={styles.emptySubtitle}>
                Create reusable templates for College IDs, Passports, Bike Insurance, or Certificates with custom fields.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={handleCreate}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                <Text style={styles.emptyButtonText}>Create First Template</Text>
              </TouchableOpacity>
            </View>
          ) : (
            templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onPress={handleEdit}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))
          )}
        </ScrollView>
      )}
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: theme.spacing.xs,
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.md + 2,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
  },
  createBtnText: {
    fontSize: theme.typography.fontSizes.xs + 1,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 3,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    padding: theme.spacing.md,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  errorText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs + 1,
    color: theme.colors.danger,
    marginLeft: 8,
  },
  retryText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.danger,
    marginLeft: 8,
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
    padding: theme.spacing.md,
    paddingBottom: 40,
  },
  emptyScrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  emptyTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
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
  },
  emptyButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
  },
});
