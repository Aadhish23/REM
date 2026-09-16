import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RootTabParamList } from '../types/navigation';
import { TasksScreen } from '../screens/TasksScreen';
import { NotesNavigator } from './NotesNavigator';
import { VaultScreen } from '../screens/VaultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

export const AppNavigator: React.FC = () => {
  const insets = useSafeAreaInsets();
  // Safe bottom padding for Samsung One UI & Android gesture/3-button navigation
  const bottomInset = Math.max(insets.bottom, 12);
  const barHeight = 64 + bottomInset;

  return (
    <Tab.Navigator
      initialRouteName="Tasks"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#8696A0',
        tabBarButton: (props) => (
          <TouchableOpacity
            {...(props as any)}
            activeOpacity={0.75}
          />
        ),
        tabBarStyle: [
          styles.tabBar,
          {
            height: barHeight,
            paddingBottom: bottomInset,
          },
        ],
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              Tasks
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <Ionicons
                name={focused ? 'checkbox' : 'checkbox-outline'}
                size={23}
                color={focused ? '#FFFFFF' : '#8696A0'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesNavigator}
        options={({ route }) => {
          const routeName = getFocusedRouteNameFromRoute(route) ?? 'NotesList';
          const isDetailOrEditor = routeName === 'NoteView' || routeName === 'NoteEditor';
          return {
            tabBarStyle: isDetailOrEditor
              ? { display: 'none' }
              : [
                  styles.tabBar,
                  {
                    height: barHeight,
                    paddingBottom: bottomInset,
                  },
                ],
            tabBarLabel: ({ focused }) => (
              <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
                Notes
              </Text>
            ),
            tabBarIcon: ({ focused }) => (
              <View style={styles.iconContainer}>
                <Ionicons
                  name={focused ? 'document-text' : 'document-text-outline'}
                  size={23}
                  color={focused ? '#FFFFFF' : '#8696A0'}
                />
              </View>
            ),
          };
        }}
      />
      <Tab.Screen
        name="Vault"
        component={VaultScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              Vault
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <Ionicons
                name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
                size={23}
                color={focused ? '#FFFFFF' : '#8696A0'}
              />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: ({ focused }) => (
            <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              Settings
            </Text>
          ),
          tabBarIcon: ({ focused }) => (
            <View style={styles.iconContainer}>
              <Ionicons
                name={focused ? 'settings' : 'settings-outline'}
                size={23}
                color={focused ? '#FFFFFF' : '#8696A0'}
              />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#0B1017', // WhatsApp-style dark surface
    borderTopColor: '#1F2633', // Clean subtle top border
    borderTopWidth: 1,
    paddingTop: 6,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  tabBarItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  iconContainer: {
    width: 48,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 3,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabLabelInactive: {
    fontWeight: '500',
    color: '#8696A0', // WhatsApp inactive icon/text color
  },
});
