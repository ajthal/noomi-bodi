/**
 * Generic retry wrapper with smart backoff for transient failures.
 *
 * Rate-limit (429) handling:
 * - Uses the `retry-after` header from the API response to determine wait time
 * - Only retries once for 429s (retrying more compounds the problem)
 * - Minimum 5s, maximum 60s wait for rate limits
 *
 * Server errors (5xx, 529):
 * - Exponential backoff (1s → 2s → 4s) with up to 2 retries
 */

interface RetryOptions {
  maxRetries?: number;
  /** Initial delay in ms (doubled each retry). */
  baseDelay?: number;
  /** Return true if the error is retryable. Defaults to status-based check. */
  shouldRetry?: (err: unknown) => boolean;
  /** Called when a retry is about to happen. Useful for surfacing delay info to the UI. */
  onRetry?: (attempt: number, delayMs: number, reason: string) => void;
}

function getStatusCode(err: unknown): number | undefined {
  return (err as any)?.response?.status ?? (err as any)?.status;
}

function getRetryAfterMs(err: unknown): number | null {
  const retryAfter = (err as any)?.response?.headers?.['retry-after'];
  if (retryAfter == null) return null;
  const seconds = parseFloat(retryAfter);
  if (isNaN(seconds) || seconds <= 0) return null;
  // Clamp between 5s and 60s
  return Math.min(60_000, Math.max(5_000, Math.ceil(seconds * 1000)));
}

function defaultShouldRetry(err: unknown): boolean {
  const status = getStatusCode(err);
  if (status === 429 || status === 529 || (status && status >= 500)) return true;
  const msg = String((err as any)?.message ?? '').toLowerCase();
  return msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('timeout');
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const baseMaxRetries = options?.maxRetries ?? 2;
  const baseDelay = options?.baseDelay ?? 1000;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;
  const onRetry = options?.onRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= baseMaxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const status = getStatusCode(err);
      const isRateLimit = status === 429;

      // For 429s: max 1 retry, use retry-after header
      if (isRateLimit) {
        if (attempt >= 1) throw err; // Already retried once for rate limits
        const retryAfterMs = getRetryAfterMs(err) ?? 10_000; // Default 10s if no header
        onRetry?.(attempt, retryAfterMs, 'rate_limit');
        console.log(`[Retry] Rate limited (429). Waiting ${retryAfterMs}ms (retry-after header).`);
        await new Promise(r => setTimeout(r, retryAfterMs));
        continue;
      }

      // For other retryable errors: exponential backoff
      if (attempt < baseMaxRetries && shouldRetry(err)) {
        const delay = baseDelay * Math.pow(2, attempt);
        onRetry?.(attempt, delay, 'server_error');
        console.log(`[Retry] Attempt ${attempt + 1}/${baseMaxRetries} after ${delay}ms (status=${status}).`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw err;
    }
  }
  throw lastError;
}
