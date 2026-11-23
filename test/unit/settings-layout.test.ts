import { describe, expect, it } from 'vitest';
import type { RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { layoutCellPaths, layoutSettingsSection } from '../../app/utils/settings-layout.ts';
import { recordFieldLabel } from '../../app/utils/settings-record.ts';
import { layoutSettingsFields } from '../../app/utils/settings-switch-groups.ts';

function uiField(
  id: string,
  label: string,
  extra: Record<string, unknown> = {},
  order?: number,
): RadioMemoryMapUiField {
  return {
    path: id,
    structId: 'settings',
    fieldId: id,
    ui: {
      group: 'aprs',
      subgroup: 'beacon-tx',
      label,
      widget: 'text',
      section: 'APRS',
      menu: { number: 516, code: 'Object' },
      ...(order === undefined ? {} : { order }),
      ...extra,
    },
  } as RadioMemoryMapUiField;
}

function record(index: number, label = `Object ${index}`) {
  return { id: 'aprs-object', index, label };
}

function coordinate(
  id: string,
  axis: 'lat' | 'lon',
  part: 'degrees' | 'minutes' | 'fraction' | 'hemisphere',
  label: string,
) {
  return { id, kind: 'coordinate', axis, part, fractionScale: 10000, label };
}

describe('layoutSettingsSection', () => {
  it('should leave fields without record or composite keys unchanged', () => {
    const fields = [
      uiField('method', 'Method', { widget: 'select', menu: { number: 510, code: 'Method' } }, 51000),
      uiField('speed', 'Speed', { widget: 'switch', value: undefined, menu: { number: 514, code: 'Speed' } }, 51400),
      uiField('altitude', 'Altitude', { widget: 'switch', menu: { number: 514, code: 'Speed' } }, 51401),
    ];
    fields[1] = { ...fields[1], value: { kind: 'boolean' } } as RadioMemoryMapUiField;
    fields[2] = { ...fields[2], value: { kind: 'boolean' } } as RadioMemoryMapUiField;

    const laid = layoutSettingsSection(fields);
    const plain = layoutSettingsFields(fields);

    expect(laid.map((cell) => cell.kind)).toEqual(plain.map((cell) => cell.kind));
    expect(laid.map((cell) => (cell.kind === 'field' ? cell.field.path : cell.kind === 'switches' ? cell.group.menuNumber : cell.kind))).toEqual(
      plain.map((cell) => (cell.kind === 'field' ? cell.field.path : cell.kind === 'switches' ? cell.group.menuNumber : cell.kind)),
    );
  });

  it('should render one tab strip per record id, ordered by index, at the first field', () => {
    const fields = [
      uiField('method', 'Method', { menu: { number: 510, code: 'Method' } }, 51000),
      uiField('name3', 'Name 3', { record: record(3) }, 51600),
      uiField('comment', 'Comment', {}, 51650),
      uiField('name1', 'Name 1', { record: record(1) }, 51600),
      uiField('type1', 'Type 1', { record: record(1) }, 51610),
      uiField('name2', 'Name 2', { record: record(2) }, 51600),
    ];

    const laid = layoutSettingsSection(fields);

    expect(laid.map((cell) => cell.kind)).toEqual(['field', 'records', 'field']);
    expect(laid[0]?.kind === 'field' ? laid[0].field.ui.label : '').toBe('Method');
    expect(laid[2]?.kind === 'field' ? laid[2].field.ui.label : '').toBe('Comment');

    const records = laid[1];
    expect(records?.kind).toBe('records');

    if (records?.kind !== 'records') {
      return;
    }

    expect(records.tabs.map((tab) => tab.label)).toEqual(['Object 1', 'Object 2', 'Object 3']);
    expect(records.tabs[0]?.cells.map((cell) => (cell.kind === 'field' ? recordFieldLabel(cell.field) : cell.kind))).toEqual([
      'Name',
      'Type',
    ]);
    expect(records.tabs[1]?.cells.map((cell) => (cell.kind === 'field' ? recordFieldLabel(cell.field) : ''))).toEqual(['Name']);
  });

  it('should keep equal ui.order in memory-map order inside a tab', () => {
    const fields = [
      uiField('type', 'Type', { record: record(1) }, 51600),
      uiField('name', 'Name', { record: record(1) }, 51600),
    ];
    const laid = layoutSettingsSection(fields);
    const records = laid[0];

    expect(records?.kind).toBe('records');

    if (records?.kind !== 'records') {
      return;
    }

    expect(records.tabs[0]?.cells.map((cell) => (cell.kind === 'field' ? cell.field.fieldId : ''))).toEqual(['type', 'name']);
  });

  it('should fold coordinate parts into one input at the first part', () => {
    const fields = [
      uiField('name', 'Name', { record: record(1) }, 51610),
      uiField('latDeg', 'Latitude Degrees', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'degrees', 'Latitude') }, 51630),
      uiField('lonDeg', 'Longitude Degrees', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'degrees', 'Longitude') }, 51640),
      uiField('latMin', 'Latitude Minutes', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'minutes', 'Latitude') }, 51631),
      uiField('latFrac', 'Latitude Fraction', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'fraction', 'Latitude') }, 51632),
      uiField('lonMin', 'Longitude Minutes', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'minutes', 'Longitude') }, 51641),
      uiField('lonFrac', 'Longitude Fraction', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'fraction', 'Longitude') }, 51642),
    ];
    const laid = layoutSettingsSection(fields);
    const records = laid[0];

    expect(records?.kind).toBe('records');

    if (records?.kind !== 'records') {
      return;
    }

    const cells = records.tabs[0]?.cells ?? [];

    expect(cells.map((cell) => (cell.kind === 'field' ? 'Name' : cell.kind === 'coordinatePair' ? 'Latitude+Longitude' : cell.kind))).toEqual([
      'Name',
      'Latitude+Longitude',
    ]);

    const pair = cells[1];

    expect(pair?.kind).toBe('coordinatePair');

    if (pair?.kind !== 'coordinatePair') {
      return;
    }

    expect(pair.latitude.menuNumber).toBe(516);
    expect(pair.latitude.parts.map((part) => part.part)).toEqual(['degrees', 'minutes', 'fraction']);
    expect(pair.latitude.axis).toBe('lat');
    expect(pair.longitude.axis).toBe('lon');
    expect(layoutCellPaths(pair)).toEqual([
      'latDeg',
      'latMin',
      'latFrac',
      'lonDeg',
      'lonMin',
      'lonFrac',
    ]);
  });

  it('should keep lone coordinate cells when latitude and longitude are not adjacent', () => {
    const fields = [
      uiField('name', 'Name', { record: record(1) }, 51610),
      uiField('latDeg', 'Latitude Degrees', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'degrees', 'Latitude') }, 51630),
      uiField('latMin', 'Latitude Minutes', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'minutes', 'Latitude') }, 51631),
      uiField('latFrac', 'Latitude Fraction', { record: record(1), composite: coordinate('obj1-lat', 'lat', 'fraction', 'Latitude') }, 51632),
      uiField('method', 'Method', { record: record(1) }, 51635),
      uiField('lonDeg', 'Longitude Degrees', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'degrees', 'Longitude') }, 51640),
      uiField('lonMin', 'Longitude Minutes', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'minutes', 'Longitude') }, 51641),
      uiField('lonFrac', 'Longitude Fraction', { record: record(1), composite: coordinate('obj1-lon', 'lon', 'fraction', 'Longitude') }, 51642),
    ];
    const laid = layoutSettingsSection(fields);
    const records = laid[0];

    expect(records?.kind).toBe('records');

    if (records?.kind !== 'records') {
      return;
    }

    const cells = records.tabs[0]?.cells ?? [];

    expect(
      cells.map((cell) =>
        cell.kind === 'field' ? recordFieldLabel(cell.field) : cell.kind === 'coordinate' ? cell.label : cell.kind,
      ),
    ).toEqual(['Name', 'Latitude', 'Method', 'Longitude']);
    expect(cells[1]?.kind).toBe('coordinate');
    expect(cells[3]?.kind).toBe('coordinate');
  });

  it('should fold hemisphere into the coordinate cell and omit it from plain layout', () => {
    const fields = [
      uiField('latDeg', 'Latitude Degrees', { composite: coordinate('obj1-lat', 'lat', 'degrees', 'Latitude') }, 51630),
      uiField('latMin', 'Latitude Minutes', { composite: coordinate('obj1-lat', 'lat', 'minutes', 'Latitude') }, 51631),
      uiField('latFrac', 'Latitude Fraction', { composite: coordinate('obj1-lat', 'lat', 'fraction', 'Latitude') }, 51632),
      uiField(
        'latHem',
        'Latitude Hemisphere',
        { widget: 'select', composite: coordinate('obj1-lat', 'lat', 'hemisphere', 'Latitude') },
        51633,
      ),
      uiField('other', 'Other'),
    ];
    fields[3] = {
      ...fields[3]!,
      value: { kind: 'enum', values: ['N', 'S'] },
    } as RadioMemoryMapUiField;

    const laid = layoutSettingsSection(fields);

    expect(laid.map((cell) => cell.kind)).toEqual(['coordinate', 'field']);
    expect(laid[1]?.kind === 'field' ? laid[1].field.path : '').toBe('other');

    const latitude = laid[0];
    expect(latitude?.kind).toBe('coordinate');

    if (latitude?.kind !== 'coordinate') {
      return;
    }

    expect(latitude.parts.map((part) => part.part)).toEqual(['degrees', 'minutes', 'fraction', 'hemisphere']);
    expect(layoutCellPaths(latitude)).toEqual(['latDeg', 'latMin', 'latFrac', 'latHem']);
  });
});

describe('recordFieldLabel', () => {
  it('should drop the repeated-struct suffix and keep a short driver label', () => {
    expect(recordFieldLabel(uiField('name', 'Name 1', { record: record(1) }))).toBe('Name');
    expect(recordFieldLabel(uiField('name', 'Name', { record: record(1) }))).toBe('Name');
    expect(recordFieldLabel(uiField('method', 'Method'))).toBe('Method');
  });
});
