import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SendReceiveOperation } from '@springfield/ham-radio-driver/dist/utils/protocol-operations.js';
import { createLoggingSerialPort, SerialLogger } from '@springfield/ham-radio-driver/dist/utils/serial-logger.js';
import type { ProtocolContext } from '@springfield/ham-radio-driver/dist/protocol-context.js';
import { TauriNodeSerialPort } from '../../app/utils/tauri-node-serial-port.ts';
import { resetSerialPathCloseTracking } from '../../app/utils/serial-port-path-close.ts';
import { resetSerialPortReconnectHooks } from '../../app/utils/serial-port-reconnect.ts';

const tauriInstances: MockTauriSerialPort[] = [];
const openCalls: string[] = [];
let closeDelayMs = 0;
let listedPorts: string[] = ['/dev/test'];
let openFailUntilAttempt = 0;
let openAttempt = 0;

class MockTauriSerialPort {
  isOpen = false;
  options: { path: string; baudRate: number };

  constructor(path = '/dev/test', baudRate = 9600) {
    this.options = { path, baudRate };
  }

  open = vi.fn(async () => {
    openAttempt += 1;
    if (openAttempt <= openFailUntilAttempt) {
      throw new Error('No such file or directory');
    }

    openCalls.push(this.options.path);
    this.isOpen = true;
  });
  setBaudRate = vi.fn(async (baudRate: number) => {
    this.options.baudRate = baudRate;
  });
  writeDataTerminalReady = vi.fn(async () => undefined);
  writeRequestToSend = vi.fn(async () => undefined);
  watch = vi.fn(async () => ({ unwatch: vi.fn(async () => undefined) }));
  clearBuffer = vi.fn(async () => undefined);
  writeBinary = vi.fn(async () => 0);
  close = vi.fn(async () => {
    if (closeDelayMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, closeDelayMs);
      });
    }
    this.isOpen = false;
  });
}

vi.mock('tauri-plugin-serialplugin-api', () => ({
  ClearBuffer: { Input: 'input' },
  DataBits: { Five: 5, Six: 6, Seven: 7, Eight: 8 },
  FlowControl: { Hardware: 'hardware', None: 'none' },
  Parity: { Odd: 'odd', Even: 'even', None: 'none' },
  StopBits: { One: 1, Two: 2 },
  SerialPort: Object.assign(
    vi.fn(function MockSerialPort(options: { path: string; baudRate: number }) {
      const instance = new MockTauriSerialPort(options.path, options.baudRate);
      tauriInstances.push(instance);
      return instance;
    }),
    {
      available_ports: vi.fn(async () =>
        Object.fromEntries(listedPorts.map((path) => [path, 'USB Serial'])),
      ),
    },
  ),
}));

async function openAdapterPort(options?: { path?: string; dtr?: boolean; rts?: boolean }): Promise<{
  port: TauriNodeSerialPort;
  tauri: MockTauriSerialPort;
}> {
  vi.useFakeTimers();
  tauriInstances.length = 0;
  openCalls.length = 0;
  closeDelayMs = 0;
  listedPorts = [options?.path ?? '/dev/test'];
  openFailUntilAttempt = 0;
  openAttempt = 0;
  const port = new TauriNodeSerialPort({
    path: options?.path ?? '/dev/test',
    baudRate: 9600,
    dtr: options?.dtr ?? true,
    rts: options?.rts ?? true,
  });
  await vi.runAllTimersAsync();
  await Promise.resolve();

  const tauri = tauriInstances[0];
  if (!tauri) {
    throw new Error('Expected mocked Tauri serial port instance');
  }

  await new Promise<void>((resolve) => {
    if (port.isOpen) {
      resolve();
      return;
    }
    port.once('open', () => resolve());
  });

  vi.useRealTimers();
  return { port, tauri };
}

