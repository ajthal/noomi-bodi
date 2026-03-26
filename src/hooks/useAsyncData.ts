import { useState, useEffect, useCallback, useRef } from 'react';
import { getUserFriendlyError } from '../utils/errorMessages';

interface UseAsyncDataOptions<T> {
  deps?: any[];
  initialData?: T;
  /** If true, don't fetch on mount — caller will trigger manually via refresh(). */
  manual?: boolean;
}

interface UseAsyncDataResult<T> {
  data: T | undefined;
  /** True only on first load (no data yet). */
  loading: boolean;
  error: string | null;
  /** Call to re-fetch (used for pull-to-refresh and retry). */
  refresh: () => Promise<void>;
  /** True while a refresh is in flight (data already exists). */
  refreshing: boolean;
}

export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  options?: UseAsyncDataOptions<T>,
): UseAsyncDataResult<T> {
  const deps = options?.deps ?? [];
  const [data, setData] = useState<T | undefined>(options?.initialData);
  const [loading, setLoading] = useState(!options?.manual);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(getUserFriendlyError(err));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  useEffect(() => {
    if (!options?.manual) {
      fetchData(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => fetchData(!!data), [fetchData, data]);

  return { data, loading, error, refresh, refreshing };
}
