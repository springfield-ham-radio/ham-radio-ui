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
    const fallback = aprsReceiveProfile({ model: 'kenwood-tm-d710g', name: 'TM-D710G' });
    expect(fallback?.source).toBe('fallback');
    expect(fallback?.help).toContain('929');
    expect(fallback?.monitorNote).toContain('604');
    expect(new TextDecoder().decode(fallback?.host?.link.interrupt ?? new Uint8Array())).toBe('\u0003\u0003\u0003');
    expect(fallback?.host?.link.enter.map((step) => step.text)).toEqual(['KISS ON\r', 'RESTART\r']);
    expect(aprsReceiveProfile({ model: 'baofeng-uv5r' })).toBeUndefined();
  });

  it('does not add the TM-D710 procedure to a module that only declares a monitor', () => {
    const profile = aprsReceiveProfile({
      model: 'example-tnc',
      config: {
        capabilities: { aprsReceive: true },
        aprs: { mode: 'monitor', baudRate: 9600, baudRates: [9600], help: 'Monitor only' },
      },
    });

    expect(profile?.source).toBe('driver');
    expect(profile?.host).toBeUndefined();
    expect(aprsReceiveProfile({ model: 'kenwood-tm-d710a', config: { capabilities: { aprsReceive: true }, aprs: { mode: 'monitor', baudRate: 9600, baudRates: [9600] } } })?.host).toBeUndefined();
  });

  it('uses the module host procedure instead of the TM-D710 sequence', () => {
    const profile = aprsReceiveProfile({
      model: 'example-tnc',
      config: {
        capabilities: { aprsReceive: true },
        aprs: {
          mode: 'monitor',
          baudRate: 9600,
          baudRates: [9600],
          host: {
            interrupt: [21],
            prompt: 'ok>',
            enter: [{ text: 'HOST\r', label: 'HOST' }],
            flows: ['none'],
            defaultFlow: 'none',
            setup: ['The module asks for ok>.'],
            recovery: ['Disconnect. The module does not document an exit command.'],
          },
        },
      },
    });

    expect(profile?.host?.link.interrupt).toEqual(Uint8Array.of(21));
    expect(profile?.host?.link.enter[0]?.text).toBe('HOST\r');
    expect(profile?.host?.flows).toEqual(['none']);
    expect(profile?.host?.link.enter.some((step) => step.text.includes('KISS ON'))).toBe(false);
  });
});
