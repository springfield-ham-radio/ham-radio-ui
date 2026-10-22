/** Thrown when the pre-write backup was saved but the following write did not complete. */
export class PostPrewriteBackupWriteError extends Error {
  readonly backupSavedBeforeWrite = true;

  constructor(cause: Error) {
    super(
      `The pre-write backup was saved, but the radio was not written. ${cause.message}`,
    );
    this.name = 'PostPrewriteBackupWriteError';
    this.cause = cause;
  }
}

export function isPostPrewriteBackupWriteError(error: unknown): boolean {
  return error instanceof PostPrewriteBackupWriteError || (error instanceof Error && error.name === 'PostPrewriteBackupWriteError');
}
