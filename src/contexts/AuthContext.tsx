import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../services/supabase';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { sha256 } from 'js-sha256';
import { GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '@env';
import type { Session, User } from '@supabase/supabase-js';
import { unregisterPushToken } from '../services/notifications';

function generateNonce(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  iosClientId: GOOGLE_IOS_CLIENT_ID,
});

export type SocialAuthResult = { error: string | null; cancelled?: boolean };

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<SocialAuthResult>;
  signInWithGoogle: () => Promise<SocialAuthResult>;
  signOut: () => Promise<void>;
  resendVerificationEmail: () => Promise<{ error: string | null }>;
  refreshSession: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  signUp: async () => ({ error: null }),
  signIn: async () => ({ error: null }),
  signInWithApple: async () => ({ error: null, cancelled: false }),
  signInWithGoogle: async () => ({ error: null, cancelled: false }),
  signOut: async () => {},
  resendVerificationEmail: async () => ({ error: null }),
  refreshSession: async () => {},
  resetPassword: async () => ({ error: null }),
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => {
        setSession(s);
        setUser(s?.user ?? null);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      return { error: 'Apple Sign-In is only available on iOS' };
    }
    try {
      const appleResponse = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      });

      if (!appleResponse.identityToken) {
        return { error: 'No identity token returned from Apple' };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: appleResponse.identityToken,
      });
      return { error: error?.message ?? null };
    } catch (err: any) {
      if (err?.code === appleAuth.Error.CANCELED) {
        return { error: null, cancelled: true };
      }
      return { error: err?.message ?? 'Apple Sign-In failed' };
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const rawNonce = generateNonce();
      const hashedNonce = sha256(rawNonce);
      const response = await GoogleSignin.signIn({ nonce: hashedNonce });

      if (response.type === 'cancelled') {
        return { error: null, cancelled: true };
      }

      const idToken = response.data?.idToken;
      if (!idToken) {
        return { error: 'No ID token returned from Google' };
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: rawNonce,
      });
      return { error: error?.message ?? null };
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
        return { error: null, cancelled: true };
      }
      return { error: err?.message ?? 'Google Sign-In failed' };
    }
  }, []);

  const doSignOut = useCallback(async () => {
    await unregisterPushToken();
    await supabase.auth.signOut();
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    const email = user?.email;
    if (!email) return { error: 'No email found' };
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: error?.message ?? null };
  }, [user]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  }, []);

  const refreshSession = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.refreshSession();
    if (s) {
      setSession(s);
      setUser(s.user);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signUp,
        signIn,
        signInWithApple,
        signInWithGoogle,
        signOut: doSignOut,
        resendVerificationEmail,
        refreshSession,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
