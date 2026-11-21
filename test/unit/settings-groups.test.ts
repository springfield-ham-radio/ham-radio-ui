import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RadioMemoryMap, RadioMemoryMapField } from '@springfield/ham-radio-api';
import { collectMemoryMapUiGroups, fieldSubgroup } from '../../app/utils/settings-groups.ts';
import { layoutSettingsFields } from '../../app/utils/settings-switch-groups.ts';

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

  it('should keep section order when menu numbers would sort the other way', () => {
    const callsign = setting('callsign', 'My Callsign', 'APRS', undefined, 5);
    const beacon = setting('beacon', 'Beacon', 'APRS', undefined, 5);
    callsign.ui = { ...callsign.ui!, menu: { number: 500, code: 'My Callsign' } };
    beacon.ui = { ...beacon.ui!, menu: { number: 100, code: 'Beacon' } };

    const grouped = collectMemoryMapUiGroups(sectionMap([callsign, beacon, setting('beep', 'Key Beep', 'Audio', undefined, 1)]));

    expect(grouped.map((group) => group.label)).toEqual(['Audio', 'APRS']);
    expect(grouped[1]?.fields.map((field) => field.ui.label)).toEqual(['My Callsign', 'Beacon']);
    expect(grouped[1]?.fields.map((field) => field.ui.menu?.number)).toEqual([500, 100]);
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

  it('should keep a flat section page when no field has a subgroup', () => {
    const grouped = collectMemoryMapUiGroups(
      sectionMap([setting('beep', 'Key Beep', 'Audio', undefined, 1), setting('callsign', 'My Callsign', 'APRS', undefined, 5)]),
    );

    expect(grouped.map((group) => group.groups)).toEqual([[], []]);
  });

  it('should order undeclared subgroup headings by the smallest menu number, then first-seen', () => {
    const beacon = setting('method', 'Method', 'APRS', undefined, 5);
    const qsy = setting('offset', 'Shift', 'APRS', undefined, 5);
    const plain = setting('notes', 'Notes', 'APRS', undefined, 5);
    const laterPlain = setting('comment', 'Comment', 'APRS', undefined, 5);
    beacon.ui = { ...beacon.ui!, subgroup: 'beacon-tx', menu: { number: 510, code: 'Method' } };
    qsy.ui = { ...qsy.ui!, subgroup: 'qsy', menu: { number: 522, code: 'Shift' } };
    plain.ui = { ...plain.ui!, subgroup: 'notes' };
    laterPlain.ui = { ...laterPlain.ui!, subgroup: 'comment' };

    const grouped = collectMemoryMapUiGroups(sectionMap([qsy, beacon, laterPlain, plain]));
    const aprs = grouped[0];

    expect(aprs?.label).toBe('APRS');
    expect(aprs?.groups.map((subgroup) => subgroup.label)).toEqual(['Beacon Tx', 'Qsy', 'Comment', 'Notes']);
    expect(aprs?.groups.map((subgroup) => subgroup.id)).toEqual(['beacon-tx', 'qsy', 'comment', 'notes']);
  });

  it('should use a declared parent by ui.group id before a label match', () => {
    const method = setting('method', 'Method', 'APRS', undefined, 5);
    method.ui = { ...method.ui!, group: 'aprs', subgroup: 'basic-settings', menu: { number: 500, code: 'Method' } };

    const grouped = collectMemoryMapUiGroups(
      sectionMap(
        [method],
        [
          { id: 'aprs', label: 'Wrong', groups: [{ id: 'basic-settings', label: 'From Id' }] },
          { id: 'other', label: 'APRS', groups: [{ id: 'basic-settings', label: 'From Label' }] },
        ],
      ),
    );

    expect(grouped[0]?.groups.map((subgroup) => subgroup.label)).toEqual(['From Id']);
    expect(grouped[0]?.icon).toBe('i-lucide-sliders-horizontal');
  });

  it('should use a declared parent whose label equals the section when ui.group does not match', () => {
    const method = setting('method', 'Method', 'APRS', undefined, 5);
    method.ui = { ...method.ui!, group: 'legacy', subgroup: 'qsy', menu: { number: 522, code: 'QSY' } };

    const grouped = collectMemoryMapUiGroups(
      sectionMap(
        [method],
        [{ id: 'aprs', label: 'APRS', icon: 'i-lucide-map-pinned', groups: [{ id: 'qsy', label: 'QSY Information' }] }],
      ),
    );

    expect(grouped[0]?.groups.map((subgroup) => subgroup.label)).toEqual(['QSY Information']);
    expect(grouped[0]?.icon).toBe('i-lucide-map-pinned');
  });
});

/**
 * Kenwood TH-D74 memory map from radio-module-kenwood
 * branch cursor/th-d74-aprs-beacon-510-515-a7aa at 2341c6a.
 * `ui.section` is the radio menu category. Nested `memoryMap.groups` are the
 * sub-group headings, in menu order. `ui.order` is menu*100, and every menu
 * 516 field uses 51600.
 */
const thD74MenuSections = JSON.parse(
  readFileSync(new URL('../fixtures/kenwood/th-d74-menu-sections.json', import.meta.url), 'utf8'),
) as RadioMemoryMap;

