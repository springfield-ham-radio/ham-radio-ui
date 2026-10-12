import type { RadioId } from '@springfield/ham-radio-api';
import { RadioModelId } from '@springfield/ham-radio-api';
import {
  defaultSerialLogFileName,
  SERIAL_LOG_FILE_KIND,
  SERIAL_LOG_FILE_VERSION,
  serializeSerialLogFile,
  serialLogEntryCount,
  type SerialLogDocument,
  type SerialLogOperation,
} from '~/utils/serial-log-file';

export interface CapturedSerialLogSnapshot {
  fileName: string;
  contents: string;
  entryCount: number;
  operation: SerialLogOperation;
  log: unknown;
}

/**
 * Build a session serial log snapshot from a driver log, or undefined when empty.
 */
export function snapshotFromDriverSerialLog(
  operation: SerialLogOperation,
  radioId: RadioId,
  serialPortPath: string,
  log: unknown,
): CapturedSerialLogSnapshot | undefined {
  const entryCount = serialLogEntryCount(log);

  if (entryCount === 0) {
    return undefined;
  }

  return {
    fileName: defaultSerialLogFileName(operation, radioId),
    contents: serializeSerialLogFile({
      operation,
      radioId,
      serialPortPath,
      log,
    }),
    entryCount,
    operation,
    log,
  };
}

/**
 * Apply a new driver capture to a session log without wiping a prior capture when the new one is empty.
 */
export function mergeSessionSerialLog(
  existing: CapturedSerialLogSnapshot | undefined,
  incoming: CapturedSerialLogSnapshot | undefined,
): CapturedSerialLogSnapshot | undefined {
  if (incoming) {
    return incoming;
  }

  return existing;
}

/**
 * When a write fails after a pre-write read, offer saving backup frames under a write log file name.
 */
function radioIdFromSerialLogDocument(document: SerialLogDocument): RadioId | undefined {
  if (!document.radioId) {
    return undefined;
  }

  return {
    model: RadioModelId(document.radioId.model),
    name: document.radioId.name,
    manufacturer: document.radioId.manufacturer,
  };
}

function parseSerialLogDocument(contents: string): SerialLogDocument | undefined {
  try {
    const parsed = JSON.parse(contents) as SerialLogDocument;

    if (parsed.kind !== SERIAL_LOG_FILE_KIND || parsed.version !== SERIAL_LOG_FILE_VERSION) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

export function serialLogForProgressSave(
  log: CapturedSerialLogSnapshot,
  progressKind: 'import' | 'write' | 'backup',
): CapturedSerialLogSnapshot {
  if (progressKind === 'write' && log.operation === 'import' && log.fileName.includes('-import-')) {
    const document = parseSerialLogDocument(log.contents);
    const radioId = document ? radioIdFromSerialLogDocument(document) : undefined;
    const fileName = log.fileName.replace('-import-', '-write-');

    return {
      ...log,
      fileName,
      operation: 'write',
      contents: serializeSerialLogFile({
        operation: 'write',
        radioId,
        serialPortPath: document?.serialPortPath,
        log: log.log,
      }),
    };
  }

  return log;
}
