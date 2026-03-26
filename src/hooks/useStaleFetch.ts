import { useRef, useCallback } from 'react';

/**
 * Wraps a fetch function with a staleness guard so it only re-fetches when
 * the data is older than `staleTimeMs`. Used on tab-focus effects to avoid
 * re-loading data on every single tab switch.
 *
 * - `fetchIfStale` — call on focus; skips if data is fresh
 * - `forceFetch`   — call on pull-to-refresh; always re-fetches
 * - `markStale`    — call after mutations or cross-screen invalidation
 */
export function useStaleFetch(
  fetchFn: (isRefresh: boolean) => Promise<void>,
  staleTimeMs: number = 30_000,
) {
  const lastFetchedAt = useRef<number>(0);

  const fetchIfStale = useCallback(async () => {
    const now = Date.now();
    const elapsed = now - lastFetchedAt.current;
    const isFirstLoad = lastFetchedAt.current === 0;

    if (!isFirstLoad && elapsed < staleTimeMs) return;

    lastFetchedAt.current = now;
    await fetchFn(isFirstLoad ? false : true);
  }, [fetchFn, staleTimeMs]);

  const forceFetch = useCallback(async () => {
    lastFetchedAt.current = Date.now();
    await fetchFn(true);
  }, [fetchFn]);

  const markStale = useCallback(() => {
    lastFetchedAt.current = 0;
  }, []);

  return { fetchIfStale, forceFetch, markStale };
}
