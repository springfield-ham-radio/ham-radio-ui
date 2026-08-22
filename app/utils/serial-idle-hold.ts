import { DataBits, FlowControl, Parity, SerialPort, StopBits } from 'tauri-plugin-serialplugin';

let heldPort: SerialPort | undefined;

async function deassertControlLines(port: SerialPort): Promise<void> {
  await port.writeDataTerminalReady(false);
  await port.writeRequestToSend(false);
}

export async function holdSerialPortInactive(path: string | undefined): Promise<void> {
  await releaseSerialPortHold();

  if (!path) {
    return;
  }

  const port = new SerialPort({
    path,
    baudRate: 9600,
    dataBits: DataBits.Eight,
    stopBits: StopBits.One,
    parity: Parity.None,
    flowControl: FlowControl.None,
  });

  await port.open();
  await deassertControlLines(port);
  heldPort = port;
}

export async function releaseSerialPortHold(): Promise<void> {
  const port = heldPort;
  heldPort = undefined;

  if (!port) {
    return;
  }

  try {
    await deassertControlLines(port);
  } catch {
    // The port may already be closing.
  }

  try {
    await port.close();
  } catch {
    const path = port.options.path;

    if (path) {
      await SerialPort.forceClose(path).catch(() => undefined);
    }
  }
}
