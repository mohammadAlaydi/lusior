/*
 * Submission persistence (repository pattern).
 *
 * Handlers depend on the `SubmissionRepository` interface, not on the storage
 * mechanism, so the file backend can be swapped for a DB later without touching
 * routes. `FileSubmissionRepository` appends one JSON object per line
 * (JSON Lines) to its configured submission directory, creating the directory
 * on first use. Each record is timestamped and tagged with its kind; only
 * already-validated fields are stored.
 */

import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { access, mkdir, open, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

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
  /** Assert that the backing store can accept writes without storing a lead. */
  checkWritable(): Promise<void>;
}

/**
 * Appends validated submissions as JSON Lines. The data directory is created
 * lazily and idempotently (`recursive: true`), so a fresh checkout works with
 * no setup step.
 */
export class FileSubmissionRepository implements SubmissionRepository {
  private readonly dataDir: string;
  private ensured = false;

  constructor(dataDir: string) {
    // Resolve once so the containment check below is stable even if callers
    // supply a relative path. The application resolver provides an absolute
    // path for production wiring.
    this.dataDir = resolve(dataDir);
  }

  private async ensureDir(): Promise<void> {
    if (this.ensured) {
      return;
    }
    await mkdir(this.dataDir, { recursive: true });
    this.ensured = true;
  }

  /**
   * Readiness probe used by `/api/ready`. A write/fsync/delete cycle exercises
   * the configured mount without creating a submission record or leaking its
   * filesystem path in the HTTP response.
   */
  async checkWritable(): Promise<void> {
    await this.ensureDir();
    await access(this.dataDir, constants.W_OK);

    const probePath = join(this.dataDir, `.ready-${process.pid}-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(probePath, 'wx', 0o600);
      // A real write + fsync catches read-only mounts, exhausted quotas and
      // other failures that a permission-bit check alone can miss. This is a
      // fixed probe marker, never visitor/user data.
      await handle.writeFile('ready');
      await handle.sync();
    } finally {
      if (handle) {
        await handle.close();
        // If cleanup fails, readiness should fail too: leaving probe files behind
        // would make the storage unhealthy even if writes currently succeed.
        await unlink(probePath);
      }
    }
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
    // Submission volume is low, so acknowledge only after the append reaches
    // the filesystem. Owner-only creation protects PII even when the host's
    // default umask is permissive; existing files keep their operator-managed
    // mode. O_APPEND prevents concurrent requests from racing on a shared file
    // offset in this single-process release.
    const handle = await open(target, 'a', 0o600);
    try {
      await handle.appendFile(line, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
