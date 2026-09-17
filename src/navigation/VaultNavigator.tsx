import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VaultStackParamList } from '../types/document';
import { VaultScreen } from '../screens/VaultScreen';
import { DocumentViewScreen } from '../screens/DocumentViewScreen';
import { DocumentEditorScreen } from '../screens/DocumentEditorScreen';
import { TemplateListScreen } from '../screens/TemplateListScreen';
import { TemplateEditorScreen } from '../screens/TemplateEditorScreen';
import { theme } from '../constants/theme';

const Stack = createNativeStackNavigator<VaultStackParamList>();

export const VaultNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="VaultList"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="VaultList" component={VaultScreen} />
      <Stack.Screen name="DocumentView" component={DocumentViewScreen} />
      <Stack.Screen name="DocumentEditor" component={DocumentEditorScreen} />
      <Stack.Screen name="TemplateList" component={TemplateListScreen} />
      <Stack.Screen name="TemplateEditor" component={TemplateEditorScreen} />
    </Stack.Navigator>
  );
};
