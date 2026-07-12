/**
 * Shared newsletter client for the header-menu and footer forms:
 *  - EMAIL_PATTERN / isValidEmail: the "looks like an email" check both forms
 *    run locally before ever touching the network.
 *  - subscribeNewsletter: POSTs to the API and maps the response to a small
 *    result the caller can render as-is. It never throws — every failure
 *    path (bad input, rate limit, network, timeout, server error) resolves
 *    to `{ ok: false, message }` instead.
 */

const REQUEST_TIMEOUT_MS = 6000;
const GENERIC_ERROR_MESSAGE = "Couldn't reach the server — please try again.";

/** Same permissive email check used by both newsletter forms. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export type SubscribeResult = { ok: true } | { ok: false; message: string };

/** POST /api/newsletter with a ~6s timeout. Never throws. */
export async function subscribeNewsletter(email: string): Promise<SubscribeResult> {
  let timeoutId: number | undefined;

  try {
    const controller = new AbortController();
    timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const response = await fetch('/api/newsletter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });

    if (response.status === 201) return { ok: true };
    if (response.status === 400) return { ok: false, message: 'Please enter a valid email.' };
    if (response.status === 429) {
      return { ok: false, message: 'Too many attempts — try again in a minute.' };
    }
    // Any other status (5xx, or anything unexpected) collapses to the same
    // generic message — the caller doesn't need to distinguish.
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  } catch {
    // Network failure, or the AbortController firing on timeout.
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}
