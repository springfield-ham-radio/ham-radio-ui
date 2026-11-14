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

/** Shown when Host detection stops on a TNC2 line and never sees `cmd:`. Not transmitted. */
export const D710_APRS_MODE_HINT =
  'Radio looks like it\'s in APRS mode. Press TNC on the radio until it shows PACKET, then retry.';

/** Shown on No reply when that stop has no TNC2 line. Not transmitted. */
export const D710_APRS_MODE_LIKELY_HINT =
  'No reply from the TNC. If the radio is in APRS mode, press TNC on the radio until it shows PACKET, then retry.';

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
    // No flowControl. This copy is for a module that has not published
    // aprs.host. Connect treats a TM-D710 with no flowControl as hardware
    // RTS/CTS on the host open. defaultFlow stays software so the object
    // still matches the key older modules published for previous app builds.
    flows: ['software', 'none', 'hardware'],
    defaultFlow: 'software',
    flowHelp: 'Host open on a TM-D710 uses hardware RTS/CTS when the module omits flowControl. The driver manages RTS. Connect does not send XFLOW.',
    setup: APRS_HOST_SETUP,
    recovery: APRS_HOST_RECOVERY,
    aprsModeHint: D710_APRS_MODE_HINT,
    aprsModeLikelyHint: D710_APRS_MODE_LIKELY_HINT,
  };
}
