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
 * Host flow on this computer.
 *
 * `software` is the factory `XFLOW ON` setting. `none` matches the passive
 * monitor. `hardware` is RTS/CTS for a TNC whose `XFLOW` is already OFF.
 * None of these sends `XFLOW`.
 */
export type AprsHostFlowControl = 'software' | 'none' | 'hardware';

export interface AprsHostSerialOpenOptions extends Omit<AprsSerialOpenOptions, 'flowControl'> {
  flowControl: AprsHostFlowControl;
  /**
   * Hardware mode does not ioctl RTS. Plugin `FlowControl::Hardware` is
   * serialport `CRTSCTS`, and the driver asserts RTS while it can receive.
   * Forcing RTS low would hold the panel MPU `PCCTS` inhibit.
   */
  rtsManagedByDriver: boolean;
}

/**
 * The passive monitor drops the opening fraction of a second. The host
 * listener keeps it. That difference is not a claim about why a particular
 * radio returned only two bytes.
 */
export function aprsOpenKeepsIncoming(role: 'monitor' | 'host'): boolean {
  return role === 'host';
}

export function aprsHostSerialOpenOptions(
  path: string,
  baudRate: number,
  flowControl: AprsHostFlowControl = 'software',
): AprsHostSerialOpenOptions {
  return {
    ...aprsSerialOpenOptions(path, baudRate),
    flowControl,
    rtsManagedByDriver: flowControl === 'hardware',
  };
}
