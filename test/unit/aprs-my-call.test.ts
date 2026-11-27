import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { aprsMyCallField } from '~/utils/aprs-my-call';

describe('APRS My callsign field', () => {
  it('prefills from the operator callsign when nothing is stored', () => {
    expect(aprsMyCallField(undefined, 'KF5UFJ')).toBe('KF5UFJ');
    expect(aprsMyCallField(undefined, 'WRKP365')).toBe('');
    expect(aprsMyCallField(undefined, undefined)).toBe('');
  });

  it('honors a cleared stored value', () => {
    expect(aprsMyCallField('', 'KF5UFJ')).toBe('');
  });

  it('uses the stored callsign when canonical', () => {
    expect(aprsMyCallField('kf5ufj-1', 'KF5UFJ')).toBe('KF5UFJ-1');
  });

  it('falls back when the stored value is invalid', () => {
    expect(aprsMyCallField('1BAD', 'KF5UFJ')).toBe('KF5UFJ');
  });
});

describe('APRS My callsign wiring', () => {
  it('remembers and seeds identity in RadioAprs', () => {
    const source = readFileSync(new URL('../../app/components/RadioAprs.vue', import.meta.url), 'utf8');

    expect(source).toContain('aprsMyCallField');
    expect(source).toContain('rememberAprsMyCall');
    expect(source).toMatch(/host\.setIdentity\(props\.cardId, mine\.value\)/);
    expect(source).toContain('label="My callsign"');
    expect(source).toContain('watch(kissListening');
    expect(source).toContain('host.setIdentity(props.cardId, mine.value)');
  });
});