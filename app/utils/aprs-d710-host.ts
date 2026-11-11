import type { AprsHostLink, AprsHostProfile } from '~/utils/aprs-host-profile';
import { APRS_HOST_RECOVERY, APRS_HOST_SETUP } from '~/utils/aprs-kiss-restore';

/**
 * Compatibility copy of the TM-D710 host procedure.
 *
 * Installed modules published before `aprs.host` do not carry these bytes.
 * A module that sets `capabilities.aprsReceive` supplies its own block, and
 * this procedure is not added on top. The sequence is the one already tested
 * on a TM-D710: three Ctrl+C, then `KISS ON` after `cmd:`, then `RESTART`
 * after another `cmd:`.
 */
export const APRS_COMMAND_INTERRUPT = Uint8Array.of(0x03, 0x03, 0x03);
export const APRS_KISS_ON_COMMAND = 'KISS ON\r';
export const APRS_RESTART_COMMAND = 'RESTART\r';

export function d710AprsHostLink(): AprsHostLink {
  return {
    interrupt: APRS_COMMAND_INTERRUPT,
    prompt: 'cmd:',
    errorReply: '?EH',
    waitMs: 5000,
    listenMs: 3000,
    enter: [
      { text: APRS_KISS_ON_COMMAND, label: 'KISS ON' },
      { text: APRS_RESTART_COMMAND, label: 'RESTART' },
    ],
  };
}

export function d710AprsHostProfile(): AprsHostProfile {
  return {
    link: d710AprsHostLink(),
    flows: ['software', 'none', 'hardware'],
    defaultFlow: 'software',
    flowHelp: 'Software keeps RTS and DTR low, as does Off. Hardware (RTS/CTS) is for a TNC whose display already says XFLOW OFF. It does not force RTS low and it does not send XFLOW.',
    setup: APRS_HOST_SETUP,
    recovery: APRS_HOST_RECOVERY,
  };
}
