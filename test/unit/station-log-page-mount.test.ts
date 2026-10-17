import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Station log page mount', () => {
  it('links table row selection to the map without opening the editor on row click', () => {
    const source = readFileSync(new URL('../../app/pages/log.vue', import.meta.url), 'utf8');

    expect(source).toContain('onSelectContact');
    expect(source).not.toContain('@select="(row) => openEdit(row.original)"');
    expect(source).toContain('@pick="onMapPick"');
    expect(source).toContain('data-qso-row-id');
    expect(source).toContain('clearContactSelection');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('`Edit ${row.original.theirCallsign}`');
    expect(source).toContain(':selected-qso-ids="[...selectedQsoIds]"');
  });

  it('emits map picks for every QSO at a pin', () => {
    const source = readFileSync(new URL('../../app/components/StationLogMap.vue', import.meta.url), 'utf8');

    expect(source).toContain("emit('pick'");
    expect(source).toContain('revealLocationKey');
    expect(source).toContain("mapSelected");
  });
});
