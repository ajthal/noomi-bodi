import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { clearOfflineData } from '../services/offlineStore';

interface StashedSession {
  access_token: string;
  refresh_token: string;
}

interface ImpersonationContextValue {
  isImpersonating: boolean;
  isSwitching: boolean;
  impersonatedLabel: string | null;
  switchToUser: (email: string, password: string, label: string) => Promise<{ error: string | null }>;
  switchBack: () => Promise<{ error: string | null }>;
}

const ImpersonationContext = createContext<ImpersonationContextValue>({
  isImpersonating: false,
  isSwitching: false,
  impersonatedLabel: null,
  switchToUser: async () => ({ error: null }),
  switchBack: async () => ({ error: null }),
});

export function useImpersonation() {
  return useContext(ImpersonationContext);
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [impersonatedLabel, setImpersonatedLabel] = useState<string | null>(null);
  const stashedSession = useRef<StashedSession | null>(null);

  const switchToUser = useCallback(async (email: string, password: string, label: string) => {
    try {
      setIsSwitching(true);

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession) {
        stashedSession.current = {
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        };
      }

      await supabase.auth.signOut();

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (stashedSession.current) {
          await supabase.auth.setSession(stashedSession.current);
          stashedSession.current = null;
        }
        setIsSwitching(false);
        return { error: error.message };
      }

      await clearOfflineData();
      setIsImpersonating(true);
      setImpersonatedLabel(label);
      setIsSwitching(false);
      return { error: null };
    } catch (e: any) {
      if (stashedSession.current) {
        await supabase.auth.setSession(stashedSession.current).catch(() => {});
        stashedSession.current = null;
      }
      setIsSwitching(false);
      return { error: e?.message || 'Failed to switch user' };
    }
  }, []);

  const switchBack = useCallback(async () => {
    try {
      setIsSwitching(true);
      await supabase.auth.signOut();

      if (stashedSession.current) {
        const { error } = await supabase.auth.setSession(stashedSession.current);
        stashedSession.current = null;
        if (error) {
          setIsSwitching(false);
          setIsImpersonating(false);
          setImpersonatedLabel(null);
          return { error: 'Session expired. Please sign in again.' };
        }
      }

      await clearOfflineData();
      setIsImpersonating(false);
      setImpersonatedLabel(null);
      setIsSwitching(false);
      return { error: null };
    } catch (e: any) {
      stashedSession.current = null;
      setIsSwitching(false);
      setIsImpersonating(false);
      setImpersonatedLabel(null);
      return { error: e?.message || 'Failed to switch back' };
    }
  }, []);

  return (
    <ImpersonationContext.Provider
      value={{ isImpersonating, isSwitching, impersonatedLabel, switchToUser, switchBack }}
    >
      {children}
    </ImpersonationContext.Provider>
  );
}
