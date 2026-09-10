import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { AuthContextType } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function formatAuthError(error: Error | null): string | null {
  if (!error) return null;
  const message = error.message.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Your email has not been confirmed. Please check your inbox for the verification link.';
  }
  if (message.includes('user already registered')) {
    return 'An account with this email address already exists. Please log in.';
  }
  if (message.includes('password should be at least')) {
    return 'Password must be at least 6 characters long.';
  }
  if (message.includes('network request failed') || message.includes('fetch')) {
    return 'Network connection issue. Please check your internet connection.';
  }

  return error.message;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialSession() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session && isMounted) {
          setSession(data.session);
          setUser(data.session.user);
        }
      } catch {
        // Silent catch on bootstrap
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (isMounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return {
        error:
          'Supabase credentials are not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
      };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      return { error: formatAuthError(error) };
    } catch (err) {
      return {
        error: err instanceof Error ? formatAuthError(err) : 'An unexpected error occurred.',
      };
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return {
        error:
          'Supabase credentials are not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
      };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        return { error: formatAuthError(error) };
      }

      // If Supabase has email confirmations enabled, data.session is null until verified
      const needsEmailConfirmation = Boolean(data.user && !data.session);
      return { error: null, needsEmailConfirmation };
    } catch (err) {
      return {
        error: err instanceof Error ? formatAuthError(err) : 'An unexpected error occurred.',
      };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Force clear local state on error
      setSession(null);
      setUser(null);
    }
  };

  const resetPasswordForEmail = async (email: string) => {
    if (!isSupabaseConfigured) {
      return {
        error:
          'Supabase credentials are not configured. Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.',
      };
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      return { error: formatAuthError(error) };
    } catch (err) {
      return {
        error: err instanceof Error ? formatAuthError(err) : 'An unexpected error occurred.',
      };
    }
  };

  const updatePassword = async (newPassword: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase credentials are not configured.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      return { error: formatAuthError(error) };
    } catch (err) {
      return {
        error: err instanceof Error ? formatAuthError(err) : 'An unexpected error occurred.',
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        isLoading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        resetPasswordForEmail,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
