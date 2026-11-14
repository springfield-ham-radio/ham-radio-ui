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
    expect(aprs).toContain('writeAprsHostFlow(storage, props.cardId, value)');
    expect(aprs).toContain('readAprsHostFlow(');
  });
});
