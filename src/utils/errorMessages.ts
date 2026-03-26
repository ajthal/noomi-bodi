/**
 * Centralized error-to-message mapping for user-facing error display.
 * Also exports the shared `isNetworkError` helper (previously duplicated
 * in mealLog.ts and offlineStore.ts).
 */

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as any)?.message ?? err).toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('aborterror') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('failed to fetch')
  );
}

export function getUserFriendlyError(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.';

  // Network / connectivity
  if (isNetworkError(err)) {
    return 'Unable to connect. Check your internet connection and try again.';
  }

  const msg = String((err as any)?.message ?? '').toLowerCase();
  const status: number | undefined =
    (err as any)?.response?.status ??
    (err as any)?.status ??
    (err as any)?.statusCode;
  const code: string | undefined =
    (err as any)?.code ?? (err as any)?.error?.code;

  // ── Supabase PostgrestError codes ────────────────────────────────
  if (code) {
    if (code === '23505') return 'This already exists. Please use a different value.';
    if (code === '42501') return 'You don\u2019t have permission to do that.';
    if (code === '23503') return 'This item is referenced elsewhere and can\u2019t be removed.';
    if (code.startsWith('PGRST')) return 'A database error occurred. Please try again.';
  }

  // ── HTTP status codes ────────────────────────────────────────────
  if (status) {
    if (status === 401) return 'Your session has expired. Please sign in again.';
    if (status === 403) return 'You don\u2019t have permission to do that.';
    if (status === 404) return 'The requested item was not found.';
    if (status === 409) return 'A conflict occurred. Please refresh and try again.';
    if (status === 413) return 'The file is too large. Please use a smaller file.';
    if (status === 429) return 'Too many requests. Please wait a moment and try again.';
    if (status >= 500 && status < 600) return 'The server is having issues. Please try again shortly.';
  }

  // ── Claude / Anthropic API errors ────────────────────────────────
  if (msg.includes('rate limit') || msg.includes('rate_limit'))
    return 'AI rate limit reached. Please wait a moment and try again.';
  if (msg.includes('overloaded') || msg.includes('529'))
    return 'The AI service is busy right now. Please try again in a few seconds.';
  if (msg.includes('invalid api key') || msg.includes('invalid x-api-key') || msg.includes('authentication_error'))
    return 'Your API key is invalid. Please check it in Settings.';
  if (msg.includes('credit') || msg.includes('billing'))
    return 'Your AI account has a billing issue. Please check your Anthropic account.';

  // ── Auth errors ──────────────────────────────────────────────────
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials'))
    return 'Incorrect email or password. Please try again.';
  if (msg.includes('email already') || msg.includes('user already registered'))
    return 'An account with this email already exists. Try signing in instead.';
  if (msg.includes('weak password') || msg.includes('password should be'))
    return 'Password is too weak. Use at least 6 characters.';
  if (msg.includes('email not confirmed'))
    return 'Please verify your email before signing in.';
  if (msg.includes('refresh_token'))
    return 'Your session has expired. Please sign in again.';

  // ── Storage / upload errors ──────────────────────────────────────
  if (msg.includes('payload too large') || msg.includes('file size'))
    return 'The file is too large. Please use a smaller image.';

  // ── Fallback ─────────────────────────────────────────────────────
  return 'Something went wrong. Please try again.';
}
