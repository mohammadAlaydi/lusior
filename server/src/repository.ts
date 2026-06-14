/*
 * Submission persistence (repository pattern).
 *
 * Handlers depend on the `SubmissionRepository` interface, not on the storage
 * mechanism, so the file backend can be swapped for a DB later without touching
 * routes. `FileSubmissionRepository` appends one JSON object per line
 * (JSON Lines) to `server/data/<kind>.jsonl`, creating the directory on first
 * use. Each record is timestamped and tagged with its kind; only already-
 * validated fields are stored.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ContactInput, NewsletterInput } from './validation.js';

/** The two form kinds we persist; also used as the `.jsonl` file name. */
export type SubmissionKind = 'newsletter' | 'contact';

/** Validated payload union — never raw request bodies. */
export type SubmissionFields = NewsletterInput | ContactInput;

/** One persisted record: provenance metadata plus the validated fields. */
export interface StoredSubmission {
  kind: SubmissionKind;
  /** ISO-8601 capture time. */
  timestamp: string;
  fields: SubmissionFields;
}

export interface SubmissionRepository {
  save(kind: SubmissionKind, fields: SubmissionFields): Promise<void>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** server/src/repository.ts -> server/data */
const DEFAULT_DATA_DIR = join(HERE, '..', 'data');

/**
 * Appends validated submissions as JSON Lines. The data directory is created
 * lazily and idempotently (`recursive: true`), so a fresh checkout works with
 * no setup step.
 */
export class FileSubmissionRepository implements SubmissionRepository {
  private readonly dataDir: string;
  private ensured = false;

  constructor(dataDir: string = DEFAULT_DATA_DIR) {
    this.dataDir = dataDir;
  }

  private async ensureDir(): Promise<void> {
    if (this.ensured) {
      return;
    }
    await mkdir(this.dataDir, { recursive: true });
    this.ensured = true;
  }

  async save(kind: SubmissionKind, fields: SubmissionFields): Promise<void> {
    await this.ensureDir();
    const record: StoredSubmission = {
      kind,
      timestamp: new Date().toISOString(),
      fields,
    };
    const line = `${JSON.stringify(record)}\n`;
    // Belt-and-suspenders: even though `kind` is a typed union, assert the
    // resolved path stays inside the data dir before writing.
    const target = resolve(this.dataDir, `${kind}.jsonl`);
    if (!target.startsWith(resolve(this.dataDir) + sep)) {
      throw new Error('Path traversal detected');
    }
    await appendFile(target, line, 'utf8');
  }
}
