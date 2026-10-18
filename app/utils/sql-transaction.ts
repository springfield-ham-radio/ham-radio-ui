import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

export interface SqlStatement {
  sql: string;
  values: unknown[];
}

/** Runs one statement, either against the open database or a recorded batch. */
export interface SqlExecutor {
  execute(sql: string, values?: unknown[]): Promise<unknown>;
}

export function recordingSqlExecutor(statements: SqlStatement[]): SqlExecutor {
  return {
    async execute(sql: string, values: unknown[] = []): Promise<void> {
      statements.push({ sql, values });
    },
  };
}

/**
 * Run statements on one SQLite connection.
 * A failure rolls the whole batch back in the desktop command.
 */
export async function commitSqlTransaction(statements: readonly SqlStatement[]): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  if (!isTauriRuntime()) {
    throw new Error('The channel library requires the Tauri desktop app. Run yarn tauri:dev.');
  }

  await invoke('execute_sqlite_transaction', { statements: [...statements] });
}
