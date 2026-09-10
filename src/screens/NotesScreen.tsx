import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { theme } from '../constants/theme';

export const NotesScreen: React.FC = () => {
  return (
    <ScreenContainer headerSubtitle="Private Notes">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="document-text-outline" size={36} color={theme.colors.accent} />
          </View>
          <Text style={styles.title}>Private Notes</Text>
          <Text style={styles.description}>
            Secure personal notes with category tags, instant local search, and trash recovery protection.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>PLANNED CAPABILITIES</Text>
          <View style={styles.featureItem}>
            <Ionicons name="search-outline" size={18} color={theme.colors.primaryLight} />
            <Text style={styles.featureText}>Instant local full-text search</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="folder-outline" size={18} color={theme.colors.primaryLight} />
            <Text style={styles.featureText}>Categorization & tags</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="trash-bin-outline" size={18} color={theme.colors.primaryLight} />
            <Text style={styles.featureText}>Trash recovery safety net against accidental deletes</Text>
          </View>
        </View>

        <View style={styles.statusBox}>
          <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.statusText}>Notes module will activate in Phase 5</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.xl,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  cardLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textMuted,
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs + 2,
  },
  featureText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statusText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
});
