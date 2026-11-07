import { isAprsComBaudRate, type AprsComBaudRate } from '~/utils/aprs-d710';

/**
 * Line state for the TM-D710 control-head COM jack.
 *
 * RTS and DTR stay deasserted and hardware flow control stays off.
 * The PG-5G cable has no RTS, DTR, or PTT conductor. HamBench still
 * refuses to raise those lines so a misplugged adapter is not driven high.
 */
export interface AprsSerialOpenOptions {
  path: string;
  baudRate: AprsComBaudRate;
  dataBits: 8;
  stopBits: 1;
  parity: 'none';
  rtscts: false;
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
    rts: false,
    dtr: false,
  };
}
