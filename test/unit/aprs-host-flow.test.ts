import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aprsHostFlowForConnect,
  readAprsHostFlow,
  writeAprsHostFlow,
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
    raw() {
      return text;
    },
  };
}

describe('saved APRS host flow', () => {
  it('uses the per-radio choice for Packet and leaves the module default as the fallback', () => {
    const storage = memoryStorage();
    expect(readAprsHostFlow(storage, 'd710')).toBeUndefined();
    expect(aprsHostFlowForConnect(undefined, 'software')).toBe('software');

    writeAprsHostFlow(storage, 'd710', 'hardware');
    writeAprsHostFlow(storage, 'other', 'none');
    expect(readAprsHostFlow(storage, 'd710')).toBe('hardware');
    expect(aprsHostFlowForConnect(readAprsHostFlow(storage, 'd710'), 'software')).toBe('hardware');
    expect(aprsHostFlowForConnect(readAprsHostFlow(storage, 'missing'), 'software')).toBe('software');
    expect(readAprsHostFlow(storage, 'other')).toBe('none');
    expect(readAprsHostFlow(memoryStorage('{'), 'd710')).toBeUndefined();
  });

  it('wires Packet Connect to the saved flow and watches the host card', () => {
    const packet = readFileSync(new URL('../../app/components/RadioPacket.vue', import.meta.url), 'utf8');
    const aprs = readFileSync(new URL('../../app/components/RadioAprs.vue', import.meta.url), 'utf8');
    const bar = readFileSync(new URL('../../app/components/AprsConnectionBar.vue', import.meta.url), 'utf8');
    expect(packet).toContain('host.watchCard(props.cardId)');
    expect(packet).toContain('<AprsConnectionBar');
    expect(aprs).toContain('<AprsConnectionBar');
    expect(bar).toContain('aprsHostFlowForConnect(saved, profile.value?.host?.defaultFlow)');
    expect(bar).not.toContain("profile.value?.host?.defaultFlow ?? 'software'");
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
    expect(aprs).toContain('writeAprsHostFlow(storage, props.cardId, value)');
    expect(aprs).toContain('readAprsHostFlow(');
  });
});
