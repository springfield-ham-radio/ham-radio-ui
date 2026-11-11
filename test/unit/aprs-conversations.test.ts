import { describe, expect, it } from 'vitest';
import { aprsConversationCall, aprsConversations, aprsHeardAudience } from '~/utils/aprs-conversations';
import type { AprsHostMessage } from '~/utils/aprs-host-session';

function line(partial: Partial<AprsHostMessage> & Pick<AprsHostMessage, 'key' | 'other' | 'at'>): AprsHostMessage {
  return {
    direction: 'in',
    text: partial.text ?? partial.key,
    status: 'heard',
    ...partial,
  };
}

describe('APRS conversations', () => {
  it('keeps SSID identities apart and orders by the latest line', () => {
    const rows = aprsConversations([
      line({ key: 'a', other: 'KF5UFJ-1', at: 30, text: 'from dash 1' }),
      line({ key: 'b', other: 'KF5UFJ-7', at: 10, text: 'early' }),
      line({ key: 'c', other: 'KF5UFJ-7', at: 20, text: 'later' }),
    ]);

    expect(rows.map((row) => row.callsign)).toEqual(['KF5UFJ-1', 'KF5UFJ-7']);
    expect(rows[1]?.messages.map((message) => message.key)).toEqual(['b', 'c']);
    expect(rows[1]?.latest.text).toBe('later');
  });

  it('selects a callsign without creating a message', () => {
    expect(aprsConversationCall('kf5ufj-7')).toBe('KF5UFJ-7');
    expect(aprsConversationCall('KF5UFJ-1')).not.toBe('KF5UFJ-7');
    expect(aprsConversationCall('not a call')).toBeUndefined();
    expect(aprsConversations([])).toEqual([]);
  });

  it('updates an ack on the outgoing line and does not add an ack bubble', () => {
    const outgoing = line({
      key: 'out-1',
      other: 'K5KTF-4',
      direction: 'out',
      text: 'Test',
      status: 'waiting-ack',
      detail: 'Sent 1 of 3',
      at: 5,
    });
    const before = aprsConversations([outgoing]);
    outgoing.status = 'acked';
    outgoing.detail = 'Ack 1 from K5KTF-4';
    const after = aprsConversations([outgoing]);

    expect(after).toHaveLength(1);
    expect(after[0]?.messages).toHaveLength(1);
    expect(after[0]?.messages[0]?.status).toBe('acked');
    expect(after[0]?.messages).toHaveLength(before[0]?.messages.length ?? 0);
  });

  it('does not call a heard packet addressed to you when the addressee differs', () => {
    const heard = line({
      key: 'in-1',
      other: 'KF5UFJ-1',
      addressee: 'K5KTF-4',
      at: 1,
    });
    const mine = line({
      key: 'in-2',
      other: 'KF5UFJ-7',
      addressee: 'N0CALL',
      at: 2,
    });

    expect(aprsHeardAudience(heard, 'N0CALL')).toBe('Addressed to K5KTF-4');
    expect(aprsHeardAudience(mine, 'N0CALL')).toBe('Addressed to you');
    expect(aprsHeardAudience(mine, 'N0CALL-7')).toBe('Addressed to N0CALL');
  });
});
