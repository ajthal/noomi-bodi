import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Types ────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  inputBg: string;
  inputBorder: string;
  card: string;
  userBubble: string;
  assistantBubble: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
  statusBar: 'light-content' | 'dark-content';
  // Accent colors stay the same in both themes
  accent: string;
  error: string;
}

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

// ── Color palettes ──────────────────────────────────────────────────

const LIGHT: ThemeColors = {
  background: '#ffffff',
  surface: '#fafafa',
  surfaceAlt: '#f8f8f8',
  text: '#1a1a1a',
  textSecondary: '#888888',
  textTertiary: '#aaaaaa',
  border: '#eeeeee',
  borderLight: '#dddddd',
  inputBg: '#f9f9f9',
  inputBorder: '#dddddd',
  card: '#ffffff',
  userBubble: '#E3F2FD',
  assistantBubble: '#f5f5f5',
  tabBarBg: '#ffffff',
  tabBarBorder: '#cccccc',
  tabBarActive: '#000000',
  tabBarInactive: 'gray',
  statusBar: 'dark-content',
  accent: '#7C3AED',
  error: '#d32f2f',
};

const DARK: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceAlt: '#181818',
  text: '#e0e0e0',
  textSecondary: '#999999',
  textTertiary: '#666666',
  border: '#333333',
  borderLight: '#2a2a2a',
  inputBg: '#2a2a2a',
  inputBorder: '#444444',
  card: '#1e1e1e',
  userBubble: '#1a3a5c',
  assistantBubble: '#2a2a2a',
  tabBarBg: '#121212',
  tabBarBorder: '#333333',
  tabBarActive: '#ffffff',
  tabBarInactive: '#888888',
  statusBar: 'light-content',
  accent: '#7C3AED',
  error: '#ef5350',
};

// ── Storage key ─────────────────────────────────────────────────────

const STORAGE_KEY = '@noomibodi_theme_mode';

// ── Context ─────────────────────────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  isDark: false,
  colors: LIGHT,
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? DARK : LIGHT;

  const value = useMemo(
    () => ({ mode, isDark, colors, setMode }),
    [mode, isDark, colors, setMode],
  );

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
