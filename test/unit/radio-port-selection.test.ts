import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveRadioPortChoices } from '../../app/utils/radio-port-selection.ts';
import type { SerialPortOption } from '../../app/utils/serial-port-list.ts';

const live: SerialPortOption[] = [
  { label: 'Baofeng Cable', value: 'usbserial-DU0E6KWR', description: 'usbserial-DU0E6KWR' },
  { label: 'usbmodem31101', value: 'usbmodem31101' },
];

describe('resolveRadioPortChoices', () => {
  it('should show a missing saved port as unavailable and leave the selection empty', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: 'usbserial-A703DBTL',
      aliases: [{ systemName: 'usbserial-A703DBTL', name: 'Kenwood cable' }],
    });

    expect(result.selectedPort).toBeUndefined();
    expect(result.ports[0]).toEqual({
      label: 'Kenwood cable (saved)',
      value: 'usbserial-A703DBTL',
      description: 'usbserial-A703DBTL · Not connected',
      disabled: true,
    });
    expect(result.ports.slice(1)).toEqual(live);
  });

  it('should describe an unaliased missing port as not connected', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: ' usbserial-A703DBTL ',
    });

    expect(result.selectedPort).toBeUndefined();
    expect(result.ports[0]).toEqual({
      label: 'usbserial-A703DBTL (saved)',
      value: 'usbserial-A703DBTL',
      description: 'Not connected',
      disabled: true,
    });
  });

  it('should preselect a saved port that is plugged in', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: 'usbmodem31101',
    });

    expect(result.selectedPort).toBe('usbmodem31101');
    expect(result.ports).toEqual(live);
  });

  it('should keep a refreshed selection when that port is still present', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: 'usbmodem31101',
      currentPort: 'usbserial-DU0E6KWR',
    });

    expect(result.selectedPort).toBe('usbserial-DU0E6KWR');
  });

  it('should not keep a selection that disappeared, and should not pick a different cable', () => {
    const result = resolveRadioPortChoices({
      livePorts: [live[1]!],
      savedPort: 'usbserial-A703DBTL',
      currentPort: 'usbserial-DU0E6KWR',
    });

    expect(result.selectedPort).toBeUndefined();
    expect(result.ports.map((port) => port.value)).toEqual(['usbserial-A703DBTL', 'usbmodem31101']);
  });

  it('should fall back to the first free port when the plugged-in choice is held by CAT', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: 'usbserial-DU0E6KWR',
      unavailablePorts: ['usbserial-DU0E6KWR'],
    });

    expect(result.selectedPort).toBe('usbmodem31101');
    expect(result.ports.some((port) => port.disabled)).toBe(false);
  });

  it('should ignore an empty saved port', () => {
    const result = resolveRadioPortChoices({
      livePorts: live,
      savedPort: '  ',
    });

    expect(result.selectedPort).toBeUndefined();
    expect(result.ports).toEqual(live);
  });
});

describe('select menus inside overlays', () => {
  it('should not put a z-index on overlays that contain a portaled select', () => {
    const sources = [
      'app/components/RadioPortDialog.vue',
      'app/components/SavedRadioEditor.vue',
      'app/components/RadioStationEditor.vue',
      'app/components/AntennaStationEditor.vue',
      'app/components/RadioConnectionDialog.vue',
      'app/components/RadioDirectReadDialog.vue',
      'app/components/AddToRadioDialog.vue',
      'app/components/ChannelPrintDialog.vue',
      'app/components/OnboardingStepper.vue',
      'app/components/OnboardingReadStep.vue',
      'app/components/OnboardingLicensesStep.vue',
      'app/components/RadioModulesInstallDialog.vue',
      'app/components/SavedChannelEditor.vue',
      'app/components/RadioChannelEditor.vue',
      'app/components/StationLogEditor.vue',
    ];

    for (const path of sources) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('z-50');
    }
  });

  it('should resolve a missing saved port in the read and write port dialog', () => {
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');

    expect(portDialog).toContain('resolveRadioPortChoices');
    expect(portDialog).toContain('!item.disabled');
    expect(portDialog).not.toContain('z-50');
  });
});
