import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** Thin wrapper around NetInfo that exposes reactive online/offline state. */
export function useNetworkStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
    });
    return unsubscribe;
  }, []);

  return { isOnline };
}
