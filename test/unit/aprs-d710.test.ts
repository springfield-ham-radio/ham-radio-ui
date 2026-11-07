import { describe, expect, it } from 'vitest';
import { d710AprsFamily, d710AprsMenus, readAprsComBaud, writeAprsComBaud, writeAprsComPort, readAprsComPort } from '../../app/utils/aprs-d710.ts';
import { memoryTransferBlockedMessage, markCatBusySerialPorts } from '../../app/utils/cat-memory-transfer.ts';

describe('TM-D710 APRS setup', () => {
  it('uses the 5xx port menus for A/E/S and the 9xx menus for G', () => {
    expect(d710AprsFamily('kenwood-tm-d710a', 'TM-D710A')).toBe('a-e');
    expect(d710AprsMenus('a-e').comBaudMenu).toBe('528');
    expect(d710AprsMenus('a-e').pcBaudMenu).toBe('519');
    expect(d710AprsMenus('a-e').comOutputMenu).toBe('604');

    expect(d710AprsFamily('kenwood-tm-d710g', 'TM-D710G')).toBe('g');
    expect(d710AprsMenus('g').comBaudMenu).toBe('929');
    expect(d710AprsMenus('g').pcBaudMenu).toBe('920');
    expect(d710AprsMenus('g').packetDataBandMenu).toBe('930');
  });

  it('leaves a bare TM-D710 unconfirmed', () => {
    expect(d710AprsFamily('kenwood-tm-d710', 'TM-D710')).toBe('unconfirmed');
    expect(d710AprsMenus('unconfirmed').comBaudMenu).toContain('528');
    expect(d710AprsMenus('unconfirmed').comBaudMenu).toContain('929');
    expect(d710AprsFamily('baofeng-uv5r', 'UV-5R')).toBeUndefined();
  });

  it('remembers COM baud and port apart from the programming port', () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    };

    expect(readAprsComBaud(storage, 'radio-1')).toBe(9600);
    writeAprsComBaud(storage, 'radio-1', 19200);
    writeAprsComPort(storage, 'radio-1', '/dev/cu.pg5g');

    expect(readAprsComBaud(storage, 'radio-1')).toBe(19200);
    expect(readAprsComPort(storage, 'radio-1')).toBe('/dev/cu.pg5g');
  });

  it('labels an APRS hold differently from CAT', () => {
    const marked = markCatBusySerialPorts(
      [{ label: 'pg5g', value: '/dev/cu.pg5g' }],
      ['/dev/cu.pg5g'],
      { holders: { '/dev/cu.pg5g': 'aprs' } },
    );

    expect(marked[0]?.label).toBe('pg5g (APRS)');
    expect(memoryTransferBlockedMessage('aprs').title).toContain('APRS');
    expect(memoryTransferBlockedMessage('cat').description).toContain('CAT');
  });
});
