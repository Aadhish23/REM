import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';
import { Header } from './Header';

interface ScreenContainerProps {
  children: React.ReactNode;
  showHeader?: boolean;
  headerTitle?: string;
  headerSubtitle?: string;
  style?: ViewStyle;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  showHeader = true,
  headerTitle,
  headerSubtitle,
  style,
}) => {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {showHeader && <Header title={headerTitle} subtitle={headerSubtitle} />}
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
});
