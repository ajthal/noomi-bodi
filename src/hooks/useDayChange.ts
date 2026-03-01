import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Returns the local calendar date as YYYY-MM-DD.
 * Used as a lightweight day-boundary fingerprint.
 */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calls `onDayChange` whenever the local calendar date rolls over.
 *
 * Detection triggers:
 *  1. A 30-second interval while the app is in the foreground.
 *  2. App returning from background (AppState → "active").
 *
 * The callback fires at most once per new date.
 */
export function useDayChange(onDayChange: () => void): void {
  const lastDate = useRef(todayKey());

  useEffect(() => {
    const check = () => {
      const now = todayKey();
      if (now !== lastDate.current) {
        lastDate.current = now;
        onDayChange();
      }
    };

    const interval = setInterval(check, 30_000);

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') check();
    };
    const subscription = AppState.addEventListener('change', handleAppState);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [onDayChange]);
}
