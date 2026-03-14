/**
 * Generic retry wrapper with exponential backoff for transient failures.
 */

interface RetryOptions {
  maxRetries?: number;
  /** Initial delay in ms (doubled each retry). */
  baseDelay?: number;
  /** Return true if the error is retryable. Defaults to status-based check. */
  shouldRetry?: (err: unknown) => boolean;
}

function defaultShouldRetry(err: unknown): boolean {
  const status: number | undefined =
    (err as any)?.response?.status ?? (err as any)?.status;
  if (status === 429 || status === 529 || (status && status >= 500)) return true;
  const msg = String((err as any)?.message ?? '').toLowerCase();
  return msg.includes('overloaded') || msg.includes('rate limit') || msg.includes('timeout');
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelay = options?.baseDelay ?? 1000;
  const shouldRetry = options?.shouldRetry ?? defaultShouldRetry;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && shouldRetry(err)) {
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
