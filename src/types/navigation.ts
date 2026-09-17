import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type RootTabParamList = {
  Tasks: undefined;
  Notes: undefined;
  Vault: undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
  ResetPassword: undefined;
};

export type AuthScreenProps<T extends keyof AuthStackParamList> = NativeStackScreenProps<
  AuthStackParamList,
  T
>;

export type RootTabScreenProps<T extends keyof RootTabParamList> = BottomTabScreenProps<
  RootTabParamList,
  T
>;

export { NotesStackParamList } from './note';
import { NotesStackParamList } from './note';
export type NotesStackScreenProps<T extends keyof NotesStackParamList> = NativeStackScreenProps<
  NotesStackParamList,
  T
>;

export { VaultStackParamList } from './document';
import { VaultStackParamList } from './document';
export type VaultStackScreenProps<T extends keyof VaultStackParamList> = NativeStackScreenProps<
  VaultStackParamList,
  T
>;