describe('collectMemoryMapUiGroups TH-D74 menu sections', () => {
  const grouped = collectMemoryMapUiGroups(thD74MenuSections);

  it('should list only the radio menu categories in the sidebar', () => {
    expect(grouped.map((group) => group.label)).toEqual([
      'TX/RX',
      'Memory',
      'Audio File',
      'APRS',
      'Digital',
      'Configuration',
    ]);
    expect(grouped.map((group) => group.id)).toEqual([
      'tx-rx',
      'memory',
      'audio-file',
      'aprs',
      'digital',
      'configuration',
    ]);
    expect(grouped.map((group) => group.icon)).toEqual([
      'i-lucide-radio-tower',
      'i-lucide-database',
      'i-lucide-audio-lines',
      'i-lucide-map-pinned',
      'i-lucide-satellite',
      'i-lucide-settings',
    ]);
    expect(grouped.some((group) => group.label === 'Basic Settings' || group.label === 'Beacon TX Control')).toBe(false);
  });

  it('should split APRS under the declared subgroup headings in menu order', () => {
    const aprs = grouped.find((group) => group.label === 'APRS');

    expect(aprs?.groups.map((subgroup) => subgroup.label)).toEqual([
      'Basic Settings',
      'Beacon TX Control',
      'QSY Information',
      'SmartBeaconing',
      'Waypoint',
      'Packet Filter',
      'Others',
    ]);
    expect(aprs?.groups[0]?.description).toContain('Menu 500');
    expect(aprs?.groups[1]?.description).toContain('Menus 510 through 516');
    expect(aprs?.fields.filter((field) => !fieldSubgroup(field))).toEqual([]);
  });

  it('should keep menu 516 objects in memory-map order when ui.order ties', () => {
    const beacon = grouped.find((group) => group.label === 'APRS')?.groups.find((subgroup) => subgroup.id === 'beacon-tx');
    const objectFields = beacon?.fields.filter((field) => field.ui.menu?.number === 516) ?? [];
    const labels = objectFields.map((field) => field.ui.label);

    expect(beacon?.fields[0]?.ui.label).toBe('Method');
    expect(labels[0]).toBe('Latitude Degrees 1');
    expect(labels.indexOf('Name 1')).toBeLessThan(labels.indexOf('Latitude Degrees 2'));
    expect(labels.indexOf('Name 2')).toBeLessThan(labels.indexOf('Name 3'));
    expect(labels.at(-1)).toBe('Comment 3');
    expect(objectFields.map((field) => field.path).filter((path) => path.endsWith('.name'))).toEqual([
      'aprsObject.0.name',
      'aprsObject.1.name',
      'aprsObject.2.name',
    ]);
  });

  it('should fold boolean switches that share a menu number inside one subgroup', () => {
    const basic = grouped.find((group) => group.label === 'APRS')?.groups.find((subgroup) => subgroup.id === 'basic-settings');
    const cells = layoutSettingsFields(basic?.fields ?? []);
    const lock = cells.find((cell) => cell.kind === 'switches' && cell.group.menuNumber === 509);

    expect(lock?.kind).toBe('switches');

    if (lock?.kind !== 'switches') {
      return;
    }

    expect(lock.group.fields.map((field) => field.ui.label)).toEqual(['Frequency', 'PTT', 'APRS Key']);
    expect(cells.filter((cell) => (cell.kind === 'switches' ? cell.group.menuNumber : cell.field.ui.menu?.number) === 509)).toHaveLength(1);
  });

  it('should leave Memory group names ungrouped and ahead of Memory Channel', () => {
    const memory = grouped.find((group) => group.label === 'Memory');
    const ungrouped = memory?.fields.filter((field) => !fieldSubgroup(field)) ?? [];

    expect(memory?.groups.map((subgroup) => subgroup.label)).toEqual(['Memory Channel']);
    expect(ungrouped.map((field) => field.ui.label)).toEqual(
      Array.from({ length: 30 }, (_, index) => `Group name ${index + 1}`),
    );
    expect(memory?.groups[0]?.fields.map((field) => field.ui.label)).toEqual(['Recall Method']);
    expect(memory?.groups.some((subgroup) => subgroup.fields.some((field) => field.structId === 'groupNames'))).toBe(false);
  });

  it('should use the declared subgroup labels for the other menu categories', () => {
    expect(grouped.find((group) => group.label === 'TX/RX')?.groups.map((subgroup) => subgroup.label)).toEqual([
      'RX',
      'TX',
      'RX Filter',
      'Scan',
      'Repeater',
      'VOX',
      'DTMF',
      'CW',
      'Others',
    ]);
    expect(grouped.find((group) => group.label === 'Configuration')?.groups.map((subgroup) => subgroup.label)).toEqual([
      'Display',
      'Audio',
      'Battery',
      'Auxiliary',
      'Lock',
      'Units',
    ]);
    expect(grouped.find((group) => group.label === 'Digital')?.groups[0]).toMatchObject({
      id: 'tx-rx',
      label: 'TX/RX',
    });
    expect(grouped.find((group) => group.label === 'Audio File')?.groups.map((subgroup) => subgroup.label)).toEqual([
      'Voice Message',
    ]);
  });
});
