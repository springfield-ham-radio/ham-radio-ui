import { TauriNodeSerialPort } from '~/utils/tauri-node-serial-port';
import type { CatTransport } from '~/utils/kenwood-cat-session';
import { KENWOOD_CAT_CR } from '~/utils/kenwood-cat-control';
import type { RadioSerialConfig } from '@springfield/ham-radio-api';

const OPEN_TIMEOUT_MS = 5000;

/**
 * Open a Kenwood CAT serial session using the radio's programming-port settings.
 */
export async function openKenwoodCatSerialTransport(
  path: string,
  serialConfig: RadioSerialConfig,
  baudRate: number,
): Promise<CatTransport> {
  const port = new TauriNodeSerialPort({
    path,
    baudRate,
    dataBits: serialConfig.dataBits,
    stopBits: serialConfig.stopBits === 2 ? 2 : 1,
    parity: serialConfig.parity,
    rtscts: serialConfig.rtscts,
    rts: serialConfig.rts,
    dtr: serialConfig.dtr,
  });

  await waitForPortOpen(port);

  return new KenwoodCatSerialTransport(port);
}

function waitForPortOpen(port: TauriNodeSerialPort): Promise<void> {
  if (port.isOpen) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out opening the CAT serial port'));
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

class KenwoodCatSerialTransport implements CatTransport {
  private buffer = Buffer.alloc(0);
  private readonly waiters: Array<{
    resolve: (line: string) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(private readonly port: TauriNodeSerialPort) {
    this.port.on('data', this.onData);
  }

  async write(bytes: Uint8Array): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.port.write(bytes, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  async readLine(timeoutMs: number): Promise<string> {
    const buffered = this.takeLine();

    if (buffered !== undefined) {
      return buffered;
    }

    return new Promise<string>((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);

          if (index >= 0) {
            this.waiters.splice(index, 1);
          }

          reject(new Error('CAT reply timed out'));
        }, timeoutMs),
      };

      this.waiters.push(waiter);
    });
  }

  async close(): Promise<void> {
    this.port.off('data', this.onData);

    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();

      if (!waiter) {
        break;
      }

      clearTimeout(waiter.timer);
      waiter.reject(new Error('CAT port closed'));
    }

    await new Promise<void>((resolve, reject) => {
      this.port.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private readonly onData = (...args: unknown[]): void => {
    const chunk = args[0];

    if (!Buffer.isBuffer(chunk) && !(chunk instanceof Uint8Array)) {
      return;
    }

    this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    this.flushWaiters();
  };

  private flushWaiters(): void {
    while (this.waiters.length > 0) {
      const line = this.takeLine();

      if (line === undefined) {
        return;
      }

      const waiter = this.waiters.shift();

      if (!waiter) {
        return;
      }

      clearTimeout(waiter.timer);
      waiter.resolve(line);
    }
  }

  private takeLine(): string | undefined {
    const delimiter = this.buffer.indexOf(KENWOOD_CAT_CR);

    if (delimiter < 0) {
      return undefined;
    }

    const line = this.buffer.subarray(0, delimiter).toString('ascii').replace(/\n/g, '');
    this.buffer = this.buffer.subarray(delimiter + 1);
    return line;
  }
}
