import type { AprsHostMessage } from '~/utils/aprs-host-session';
import { canonicalAx25Call, formatAx25Call } from '~/utils/aprs-ax25';

export interface AprsConversation {
  callsign: string;
  messages: AprsHostMessage[];
  latest: AprsHostMessage;
}

/**
 * One row per AX.25 callsign, SSID included. KF5UFJ-1 and KF5UFJ-7 stay apart.
 * Opening a row is not represented here and does not send.
 */
export function aprsConversations(messages: readonly AprsHostMessage[]): AprsConversation[] {
  const groups = new Map<string, AprsHostMessage[]>();

  for (const message of messages) {
    const rows = groups.get(message.other) ?? [];
    rows.push(message);
    groups.set(message.other, rows);
  }

  return [...groups.entries()]
    .map(([callsign, rows]) => {
      const ordered = [...rows].sort((left, right) => left.at - right.at || left.key.localeCompare(right.key));
      const latest = ordered[ordered.length - 1] as AprsHostMessage;

      return { callsign, messages: ordered, latest };
    })
    .sort((left, right) => right.latest.at - left.latest.at || left.callsign.localeCompare(right.callsign));
}

export function aprsConversationCall(input: string): string | undefined {
  const call = canonicalAx25Call(input);

  return call ? formatAx25Call(call) : undefined;
}

/** Incoming text was heard. Ack state belongs on the outgoing line it matches. */
export function aprsHeardAudience(message: AprsHostMessage, mine: string): string {
  if (message.direction !== 'in') {
    return '';
  }

  const mineCall = canonicalAx25Call(mine);

  if (message.addressee && mineCall && formatAx25Call(mineCall) === message.addressee) {
    return 'Addressed to you';
  }

  if (message.addressee) {
    return `Addressed to ${message.addressee}`;
  }

  return 'Heard';
}

export function formatAprsChatTime(at: number, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
}
