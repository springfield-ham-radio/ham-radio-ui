import { describe, expect, it } from 'vitest';
import type { RadioMemoryMap } from '@springfield/ham-radio-api';
import { collectMemoryMapUiGroups } from '../../app/utils/settings-groups.ts';

const sampleMap: RadioMemoryMap = {
  version: '1.0.0',
  channelBindings: {
    records: 'channels',
    names: 'names',
    nameField: 'name',
    receiveFrequency: 'rxfreq',
    transmitFrequency: 'txfreq',
    receiveTone: 'rxtone',
    transmitTone: 'txtone',
  },
  structs: [
    {
      id: 'channels',
      seek: 0,
      count: 2,
      stride: 16,
      fields: [
        {
          id: 'lowpower',
          type: 'bits',
          width: 2,
          value: { kind: 'integer', min: 0, max: 3 },
          ui: { group: 'channel', label: 'Power', widget: 'select' },
        },
      ],
    },
    {
      id: 'names',
      seek: '0x1000',
      count: 2,
      stride: 16,
      fields: [{ id: 'name', type: 'u8', value: { kind: 'ascii', length: 7 } }],
    },
    {
      id: 'settings',
      seek: '0x0E20',
      fields: [
        {
          id: 'squelch',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 9 },
          ui: { group: 'basic', label: 'Squelch', widget: 'integer', subgroup: 'receive' },
        },
        {
          id: 'timeout',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 10 },
          ui: { group: 'basic', label: 'Timeout', widget: 'integer', subgroup: 'timer' },
        },
        {
          id: 'calibration',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 255 },
          ui: { group: 'service', label: 'Calibration', widget: 'integer' },
        },
      ],
    },
  ],
};

describe('collectMemoryMapUiGroups', () => {
  it('should use declared group metadata and skip empty groups', () => {
    const grouped = collectMemoryMapUiGroups({
      ...sampleMap,
      groups: [
        {
          id: 'service',
          label: 'Service Settings',
          icon: 'i-lucide-wrench',
          warning: {
            title: 'Service calibration values',
            description: 'Change only with appropriate test equipment.',
          },
        },
        { id: 'basic', label: 'Basic Settings', icon: 'i-lucide-sliders-horizontal' },
        { id: 'empty', label: 'Unused' },
      ],
    });

    expect(grouped.map((group) => group.id)).toEqual(['service', 'basic']);
    expect(grouped[0]?.label).toBe('Service Settings');
    expect(grouped[0]?.warning?.title).toBe('Service calibration values');
    expect(grouped[1]?.fields.map((field) => field.fieldId)).toEqual(['squelch', 'timeout']);
  });

  it('should use declared sub-groups as panel sections', () => {
    const grouped = collectMemoryMapUiGroups({
      ...sampleMap,
      groups: [
        {
          id: 'basic',
          label: 'Basic Settings',
          groups: [{ id: 'timer', label: 'Timers' }],
        },
      ],
    });

    expect(grouped[0]?.groups.map((subgroup) => ({ id: subgroup.id, label: subgroup.label }))).toEqual([
      { id: 'timer', label: 'Timers' },
      { id: 'receive', label: 'Receive' },
    ]);
  });

  it('should sort section fields by ui.order', () => {
    const grouped = collectMemoryMapUiGroups({
      version: '1.0.0',
      structs: [
        {
          id: 'settings',
          seek: 0,
          fields: [
            {
              id: 'vhf_enable',
              type: 'u8',
              value: { kind: 'boolean' },
              ui: { group: 'other', label: 'VHF TX Enabled', widget: 'switch', subgroup: 'limits', order: 1 },
            },
            {
              id: 'vhf_lower',
              type: 'u8',
              value: { kind: 'integer' },
              ui: { group: 'other', label: 'VHF Lower', widget: 'integer', subgroup: 'limits', order: 3 },
            },
            {
              id: 'uhf_enable',
              type: 'u8',
              value: { kind: 'boolean' },
              ui: { group: 'other', label: 'UHF TX Enabled', widget: 'switch', subgroup: 'limits', order: 2 },
            },
          ],
        },
      ],
      groups: [{ id: 'other', label: 'Other Settings', groups: [{ id: 'limits', label: 'Band Limits' }] }],
    } as RadioMemoryMap);

    expect(grouped[0]?.groups[0]?.fields.map((field) => field.fieldId)).toEqual([
      'vhf_enable',
      'uhf_enable',
      'vhf_lower',
    ]);
  });
});
