import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NotesStackParamList } from '../types/note';
import { NotesScreen } from '../screens/NotesScreen';
import { NoteViewScreen } from '../screens/NoteViewScreen';
import { NoteEditorScreen } from '../screens/NoteEditorScreen';
import { theme } from '../constants/theme';

const Stack = createNativeStackNavigator<NotesStackParamList>();

export const NotesNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      initialRouteName="NotesList"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="NotesList" component={NotesScreen} />
      <Stack.Screen name="NoteView" component={NoteViewScreen} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} />
    </Stack.Navigator>
  );
};
