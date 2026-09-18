import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { theme } from '../constants/theme';

export const SyncStatusCard: React.FC = () => {
  const { status, syncNow } = useSyncStatus();
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleSyncPress = async () => {
    if (status.state === 'syncing' || manualSyncing) return;
    setManualSyncing(true);
    try {
      await syncNow();
    } finally {
      setManualSyncing(false);
    }
  };

  const getStatusDisplay = () => {
    switch (status.state) {
      case 'syncing':
        return {
          label: 'Syncing...',
          color: theme.colors.primaryLight,
          dotColor: theme.colors.primaryLight,
          icon: 'sync' as const,
        };
      case 'offline':
        return {
          label: 'Saved offline',
          color: theme.colors.warning,
          dotColor: theme.colors.warning,
          icon: 'cloud-offline-outline' as const,
        };
      case 'error':
        return {
          label: 'Sync failed — retry',
          color: theme.colors.danger,
          dotColor: theme.colors.danger,
          icon: 'alert-circle-outline' as const,
        };
      case 'synced':
      default:
        return {
          label: status.lastSyncedAt ? 'Synced just now' : 'Synced',
          color: theme.colors.success,
          dotColor: theme.colors.success,
          icon: 'checkmark-circle-outline' as const,
        };
    }
  };

  const display = getStatusDisplay();
  const isSyncInProgress = status.state === 'syncing' || manualSyncing;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.statusInfo}>
          <View style={[styles.statusDot, { backgroundColor: display.dotColor }]} />
          <Text style={[styles.statusText, { color: display.color }]}>
            {display.label}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.syncButton, isSyncInProgress && styles.syncButtonDisabled]}
          onPress={handleSyncPress}
          disabled={isSyncInProgress}
          activeOpacity={0.8}
        >
          {isSyncInProgress ? (
            <ActivityIndicator size="small" color={theme.colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="sync-outline" size={15} color={theme.colors.textPrimary} style={styles.btnIcon} />
              <Text style={styles.syncBtnText}>Sync Now</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {status.pendingCount > 0 && (
        <View style={styles.pendingRow}>
          <Ionicons name="time-outline" size={14} color={theme.colors.textSecondary} />
          <Text style={styles.pendingText}>
            {status.pendingCount} {status.pendingCount === 1 ? 'change' : 'changes'} waiting to sync
          </Text>
        </View>
      )}

      {status.lastSyncedAt && (
        <Text style={styles.lastSyncText}>
          Last cloud sync: {new Date(status.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
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
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  syncButtonDisabled: {
    opacity: 0.6,
  },
  btnIcon: {
    marginRight: 5,
  },
  syncBtnText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pendingText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: 6,
  },
  lastSyncText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
});
