import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { flushQueue, getQueue } from '../services/offlineStore';

interface OfflineSyncResult {
  isOnline: boolean;
  pendingCount: number;
  syncNow: () => Promise<void>;
}

/**
 * Root-level hook that monitors connectivity and flushes the offline
 * write queue whenever the device comes back online.
 *
 * @param onSynced Optional callback fired after a successful flush
 *                 so screens can refresh their data.
 */
export function useOfflineSync(onSynced?: () => void): OfflineSyncResult {
  const { isOnline } = useNetworkStatus();
  const wasOffline = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const q = await getQueue();
    setPendingCount(q.length);
  }, []);

  const syncNow = useCallback(async () => {
    const { synced } = await flushQueue();
    await refreshPendingCount();
    if (synced > 0) onSynced?.();
  }, [onSynced, refreshPendingCount]);

  // Flush when transitioning from offline → online
  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      syncNow();
    }
  }, [isOnline, syncNow]);

  // Check queue size on mount and whenever online state changes
  useEffect(() => {
    refreshPendingCount();
  }, [isOnline, refreshPendingCount]);

  return { isOnline, pendingCount, syncNow };
}
