/*
 * Request-body validation for the form endpoints.
 *
 * Zod schemas are the single boundary between untrusted client input and the
 * repository. Handlers call `parseNewsletter`/`parseContact`, which return a
 * discriminated result: either the cleaned, typed fields or a flat list of
 * issues. We deliberately never echo the raw input back to the client — only a
 * generic message and (optionally) field names — so a malicious payload can't be
 * reflected.
 */

import { z } from 'zod';

/** Max lengths keep persisted lines bounded and block trivial flooding. */
const MAX_EMAIL = 254; // RFC 5321 practical maximum
const MAX_NAME = 120;
const MAX_MESSAGE = 4000;

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(MAX_EMAIL, 'Email is too long')
  .email('Email is invalid');

export const newsletterSchema = z.object({
  email: emailSchema,
});

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(MAX_NAME, 'Name is too long'),
  email: emailSchema,
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(MAX_MESSAGE, 'Message is too long'),
});

/** Cleaned, typed payloads inferred straight from the schemas. */
export type NewsletterInput = z.infer<typeof newsletterSchema>;
export type ContactInput = z.infer<typeof contactSchema>;

/** Successful parse carries the sanitized value; failure carries field names. */
export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: string[] };

/**
 * Run a schema over unknown input. On failure we surface only the offending
 * field paths (never the raw values) so the caller can return a safe 400.
 */
function parseWith<T>(schema: z.ZodType<T>, input: unknown): ParseResult<T> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const fields = Array.from(
    new Set(result.error.issues.map((issue) => issue.path.join('.') || 'body')),
  );
  return { ok: false, fields };
}

export function parseNewsletter(input: unknown): ParseResult<NewsletterInput> {
  return parseWith(newsletterSchema, input);
}

export function parseContact(input: unknown): ParseResult<ContactInput> {
  return parseWith(contactSchema, input);
}
