import type { RadioId } from '@springfield/ham-radio-api';

export const SERIAL_LOG_FILE_KIND = 'springfield-ham-radio-serial-log';
export const SERIAL_LOG_FILE_VERSION = 1;

export type SerialLogOperation = 'import' | 'write';

export interface SerialLogDocument {
  kind: typeof SERIAL_LOG_FILE_KIND;
  version: typeof SERIAL_LOG_FILE_VERSION;
  operation: SerialLogOperation;
  serialPortPath?: string;
  radioId?: {
    model: string;
    name: string;
    manufacturer: string;
  };
  log: unknown;
}

/**
 * Suggested file name for a captured serial I/O log.
 */
export function defaultSerialLogFileName(
  operation: SerialLogOperation,
  radioId: Pick<RadioId, 'model'> | undefined,
  timestamp = new Date(),
): string {
  const stamp = timestamp.toISOString().replace(/[:.]/g, '-');
  const model = radioId ? String(radioId.model) : 'radio';
  return `${model}-${operation}-serial-${stamp}.json`;
}

/**
 * Serialize a driver serial log together with the transfer that produced it.
 */
export function serializeSerialLogFile(input: {
  operation: SerialLogOperation;
  radioId?: RadioId;
  serialPortPath?: string;
  log: unknown;
}): string {
  const document: SerialLogDocument = {
    kind: SERIAL_LOG_FILE_KIND,
    version: SERIAL_LOG_FILE_VERSION,
    operation: input.operation,
    serialPortPath: input.serialPortPath,
    log: input.log,
  };

  if (input.radioId) {
    document.radioId = {
      model: String(input.radioId.model),
      name: input.radioId.name,
      manufacturer: input.radioId.manufacturer,
    };
  }

  return `${JSON.stringify(document, null, 2)}\n`;
}

export function serialLogEntryCount(log: unknown): number {
  if (!isRecord(log) || !Array.isArray(log.entries)) {
    return 0;
  }

  return log.entries.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
