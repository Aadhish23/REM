import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { DocumentItem } from '../types/document';
import { documentService } from '../services/documentService';
import { theme } from '../constants/theme';

interface DocumentCardProps {
  document: DocumentItem;
  onPress: (document: DocumentItem) => void;
  onCopySuccess?: (message: string) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onPress,
  onCopySuccess,
}) => {
  const [copied, setCopied] = useState(false);

  const displayName = documentService.getDisplayName(document.document_type, document);
  const holderName = documentService.getHolderName(document);
  const identifier = documentService.getIdentifierNumber(document);
  const maskedNumber = identifier
    ? documentService.maskNumber(document.document_type, identifier)
    : '';

  const getIconName = () => {
    switch (document.document_type) {
      case 'aadhaar':
        return 'finger-print-outline';
      case 'pan':
        return 'card-outline';
      case 'driving_license':
        return 'car-outline';
      case 'custom':
        return 'document-text-outline';
      default:
        return 'document-text-outline';
    }
  };

  const handleCopy = async (e: any) => {
    e?.stopPropagation?.();
    if (!identifier) return;

    try {
      await Clipboard.setStringAsync(identifier);
      setCopied(true);
      const msg = `${displayName} number copied`;
      onCopySuccess?.(msg);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Fail silently without logging sensitive data
    }
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(document)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${displayName} card for ${holderName}`}
    >
      {/* Top row: Document Type Badge and Chevron */}
      <View style={styles.cardHeader}>
        <View style={styles.typeBadge}>
          <Ionicons name={getIconName()} size={16} color={theme.colors.primaryLight} />
          <Text style={styles.typeText} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        <View style={styles.viewHint}>
          <Text style={styles.viewHintText}>Details</Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.textMuted} />
        </View>
      </View>

      {/* Center content: Masked number & Holder Name */}
      <View style={styles.cardBody}>
        <Text style={styles.nameLabel} numberOfLines={1} ellipsizeMode="tail">
          {holderName || displayName}
        </Text>

        {maskedNumber ? (
          <View style={styles.numberRow}>
            <Text style={styles.maskedNumber}>{maskedNumber}</Text>
          </View>
        ) : null}
      </View>

      {/* Footer: Security badge and optional Copy Button */}
      <View style={styles.cardFooter}>
        <View style={styles.secureTag}>
          <Ionicons name="shield-checkmark" size={13} color={theme.colors.success} />
          <Text style={styles.secureTagText}>
            {document.document_type === 'custom' ? 'Custom Template' : 'Encrypted & Masked'}
          </Text>
        </View>

        {identifier ? (
          <TouchableOpacity
            style={[styles.copyButton, copied && styles.copyButtonActive]}
            onPress={handleCopy}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${displayName} identifier`}
          >
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy-outline'}
              size={15}
              color={copied ? theme.colors.success : theme.colors.textPrimary}
            />
            <Text style={[styles.copyButtonText, copied && styles.copyButtonTextActive]}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.noCopyHint}>Tap to view</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm + 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    maxWidth: '75%',
  },
  typeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '700',
    color: theme.colors.primaryLight,
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  viewHint: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewHintText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textMuted,
    marginRight: 2,
  },
  cardBody: {
    marginVertical: theme.spacing.xs,
  },
  nameLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 6,
  },
  numberRow: {
    backgroundColor: 'rgba(11, 13, 19, 0.6)',
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(35, 42, 59, 0.6)',
  },
  maskedNumber: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm + 4,
    paddingTop: theme.spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(35, 42, 59, 0.5)',
  },
  secureTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secureTagText: {
    fontSize: theme.typography.fontSizes.xs - 1,
    color: theme.colors.textMuted,
    marginLeft: 5,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    paddingHorizontal: theme.spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  copyButtonActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  copyButtonText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginLeft: 5,
  },
  copyButtonTextActive: {
    color: theme.colors.success,
  },
  noCopyHint: {
    fontSize: theme.typography.fontSizes.xs - 1,
    color: theme.colors.textMuted,
  },
});
