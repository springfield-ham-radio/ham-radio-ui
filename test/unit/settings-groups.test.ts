import { describe, expect, it } from 'vitest';
import type { RadioMemoryMap, RadioMemoryMapField } from '@springfield/ham-radio-api';
import { collectMemoryMapUiGroups } from '../../app/utils/settings-groups.ts';

function setting(
  id: string,
  label: string,
  section?: string,
  order?: number,
  sectionOrder?: number,
): RadioMemoryMapField {
  return {
    id,
    type: 'u8',
    value: { kind: 'boolean' },
    ui: {
      group: 'misc',
      label,
      widget: 'switch',
      menu: { number: 900 + (order ?? 0), code: 'SQL' },
      ...(order === undefined ? {} : { order }),
      ...(section === undefined ? {} : { section }),
      ...(sectionOrder === undefined ? {} : { sectionOrder }),
    },
  } as RadioMemoryMapField;
}

function sectionMap(fields: RadioMemoryMapField[], groups?: RadioMemoryMap['groups']): RadioMemoryMap {
  return {
    version: '1.0.0',
    structs: [{ id: 'settings', seek: 0, fields }],
    ...(groups ? { groups } : {}),
  };
}

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
    expect(grouped[0]?.icon).toBe('i-lucide-wrench');
    expect(grouped[1]?.icon).toBe('i-lucide-sliders-horizontal');
  });

  it('should use the default icon when a group icon is missing or not bundled', () => {
    const grouped = collectMemoryMapUiGroups({
      ...sampleMap,
      groups: [
        { id: 'basic', label: 'Basic Settings', icon: 'i-lucide-layout-dashboard' },
        { id: 'service', label: 'Service Settings', icon: 'i-lucide-not-a-real-icon' },
      ],
    });

    expect(grouped.map((group) => group.icon)).toEqual(['i-lucide-layout-dashboard', 'i-lucide-sliders-horizontal']);

    const undeclared = collectMemoryMapUiGroups(sampleMap);
    expect(undeclared.every((group) => group.icon === 'i-lucide-sliders-horizontal')).toBe(true);
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

  it('should group settings by driver section names in first-seen order', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('backlight', 'Backlight', 'Display', 2),
        setting('beep', 'Key Beep', 'Audio', 1),
        setting('brightness', 'Brightness', 'Display', 0),
        setting('callsign', 'My Callsign', 'APRS'),
      ]),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Display', 'Audio', 'APRS']);
    expect(grouped.map((group) => group.fields.map((field) => field.fieldId))).toEqual([
      ['backlight', 'brightness'],
      ['beep'],
      ['callsign'],
    ]);
    expect(grouped.map((group) => group.groups)).toEqual([[], [], []]);
    expect(grouped.every((group) => !/\d/.test(group.label))).toBe(true);
  });

  it('should replace declared groups and ignore menu numbers when a section is set', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap(
        [
          setting('tx', 'TX Inhibit', 'Transmit', 10),
          {
            ...setting('pitch', 'CW Pitch', undefined, 70),
            ui: { ...setting('pitch', 'CW Pitch', undefined, 70).ui, section: 100 },
          } as RadioMemoryMapField,
        ],
        [{ id: 'misc', label: 'Should Not Show', icon: 'i-lucide-wrench' }],
      ),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Transmit', 'Other']);
    expect(grouped[0]?.icon).toBe('i-lucide-sliders-horizontal');
    expect(grouped[0]?.fields.map((field) => field.fieldId)).toEqual(['tx']);
    expect(grouped[1]?.fields.map((field) => field.fieldId)).toEqual(['pitch']);
  });

  it('should put settings without a section in a final Other group', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('squelch', 'Squelch'),
        setting('beep', 'Key Beep', 'Audio'),
        setting('contrast', 'Contrast', 'Display'),
        setting('apo', 'Auto Power Off', 'Other'),
        setting('units', 'Speed'),
      ]),
    );

    expect(grouped.map((group) => ({ id: group.id, label: group.label }))).toEqual([
      { id: 'audio', label: 'Audio' },
      { id: 'display', label: 'Display' },
      { id: 'other', label: 'Other' },
    ]);
    expect(grouped[2]?.fields.map((field) => field.fieldId)).toEqual(['squelch', 'apo', 'units']);
  });

  it('should keep the current group layout when no setting has a section', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap(
        [setting('squelch', 'Squelch'), setting('timeout', 'Timeout')],
        [{ id: 'misc', label: 'Basic Settings', icon: 'i-lucide-sliders-horizontal' }],
      ),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Basic Settings']);
    expect(grouped[0]?.id).toBe('misc');
    expect(grouped[0]?.fields.map((field) => field.fieldId)).toEqual(['squelch', 'timeout']);
  });

  it('should ignore blank sections and menu numbers used as section values', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap(
        [
          setting('squelch', 'Squelch', '   '),
          {
            ...setting('timeout', 'Timeout'),
            ui: { ...setting('timeout', 'Timeout').ui, section: 100 },
          } as RadioMemoryMapField,
        ],
        [{ id: 'misc', label: 'Basic Settings' }],
      ),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Basic Settings']);
  });

  it('should prefer ui.section and fall back to a top-level section', () => {
    const contrast = setting('contrast', 'Contrast');
    const volume = setting('volume', 'Volume', 'Audio');
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('beep', 'Key Beep', 'Audio'),
        { ...contrast, section: 'Display' } as RadioMemoryMapField,
        { ...volume, section: 'Ignored' } as RadioMemoryMapField,
      ]),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Audio', 'Display']);
    expect(grouped[0]?.fields.map((field) => field.fieldId)).toEqual(['beep', 'volume']);
    expect(grouped[1]?.fields.map((field) => field.fieldId)).toEqual(['contrast']);
  });

  it('should sort sections by the smallest ui.sectionOrder and keep Other last', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('group', 'Group name', 'Memory', undefined, 2),
        setting('callsign', 'My Callsign', 'Digital', undefined, 6),
        setting('inhibit', 'TX Inhibit', 'TX/RX', undefined, 9),
        setting('pitch', 'CW Pitch', 'TX/RX', undefined, 1),
        setting('monitor', 'TX Monitor', 'Audio File', undefined, 3),
        setting('beep', 'Key Beep', 'Configuration', undefined, 9),
        setting('ssid', 'SSID', 'APRS', undefined, 5),
        setting('plain', 'Squelch'),
        setting('notes', 'Notes'),
      ]),
    );

    expect(grouped.map((group) => group.label)).toEqual([
      'TX/RX',
      'Memory',
      'Audio File',
      'APRS',
      'Digital',
      'Configuration',
      'Other',
    ]);
    expect(grouped[0]?.fields.map((field) => field.fieldId)).toEqual(['inhibit', 'pitch']);
    expect(grouped.at(-1)?.fields.map((field) => field.fieldId)).toEqual(['plain', 'notes']);
  });

  it('should place sections without sectionOrder after ordered ones, in first-seen order', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('group', 'Group name', 'Memory'),
        setting('beep', 'Key Beep', 'Configuration', undefined, 9),
        setting('ssid', 'SSID', 'APRS'),
        setting('inhibit', 'TX Inhibit', 'TX/RX', undefined, 1),
        setting('misc', 'Notes', 'Other', undefined, 0),
      ]),
    );

    expect(grouped.map((group) => group.label)).toEqual(['TX/RX', 'Configuration', 'Memory', 'APRS', 'Other']);
    expect(grouped.at(-1)?.fields.map((field) => field.fieldId)).toEqual(['misc']);
  });

  it('should ignore a non-finite sectionOrder and keep equal ranks in first-seen order', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([
        setting('monitor', 'TX Monitor', 'Audio File', undefined, 3),
        setting('ssid', 'SSID', 'APRS', undefined, 3),
        {
          ...setting('group', 'Group name', 'Memory'),
          ui: { ...setting('group', 'Group name', 'Memory').ui, sectionOrder: Number.NaN },
        } as RadioMemoryMapField,
      ]),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Audio File', 'APRS', 'Memory']);
  });

  it('should trim section names and keep a single Other group when that is the only section', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([setting('beep', 'Key Beep', '  Audio  '), setting('squelch', 'Squelch', 'Other')]),
    );

    expect(grouped.map((group) => group.label)).toEqual(['Audio', 'Other']);
    expect(grouped[0]?.fields.map((field) => field.ui.label)).toEqual(['Key Beep']);
    expect(grouped[1]?.fields.map((field) => field.fieldId)).toEqual(['squelch']);
  });
});
