import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { theme } from '../constants/theme';

export const VaultScreen: React.FC = () => {
  return (
    <ScreenContainer headerSubtitle="Document Vault">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.iconCircle}>
            <Ionicons name="shield-checkmark-outline" size={36} color={theme.colors.success} />
          </View>
          <Text style={styles.title}>Document Vault</Text>
          <Text style={styles.description}>
            Biometrically protected storage for Aadhaar, PAN, Driving License, and personal identity records.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SUPPORTED DOCUMENT SCHEMAS</Text>
          <View style={styles.docRow}>
            <Ionicons name="card-outline" size={20} color={theme.colors.primaryLight} />
            <View style={styles.docInfo}>
              <Text style={styles.docTitle}>Aadhaar Card</Text>
              <Text style={styles.docFields}>Aadhaar Number • Name • Date of Birth</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.docRow}>
            <Ionicons name="card-outline" size={20} color={theme.colors.primaryLight} />
            <View style={styles.docInfo}>
              <Text style={styles.docTitle}>PAN Card</Text>
              <Text style={styles.docFields}>PAN Number • Name</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.docRow}>
            <Ionicons name="car-outline" size={20} color={theme.colors.primaryLight} />
            <View style={styles.docInfo}>
              <Text style={styles.docTitle}>Driving License</Text>
              <Text style={styles.docFields}>License Number • Name • DOB • Valid Dates</Text>
            </View>
          </View>
        </View>

        <View style={styles.securityAlert}>
          <Ionicons name="lock-closed" size={18} color={theme.colors.warning} />
          <Text style={styles.securityText}>
            Strict Zero-CVV Policy: Payment card CVVs are strictly forbidden from entering this vault.
          </Text>
        </View>

        <View style={styles.statusBox}>
          <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.statusText}>Vault module will activate in Phase 6</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 100,
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
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
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
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs + 2,
  },
  docInfo: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  docTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  docFields: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  securityAlert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    marginBottom: theme.spacing.md,
  },
  securityText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.warning,
    marginLeft: theme.spacing.sm,
    lineHeight: 18,
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
