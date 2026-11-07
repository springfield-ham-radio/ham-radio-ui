import { isAprsComBaudRate, type AprsComBaudRate } from '~/utils/aprs-d710';

/**
 * Line state for the passive menu 604 monitor.
 *
 * RTS and DTR stay deasserted. Flow control stays off because that is the
 * session Bryan already verified. The host listener uses software flow
 * control instead, matching the TNC `XFLOW` default.
 */
export interface AprsSerialOpenOptions {
  path: string;
  baudRate: AprsComBaudRate;
  dataBits: 8;
  stopBits: 1;
  parity: 'none';
  rtscts: false;
  flowControl: 'none';
  rts: false;
  dtr: false;
}

export function aprsSerialOpenOptions(path: string, baudRate: number): AprsSerialOpenOptions {
  if (!isAprsComBaudRate(baudRate)) {
    throw new Error('COM port baud must be 9600, 19200, 38400, or 57600');
  }

  return {
    path,
    baudRate,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: false,
    flowControl: 'none',
    rts: false,
    dtr: false,
  };
}

/**
 * Host KISS port.
 *
 * The TNC command list defaults `XFLOW` to ON, which is software flow
 * control. The Tauri serial plugin supports that mode. Hardware RTS/CTS is
 * present on the operation-panel COM jack, but a USB adapter may not wire
 * those pins, so it is not selected here. RTS and DTR are still deasserted:
 * on this jack they are flow-control lines, not the DATA-terminal PKS key.
 */
export function aprsHostSerialOpenOptions(
  path: string,
  baudRate: number,
): Omit<AprsSerialOpenOptions, 'flowControl'> & { flowControl: 'software' } {
  return {
    ...aprsSerialOpenOptions(path, baudRate),
    flowControl: 'software',
  };
}
