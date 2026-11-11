import { describe, expect, it } from 'vitest';
import {
  adoptLegacyAprsConnection,
  d710AprsFamily,
  d710AprsMenus,
  LEGACY_APRS_BAUD_STORAGE_KEY,
  LEGACY_APRS_PORT_STORAGE_KEY,
} from '../../app/utils/aprs-d710.ts';
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

  it('folds a legacy COM port onto the APRS fields and leaves the memory port', () => {
    const saved = new Map<string, string>([
      [LEGACY_APRS_PORT_STORAGE_KEY, JSON.stringify({ 'radio-1': '/dev/cu.pg5g', 'radio-later': '/dev/cu.later' })],
      [LEGACY_APRS_BAUD_STORAGE_KEY, JSON.stringify({ 'radio-1': 19200 })],
    ]);
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
      removeItem: (key: string) => {
        saved.delete(key);
      },
    };
    const radio = {
      id: 'radio-1',
      serialPort: '/dev/cu.programming',
      baudRate: 9600,
    };

    const adopted = adoptLegacyAprsConnection([radio], storage);

    expect(adopted.changed).toBe(true);
    expect(adopted.radios[0]).toMatchObject({
      serialPort: '/dev/cu.programming',
      baudRate: 9600,
      aprsSerialPort: '/dev/cu.pg5g',
      aprsBaudRate: 19200,
    });
    expect(saved.get(LEGACY_APRS_PORT_STORAGE_KEY)).toContain('radio-later');
    expect(saved.get(LEGACY_APRS_PORT_STORAGE_KEY)).not.toContain('radio-1');
    expect(saved.has(LEGACY_APRS_BAUD_STORAGE_KEY)).toBe(false);
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
