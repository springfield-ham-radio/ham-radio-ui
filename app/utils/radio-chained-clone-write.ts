import type { Radio, RadioProgressIndicator, RadioProtocolStep } from '@springfield/ham-radio-api';
import type { ILogLayer } from 'loglayer';
import { ProtocolInterpreter } from '@springfield/ham-radio-driver/dist/protocol-interpreter.js';
import { SerialLogger, createLoggingSerialPort } from '@springfield/ham-radio-driver/dist/utils/serial-logger.js';
import { SerialPort } from 'serialport';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PostPrewriteBackupWriteError } from '~/utils/radio-prewrite-backup-write';

function totalMemoryBytes(radio: Radio): number {
  return Object.values(radio.memoryConfig.segments).reduce(
    (sum, segment) => sum + (segment.endAddress - segment.startAddress + 1),
    0,
  );
}

/** Final clone step that sends `E` and makes the radio leave programming mode. */
export function isLeaveProgrammingModeStep(step: RadioProtocolStep): boolean {
  if (!('send' in step) || !Array.isArray(step.send)) {
    return false;
  }

  return step.send.length === 1 && step.send[0] === 'E';
}

export function readMemoryStepsWithoutProgrammingExit(steps: RadioProtocolStep[]): RadioProtocolStep[] {
  if (steps.length === 0) {
    return steps;
  }

  const last = steps[steps.length - 1]!;

  if (isLeaveProgrammingModeStep(last)) {
    return steps.slice(0, -1);
  }

  return steps;
}

/** Write steps that can run while the clone session is still open after a backup read. */
export function writeMemoryStepsFromCloneBody(steps: RadioProtocolStep[]): RadioProtocolStep[] {
  const writeIndex = steps.findIndex((step) => 'write' in step);

  if (writeIndex === -1) {
    return steps;
  }

  return steps.slice(writeIndex);
}

/**
 * True when a pre-write backup read and the following write can share one open port
 * (skip programming-mode exit between them).
 */
export function supportsChainedPrewriteBackupWrite(radio: Radio): boolean {
  if (!radio.readMemory?.length || !radio.writeMemory?.length) {
    return false;
  }

  const lastRead = radio.readMemory[radio.readMemory.length - 1]!;

  if (!isLeaveProgrammingModeStep(lastRead)) {
    return false;
  }

  return radio.writeMemory.some((step) => 'write' in step);
}

async function connectSerialPort(radio: Radio, serialPortPath: string): Promise<SerialPort> {
  const { baudRate, dataBits = 8, stopBits = 1, parity = 'none', rtscts = false, rts, dtr } = radio.serialConfig;

  const port = new SerialPort({
    path: serialPortPath,
    baudRate,
    dataBits,
    stopBits,
    parity,
    rtscts,
    rts,
    dtr,
  });

  return new Promise((resolve, reject) => {
    port.on('open', () => resolve(port));
    port.on('error', (error: Error) => reject(error));
  });
}

function createSerialLogger(): SerialLogger {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFilePath = join(homedir(), 'Documents', `ham-radio-serial-${timestamp}.json`);
  return new SerialLogger(logFilePath);
}

export interface ChainedPrewriteBackupAndWriteOptions {
  radio: Radio;
  serialPortPath: string;
  writeData: Uint8Array;
  progressIndicator: RadioProgressIndicator;
  logger: ILogLayer;
  enableSerialLogging: boolean;
  /** Persist the backup image before the write phase begins on the open port. */
  onBackupImageReady: (image: Uint8Array) => Promise<void>;
  onWritePhaseStart?: () => void;
}

/**
 * Read the radio for backup without sending programming-mode exit, save the backup,
 * then write on the same serial session.
 */
export async function chainedPrewriteBackupAndWrite(
  options: ChainedPrewriteBackupAndWriteOptions,
): Promise<SerialLogger | undefined> {
  const { radio, serialPortPath, writeData, progressIndicator, logger, enableSerialLogging } = options;
  let port: SerialPort | undefined;
  let serialLogger: SerialLogger | undefined;
  let backupPersisted = false;

  try {
    port = await connectSerialPort(radio, serialPortPath);

    if (enableSerialLogging) {
      serialLogger = createSerialLogger();
      port = createLoggingSerialPort(port, serialLogger);
    }

    const backupBuffer = new Uint8Array(totalMemoryBytes(radio));
    const context = {
      bufferOffset: 0,
      logger,
      memoryBuffer: backupBuffer,
      memoryConfig: radio.memoryConfig,
      port,
      variables: new Map<string, unknown>(),
      progressIndicator,
    };

    const interpreter = new ProtocolInterpreter(context);
    const readSteps = readMemoryStepsWithoutProgrammingExit(radio.readMemory);
    await interpreter.executeProtocol({ ...radio, readMemory: readSteps }, 'readMemory', backupBuffer);

    await options.onBackupImageReady(backupBuffer.slice());
    backupPersisted = true;
    options.onWritePhaseStart?.();

    context.memoryBuffer = writeData;
    context.bufferOffset = 0;
    const writeSteps = writeMemoryStepsFromCloneBody(radio.writeMemory);
    await interpreter.executeProtocol({ ...radio, writeMemory: writeSteps }, 'writeMemory', writeData);
  } catch (error) {
    if (backupPersisted) {
      const cause = error instanceof Error ? error : new Error(String(error));
      throw new PostPrewriteBackupWriteError(cause);
    }

    throw error;
  } finally {
    if (port?.isOpen) {
      port.close();
    }

    serialLogger?.close();
  }

  return serialLogger;
}
