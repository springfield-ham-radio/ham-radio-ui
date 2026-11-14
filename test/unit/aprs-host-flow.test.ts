import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APRS_HOST_FLOW_STORAGE_KEY,
  aprsFlowControlNote,
  aprsTncFlowControl,
  clearAprsHostFlowPreference,
  type AprsHostFlowStorage,
} from '~/utils/aprs-host-flow';

function memoryStorage(initial?: string): AprsHostFlowStorage & { raw: () => string | null } {
  let text = initial ?? null;

  return {
    getItem() {
      return text;
    },
    setItem(_key, value) {
      text = value;
    },
    removeItem() {
      text = null;
    },
    raw() {
      return text;
    },
  };
}

describe('TNC flow control from the radio module', () => {
  it('uses the declared value for Host and Monitor only and ignores a saved menu choice', () => {
    const storage = memoryStorage('{"d710":"software"}');
    clearAprsHostFlowPreference(storage);
    expect(storage.getItem(APRS_HOST_FLOW_STORAGE_KEY)).toBeNull();

    expect(aprsTncFlowControl({ declared: 'hardware', mode: 'host', d710Family: true })).toBe('hardware');
    expect(aprsTncFlowControl({ declared: 'hardware', mode: 'passive', d710Family: true })).toBe('hardware');
    expect(aprsTncFlowControl({ declared: 'none', mode: 'host', d710Family: true })).toBe('none');
    expect(aprsTncFlowControl({ declared: 'software', mode: 'passive', d710Family: false })).toBe('software');
  });

  it('opens an older TM-D710 host session with hardware and leaves other modules on the previous defaults', () => {
    expect(aprsTncFlowControl({ declared: undefined, mode: 'host', d710Family: true })).toBe('hardware');
    expect(aprsTncFlowControl({ declared: undefined, mode: 'passive', d710Family: true })).toBe('none');
    expect(aprsTncFlowControl({ declared: undefined, mode: 'host', d710Family: false })).toBe('software');
    expect(aprsTncFlowControl({ declared: undefined, mode: 'passive', d710Family: false })).toBe('none');
    expect(aprsFlowControlNote('hardware')).toBe('Flow control is hardware (RTS/CTS).');
    expect(aprsFlowControlNote('software')).toBe('Flow control is software (XON/XOFF).');
    expect(aprsFlowControlNote('none')).toBe('Flow control is off.');
  });

  it('wires both tabs through the shared bar and does not keep a flow-control menu', () => {
    const packet = readFileSync(new URL('../../app/components/RadioPacket.vue', import.meta.url), 'utf8');
    const aprs = readFileSync(new URL('../../app/components/RadioAprs.vue', import.meta.url), 'utf8');
    const bar = readFileSync(new URL('../../app/components/AprsConnectionBar.vue', import.meta.url), 'utf8');
    expect(packet).toContain('host.watchCard(props.cardId)');
    expect(packet).toContain('<AprsConnectionBar');
    expect(aprs).toContain('<AprsConnectionBar');
    expect(aprs).not.toContain('label="Flow control"');
    expect(packet).not.toContain('label="Flow control"');
    expect(bar).not.toContain('label="Flow control"');
    expect(bar).toContain('clearAprsHostFlowPreference');
    expect(bar).toContain('tncFlow(selectedMode.value)');
    expect(bar).toContain('aprsFlowControlNote(effectiveFlow.value)');
    expect(bar).not.toContain('defaultFlow');
    expect(bar).not.toContain('readAprsHostFlow');
    expect(bar).not.toContain('writeAprsHostFlow');
    expect(aprs).not.toContain('writeAprsHostFlow');
    expect(bar).toContain('aprsStatusBadge');
    expect(bar).toContain('aprsMonitorSilenceHint');
    const session = readFileSync(new URL('../../app/utils/aprs-host-session.ts', import.meta.url), 'utf8');
    expect(session).toContain('KISS exit.');
    expect(session).toContain('aprsHostShouldExitKiss');
    expect(bar).toContain('nextAprsMonitorQuiet');
    expect(bar).toContain('class="group inline-flex"');
    expect(bar).toContain('class="rounded-e-none"');
    expect(bar).toContain('class="rounded-s-none"');
    expect(bar).toContain("border-s border-white/25");
    expect(bar).not.toContain('i-lucide-cable');
    expect(bar).not.toContain('write_binary');
  });
});
