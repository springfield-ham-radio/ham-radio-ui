<<<<<<< HEAD
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SendReceiveOperation } from '@springfield/ham-radio-driver/dist/utils/protocol-operations.js';
import { createLoggingSerialPort, SerialLogger } from '@springfield/ham-radio-driver/dist/utils/serial-logger.js';
import type { ProtocolContext } from '@springfield/ham-radio-driver/dist/protocol-context.js';
import { TauriNodeSerialPort } from '../../app/utils/tauri-node-serial-port.ts';

const tauriInstances: MockTauriSerialPort[] = [];

class MockTauriSerialPort {
  isOpen = false;
  options = { path: '/dev/test', baudRate: 9600 };
  open = vi.fn(async () => {
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
    this.isOpen = false;
  });
}

vi.mock('tauri-plugin-serialplugin-api', () => ({
  ClearBuffer: { Input: 'input' },
  DataBits: { Five: 5, Six: 6, Seven: 7, Eight: 8 },
  FlowControl: { Hardware: 'hardware', None: 'none' },
  Parity: { Odd: 'odd', Even: 'even', None: 'none' },
  StopBits: { One: 1, Two: 2 },
  SerialPort: vi.fn(function MockSerialPort() {
    const instance = new MockTauriSerialPort();
    tauriInstances.push(instance);
    return instance;
  }),
}));

async function openAdapterPort(options?: { dtr?: boolean; rts?: boolean }): Promise<{
  port: TauriNodeSerialPort;
  tauri: MockTauriSerialPort;
}> {
  vi.useFakeTimers();
  tauriInstances.length = 0;
  const port = new TauriNodeSerialPort({
    path: '/dev/test',
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
=======
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSerialPathCloseTracking } from '../../app/utils/serial-port-path-close.ts';

const openCalls: string[] = [];
let closeDelayMs = 50;

vi.mock('tauri-plugin-serialplugin-api', () => {
  class MockTauriSerialPort {
    options: { path: string };

    constructor(options: { path: string }) {
      this.options = options;
    }

    async open(): Promise<void> {
      openCalls.push(this.options.path);
    }

    async writeDataTerminalReady(): Promise<void> {}

    async writeRequestToSend(): Promise<void> {}

    async watch(): Promise<{ unwatch: () => Promise<void> }> {
      return { unwatch: async () => {} };
    }

    async clearBuffer(): Promise<void> {}

    async close(): Promise<void> {
      await new Promise((resolve) => {
        setTimeout(resolve, closeDelayMs);
      });
    }

    async writeBinary(): Promise<number> {
      return 0;
    }
  }

  return {
    ClearBuffer: { Input: 'input' },
    DataBits: { Eight: 8 },
    FlowControl: { None: 'none' },
    Parity: { None: 'none' },
    StopBits: { One: 1 },
    SerialPort: MockTauriSerialPort,
  };
});

describe('TauriNodeSerialPort path close ordering', () => {
  beforeEach(() => {
    resetSerialPathCloseTracking();
    openCalls.length = 0;
    closeDelayMs = 50;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSerialPathCloseTracking();
  });

  it('waits for an in-flight close before opening the same path again', async () => {
    const { TauriNodeSerialPort } = await import('../../app/utils/tauri-node-serial-port.ts');
    const path = '/dev/cu.usbserial-test';

    const first = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });
    await vi.waitFor(() => expect(first.isOpen).toBe(true));

    first.close();
    const second = new TauriNodeSerialPort({ path, baudRate: 9600, dtr: true, rts: false });

    await vi.advanceTimersByTimeAsync(10);
    expect(openCalls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(closeDelayMs + 400);
    await vi.waitFor(() => expect(openCalls).toHaveLength(2));
    await vi.waitFor(() => expect(second.isOpen).toBe(true));
>>>>>>> 16f29b8 (fix: serialize serial port reopen and save write failure logs)
  });
});
