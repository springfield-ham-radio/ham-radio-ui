import { describe, expect, it } from 'vitest';
import { aprsReceiveProfile } from '../../app/utils/aprs-capability.ts';

describe('APRS receive capability', () => {
  it('uses a driver monitor block when the module opts in', () => {
    const profile = aprsReceiveProfile({
      model: 'kenwood-tm-d710a',
      config: {
        capabilities: { aprsReceive: true },
        aprs: {
          mode: 'monitor',
          baudRate: 19200,
          baudRates: [9600, 19200],
          help: 'COM menu 528',
          rts: true,
        },
      },
    });

    expect(profile).toMatchObject({
      source: 'driver',
      baudRate: 19200,
      baudRates: [9600, 19200],
      help: 'COM menu 528',
    });
  });

  it('hides the tab when the module opts out or the block is not monitor-only', () => {
    expect(aprsReceiveProfile({ model: 'kenwood-tm-d710a', config: { capabilities: { aprsReceive: false } } })).toBeUndefined();
    expect(
      aprsReceiveProfile({
        model: 'kenwood-tm-d710a',
        config: { capabilities: { aprsReceive: true }, aprs: { mode: 'kiss', baudRate: 9600, baudRates: [9600] } },
      }),
    ).toBeUndefined();
  });

  it('falls back to a TM-D710 model until the module publishes the flag', () => {
    expect(aprsReceiveProfile({ model: 'kenwood-tm-d710g', name: 'TM-D710G' })?.source).toBe('fallback');
    expect(aprsReceiveProfile({ model: 'kenwood-tm-d710g' })?.help).toContain('929');
    expect(aprsReceiveProfile({ model: 'baofeng-uv5r' })).toBeUndefined();
  });
});
