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
  });
});
