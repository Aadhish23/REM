import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { AppNavigator } from './AppNavigator';
import { AuthNavigator } from './AuthNavigator';
import { theme } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

export const RootNavigator: React.FC = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <View style={styles.logoCircle}>
          <Ionicons name="sparkles" size={40} color={theme.colors.primaryLight} />
        </View>
        <Text style={styles.splashTitle}>REM</Text>
        <Text style={styles.splashSubtitle}>Personal Memory System</Text>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.primaryLight} />
          <Text style={styles.loadingText}>Checking session...</Text>
        </View>
      </View>
    );
  }

  return session ? <AppNavigator /> : <AuthNavigator />;
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  splashTitle: {
    fontSize: theme.typography.fontSizes.display,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    letterSpacing: 3,
  },
  splashSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginBottom: theme.spacing.xl,
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  loadingText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
});
