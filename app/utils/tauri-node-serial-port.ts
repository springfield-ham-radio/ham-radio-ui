import { EventEmitter } from './event-emitter';
import {
  ClearBuffer,
  DataBits,
  FlowControl,
  Parity,
  SerialPort as TauriSerialPort,
  StopBits,
  type SerialportOptions,
  type WatchHandle,
} from 'tauri-plugin-serialplugin-api';
import { trackSerialPathClose, waitForSerialPathClose } from '~/utils/serial-port-path-close';
import {
  formatSerialPortOpenError,
  isPortMissingError,
  isSerialPortPathAvailable,
  waitForSerialPortPathAvailable,
} from '~/utils/serial-port-reconnect';

type WriteCallback = (error?: Error | null) => void;
type PipedDestination = { write: (chunk: Buffer) => unknown };
type UpdateOptions = { baudRate?: number };

/**
 * `tauri-plugin-serialplugin` coalesces RX into Channel events after this many
 * milliseconds (`watch` `serialDataFlushIntervalMs`). The plugin default is
 * 200 ms, which serializes every clone round-trip. 1 ms is the minimum we
 * request so replies reach the protocol parser as soon as the hub wakes.
 */
const SERIAL_LISTENER_FLUSH_MS = 1;

/**
 * Programming cables power the radio interface from DTR/RTS. The first Windows
 * open often frames that edge as a 0x00, which a UV-5R handshake will treat as
 * its ACK. Wait for the edge to finish, then drop anything already received.
 */
const SERIAL_OPEN_SETTLE_MS = 300;
const SERIAL_OPEN_DRAIN_MS = 20;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function toDataBits(value: number | undefined): DataBits {
  switch (value) {
    case 5:
      return DataBits.Five;
    case 6:
      return DataBits.Six;
    case 7:
      return DataBits.Seven;
    default:
      return DataBits.Eight;
  }
}

function toStopBits(value: number | undefined): StopBits {
  return value === 2 ? StopBits.Two : StopBits.One;
}

function toParity(value: string | undefined): Parity {
  if (value === 'odd') {
    return Parity.Odd;
  }

  if (value === 'even') {
    return Parity.Even;
  }

  return Parity.None;
}

function toBytes(data: Uint8Array | Buffer | number[] | string): Uint8Array {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data);
  }

  if (data instanceof Uint8Array) {
    return data;
  }

  return Uint8Array.from(data);
}

/**
 * Node-serialport compatible wrapper around tauri-plugin-serialplugin.
 *
 * ham-radio-driver expects an EventEmitter with pipe/write/close/isOpen/update.
 */
export class TauriNodeSerialPort extends EventEmitter {
  isOpen = false;

  private readonly path: string;
  private readonly tauriPort: TauriSerialPort;
  private readonly rts: boolean;
  private readonly dtr: boolean;
  private watchHandle: WatchHandle | undefined;
  private pipedDestination: PipedDestination | undefined;
  private pipedHandler: ((chunk: Buffer) => void) | undefined;
  private discardRx = false;
  private openGeneration = 0;

  constructor(options: {
    path: string;
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: string;
    rtscts?: boolean;
    rts?: boolean;
    dtr?: boolean;
  }) {
    super();

    this.path = options.path;
    this.rts = options.rts ?? true;
    this.dtr = options.dtr ?? true;

    const serialOptions: SerialportOptions = {
      path: options.path,
      baudRate: options.baudRate,
      dataBits: toDataBits(options.dataBits),
      stopBits: toStopBits(options.stopBits),
      parity: toParity(options.parity),
      flowControl: options.rtscts ? FlowControl.Hardware : FlowControl.None,
      serialDataFlushIntervalMs: SERIAL_LISTENER_FLUSH_MS,
    };

    this.tauriPort = new TauriSerialPort(serialOptions);
    void this.openPort();
  }

  pipe<T extends PipedDestination>(destination: T): T {
    this.unpipe();

    const handler = (chunk: Buffer) => {
      destination.write(chunk);
    };

    this.pipedDestination = destination;
    this.pipedHandler = handler;
    this.on('data', handler);
    return destination;
  }

  unpipe<T extends PipedDestination>(destination?: T): this {
    if (!this.pipedHandler) {
      return this;
    }

    if (destination !== undefined && destination !== this.pipedDestination) {
      return this;
    }

    this.off('data', this.pipedHandler);
    this.pipedHandler = undefined;
    this.pipedDestination = undefined;
    return this;
  }