describe('TauriNodeSerialPort.update', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    tauriInstances.length = 0;
    openCalls.length = 0;
    closeDelayMs = 0;
    resetSerialPathCloseTracking();
    resetSerialPortReconnectHooks();
  });

  it('should set baud rate and re-assert DTR/RTS without open-path delays', async () => {
    const { port, tauri } = await openAdapterPort({ dtr: true, rts: false });
    tauri.setBaudRate.mockClear();
    tauri.writeDataTerminalReady.mockClear();
    tauri.writeRequestToSend.mockClear();

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    await port.update({ baudRate: 57600 });
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();

    expect(tauri.setBaudRate).toHaveBeenCalledWith(57600);
    expect(tauri.options.baudRate).toBe(57600);
    expect(tauri.writeDataTerminalReady).toHaveBeenCalledWith(true);
    expect(tauri.writeRequestToSend).toHaveBeenCalledWith(false);
  });

  it('should invoke the callback with null on success and with an error on failure', async () => {
    const { port, tauri } = await openAdapterPort();

    await new Promise<void>((resolve, reject) => {
      port.update({ baudRate: 57600 }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    tauri.setBaudRate.mockRejectedValueOnce(new Error('baud failed'));
    await new Promise<void>((resolve) => {
      port.update({ baudRate: 115200 }, (error) => {
        expect(error).toEqual(expect.objectContaining({ message: 'baud failed' }));
        resolve();
      });
    });
  });
});

describe('ham-radio-driver setBaudRate with TauriNodeSerialPort', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    tauriInstances.length = 0;
    openCalls.length = 0;
    closeDelayMs = 0;
    resetSerialPathCloseTracking();
    resetSerialPortReconnectHooks();
  });

  it('should run SendReceiveOperation setBaudRate and log the switch', async () => {
    const { port, tauri } = await openAdapterPort();
    tauri.setBaudRate.mockClear();

    const debug = vi.fn();
    const context = {
      port: port as ProtocolContext['port'],
      variables: new Map<string, unknown>(),
      memoryConfig: { segments: {} },
      memoryBuffer: new Uint8Array(0),
      bufferOffset: 0,
      logger: { debug },
      progressIndicator: { isCanceled: false },
    } as ProtocolContext;

    const operation = new SendReceiveOperation();
    await operation.execute({ setBaudRate: 57600 }, context);

    expect(tauri.setBaudRate).toHaveBeenCalledWith(57600);
    expect(debug).toHaveBeenCalledWith('Switching baud rate to 57600');
  });

  it('should still call update after createLoggingSerialPort wraps the port', async () => {
    const { port, tauri } = await openAdapterPort();
    tauri.setBaudRate.mockClear();

    const serialLogger = new SerialLogger('/tmp/test-serial-log.json');
    const loggedPort = createLoggingSerialPort(port as never, serialLogger);

    const debug = vi.fn();
    const context = {
      port: loggedPort as ProtocolContext['port'],
      variables: new Map<string, unknown>(),
      memoryConfig: { segments: {} },
      memoryBuffer: new Uint8Array(0),
      bufferOffset: 0,
      logger: { debug },
      progressIndicator: { isCanceled: false },
    } as ProtocolContext;

    const operation = new SendReceiveOperation();
    await operation.execute({ setBaudRate: 57600 }, context);

    expect(tauri.setBaudRate).toHaveBeenCalledWith(57600);
    serialLogger.close();
  });
});

describe('TauriNodeSerialPort path close ordering', () => {
  beforeEach(() => {
    resetSerialPathCloseTracking();
    tauriInstances.length = 0;
    openCalls.length = 0;
    closeDelayMs = 50;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSerialPathCloseTracking();
    resetSerialPortReconnectHooks();
    closeDelayMs = 0;
    listedPorts = ['/dev/cu.usbserial-test'];
    openFailUntilAttempt = 0;
    openAttempt = 0;
  });

  it('waits for an in-flight close before opening the same path again', async () => {
    const path = '/dev/cu.usbserial-test';
    listedPorts = [path];

    const first = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });
    await vi.waitFor(() => expect(first.isOpen).toBe(true));

    first.close();
    const second = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });

    await vi.advanceTimersByTimeAsync(10);
    expect(openCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(closeDelayMs + 400);
    await vi.waitFor(() => expect(openCalls).toHaveLength(2));
    await vi.waitFor(() => expect(second.isOpen).toBe(true));
  });

  it('waits for the port to reappear after a programming read drops the CDC device', async () => {
    const path = '/dev/cu.usbmodem31101';
    listedPorts = [path];

    const first = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });
    await vi.waitFor(() => expect(first.isOpen).toBe(true));

    first.close();
    await vi.advanceTimersByTimeAsync(closeDelayMs + 50);

    listedPorts = [];
    const second = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });

    await vi.advanceTimersByTimeAsync(100);
    expect(openCalls).toHaveLength(1);

    listedPorts = [path];
    await vi.advanceTimersByTimeAsync(400);
    await vi.waitFor(() => expect(openCalls).toHaveLength(2));
    await vi.waitFor(() => expect(second.isOpen).toBe(true));
  });
});
