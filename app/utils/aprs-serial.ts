import { TauriNodeSerialPort } from '~/utils/tauri-node-serial-port';
import type { AprsBytePort } from '~/utils/aprs-session';
import { aprsHostSerialOpenOptions, aprsSerialOpenOptions } from '~/utils/aprs-serial-options';

const OPEN_TIMEOUT_MS = 5000;

/**
 * Open the COM-port feed for receive only.
 *
 * The returned port cannot write. RTS and DTR are passed as false, which
 * `TauriNodeSerialPort` applies after open and again on a baud change.
 */
export async function openAprsReceivePort(path: string, baudRate: number): Promise<AprsBytePort> {
  const options = aprsSerialOpenOptions(path, baudRate);
  const port = new TauriNodeSerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    stopBits: options.stopBits,
    parity: options.parity,
    rtscts: false,
    flowControl: 'none',
    rts: false,
    dtr: false,
  });
  const queued: Uint8Array[] = [];
  let dataListener: ((chunk: Uint8Array) => void) | undefined;
  let errorListener: ((error: Error) => void) | undefined;

  const onData = (chunk: Uint8Array): void => {
    if (dataListener) {
      dataListener(chunk);
      return;
    }

    queued.push(chunk);
  };

  const onError = (cause: Error): void => {
    errorListener?.(cause);
  };

  port.on('data', onData);
  port.on('error', onError);
  await waitForAprsPort(port);

  return {
    get isOpen() {
      return port.isOpen;
    },
    on(event, handler) {
      if (event === 'data') {
        dataListener = handler as (chunk: Uint8Array) => void;

        for (const chunk of queued.splice(0)) {
          dataListener(chunk);
        }

        return;
      }

      errorListener = handler as (error: Error) => void;
    },
    off(event) {
      if (event === 'data') {
        dataListener = undefined;
        return;
      }

      errorListener = undefined;
    },
    close() {
      port.off('data', onData);
      port.off('error', onError);
      return new Promise<void>((resolve, reject) => {
        port.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

/**
 * Open the COM port for host KISS.
 *
 * The returned object can write. Callers must not write on connect.
 * Software flow control follows the TNC `XFLOW` default. RTS and DTR stay low.
 */
export async function openAprsHostPort(path: string, baudRate: number): Promise<AprsBytePort & { write(bytes: Uint8Array): void }> {
  const options = aprsHostSerialOpenOptions(path, baudRate);
  const port = new TauriNodeSerialPort({
    path: options.path,
    baudRate: options.baudRate,
    dataBits: options.dataBits,
    stopBits: options.stopBits,
    parity: options.parity,
    flowControl: options.flowControl,
    rts: false,
    dtr: false,
    retainIncoming: true,
  });
  const queued: Uint8Array[] = [];
  let dataListener: ((chunk: Uint8Array) => void) | undefined;
  let errorListener: ((error: Error) => void) | undefined;

  const onData = (chunk: Uint8Array): void => {
    if (dataListener) {
      dataListener(chunk);
      return;
    }

    queued.push(chunk);
  };

  const onError = (cause: Error): void => {
    errorListener?.(cause);
  };

  port.on('data', onData);
  port.on('error', onError);
  await waitForAprsPort(port);

  return {
    get isOpen() {
      return port.isOpen;
    },
    on(event, handler) {
      if (event === 'data') {
        dataListener = handler as (chunk: Uint8Array) => void;

        for (const chunk of queued.splice(0)) {
          dataListener(chunk);
        }

        return;
      }

      errorListener = handler as (error: Error) => void;
    },
    off(event) {
      if (event === 'data') {
        dataListener = undefined;
        return;
      }

      errorListener = undefined;
    },
    write(bytes) {
      port.write(bytes);
    },
    close() {
      port.off('data', onData);
      port.off('error', onError);
      return new Promise<void>((resolve, reject) => {
        port.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

function waitForAprsPort(port: TauriNodeSerialPort): Promise<void> {
  if (port.isOpen) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out opening the COM port'));
    }, OPEN_TIMEOUT_MS);

    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = (...args: unknown[]) => {
      cleanup();
      const cause = args[0];
      reject(cause instanceof Error ? cause : new Error(String(cause)));
    };

    const cleanup = () => {
      clearTimeout(timer);
      port.off('open', onOpen);
      port.off('error', onError);
    };

    port.on('open', onOpen);
    port.on('error', onError);
  });
}
