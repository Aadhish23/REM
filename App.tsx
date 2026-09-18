import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { theme } from './src/constants/theme';
import { initNotificationChannel } from './src/services/notificationService';

const appNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: theme.colors.primary,
    background: theme.colors.background,
    card: theme.colors.tabBarBackground,
    text: theme.colors.textPrimary,
    border: theme.colors.border,
    notification: theme.colors.accent,
  },
};

import { AppState } from 'react-native';
import { syncService } from './src/services/syncService';

export default function App() {
  useEffect(() => {
    // 1. Initialize Android notification channel for task reminders
    initNotificationChannel();

    // 2. Listen for notification tap events
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const taskId = response.notification.request.content.data?.taskId;
      console.log('[Notification Tap] User interacted with task notification:', taskId);
      // Opens app safely without crashing
    });

    // 3. Trigger sync when returning to active foreground
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncService.syncNow().catch(() => {});
      }
    });

    return () => {
      subscription.remove();
      appStateSub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <NavigationContainer theme={appNavigationTheme}>
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