  write(data: Uint8Array | Buffer | number[] | string, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean {
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;

    void this.tauriPort
      .writeBinary(toBytes(data))
      .then(() => done?.(null))
      .catch((error: unknown) => {
        const writeError = error instanceof Error ? error : new Error(String(error));
        this.emit('error', writeError);
        done?.(writeError);
      });

    return true;
  }

  close(callback?: WriteCallback): void {
    const closing = this.closePort();
    trackSerialPathClose(this.path, closing);
    void closing
      .then(() => callback?.(null))
      .catch((error: unknown) => {
        const closeError = error instanceof Error ? error : new Error(String(error));
        callback?.(closeError);
      });
  }

  /**
   * node-serialport `update({ baudRate })` — switches rate on the open handle without close/reopen.
   */
  update(options: UpdateOptions, callback?: WriteCallback): void | Promise<void> {
    const promise = this.applyBaudUpdate(options);

    if (callback) {
      void promise
        .then(() => callback(null))
        .catch((error: unknown) => {
          const updateError = error instanceof Error ? error : new Error(String(error));
          this.emit('error', updateError);
          callback(updateError);
        });
      return;
    }

    return promise.catch((error: unknown) => {
      const updateError = error instanceof Error ? error : new Error(String(error));
      this.emit('error', updateError);
      throw updateError;
    });
  }

  private async applyBaudUpdate(options: UpdateOptions): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Port is not open');
    }

    if (options.baudRate === undefined) {
      throw new Error('baudRate is required');
    }

    const baudRate = options.baudRate;
    await this.tauriPort.setBaudRate(baudRate);
    this.tauriPort.options.baudRate = baudRate;
    await this.tauriPort.writeDataTerminalReady(this.dtr);
    await this.tauriPort.writeRequestToSend(this.rts);
  }

  private async openPort(): Promise<void> {
    const generation = ++this.openGeneration;

    try {
      await waitForSerialPathClose(this.path);
      await this.waitForPathThenOpen(generation);
      await this.tauriPort.writeDataTerminalReady(this.dtr);
      await this.tauriPort.writeRequestToSend(this.rts);
      this.discardRx = true;
      this.watchHandle = await this.tauriPort.watch(
        {
          onData: (incoming) => {
            if (this.discardRx) {
              return;
            }

            this.emit('data', toBuffer(incoming));
          },
          onError: (message) => {
            this.emit('error', new Error(message));
          },
          onDisconnect: (reason) => {
            this.handleDisconnect(reason);
          },
        },
        {
          decode: false,
          timeout: SERIAL_LISTENER_FLUSH_MS,
          serialDataFlushIntervalMs: SERIAL_LISTENER_FLUSH_MS,
        },
      );
      await delay(SERIAL_OPEN_SETTLE_MS);

      if (generation !== this.openGeneration) {
        return;
      }

      await this.tauriPort.clearBuffer(ClearBuffer.Input).catch(() => undefined);
      await delay(SERIAL_OPEN_DRAIN_MS);

      if (generation !== this.openGeneration) {
        return;
      }

      this.discardRx = false;
      this.isOpen = true;
      this.emit('open');
    } catch (error) {
      if (generation !== this.openGeneration) {
        return;
      }

      const openError = error instanceof Error ? error : new Error(String(error));
      this.discardRx = false;
      this.emit(
        'error',
        isPortMissingError(openError) ? formatSerialPortOpenError(this.path, openError) : openError,
      );
    }
  }

  private async waitForPathThenOpen(generation: number): Promise<void> {
    if (!(await isSerialPortPathAvailable(this.path))) {
      await waitForSerialPortPathAvailable(this.path);
    }

    if (generation !== this.openGeneration) {
      return;
    }

    try {
      await this.tauriPort.open();
    } catch (error) {
      if (!isPortMissingError(error)) {
        throw error;
      }

      await waitForSerialPortPathAvailable(this.path);

      if (generation !== this.openGeneration) {
        return;
      }

      await this.tauriPort.open();
    }
  }

  private handleDisconnect(reason: string): void {
    this.watchHandle = undefined;
    this.unpipe();

    if (!this.isOpen) {
      return;
    }

    this.isOpen = false;
    this.emit('error', new Error(reason || 'Serial port disconnected'));
  }

  private async closePort(): Promise<void> {
    this.openGeneration += 1;
    this.discardRx = false;
    this.unpipe();
    const handle = this.watchHandle;
    this.watchHandle = undefined;

    if (handle) {
      await handle.unwatch().catch(() => undefined);
    }

    await this.tauriPort.writeDataTerminalReady(false).catch(() => undefined);
    await this.tauriPort.writeRequestToSend(false).catch(() => undefined);
    await this.tauriPort.close().catch(() => undefined);
    this.isOpen = false;
  }
}

function toBuffer(incoming: unknown): Buffer {
  if (incoming instanceof Uint8Array) {
    return Buffer.from(incoming);
  }

  if (Array.isArray(incoming)) {
    return Buffer.from(incoming as number[]);
  }

  if (typeof incoming === 'string') {
    return Buffer.from(incoming, 'binary');
  }

  if (incoming && typeof incoming === 'object' && 'data' in incoming) {
    return toBuffer((incoming as { data: unknown }).data);
  }

  return Buffer.from([]);
}
