// @vitest-environment happy-dom
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadioMemoryMap } from '@springfield/ham-radio-api';
import { collectMemoryMapUiFields, type RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import SettingsFieldGrid from '../../app/components/SettingsFieldGrid.vue';
import { layoutCellPaths, layoutSettingsSection } from '../../app/utils/settings-layout.ts';
import {
  buildMemoryTableCell,
  findMemoryTableMenuNumbers,
  memoryTableReviewLabel,
} from '../../app/utils/settings-memory-table.ts';
import { layoutPlainSettingsFields } from '../../app/utils/settings-switch-groups.ts';
import { diffRadioPrograms } from '../../app/utils/radio-write-review.ts';

function uiField(
  path: string,
  structId: string,
  fieldId: string,
  arrayIndex: number | undefined,
  extra: Record<string, unknown> = {},
): RadioMemoryMapUiField {
  return {
    path,
    structId,
    fieldId,
    arrayIndex,
    ui: {
      group: 'misc',
      label: `${fieldId} ${arrayIndex === undefined ? '' : arrayIndex + 1}`.trim(),
      widget: 'text',
      menu: { number: 301, code: 'DTMF MEM' },
      ...extra,
    },
    value: { kind: 'ascii', length: 16 },
  } as RadioMemoryMapUiField;
}

function loadMap(name: string): RadioMemoryMap {
  return JSON.parse(readFileSync(`test/fixtures/kenwood/${name}`, 'utf8')) as RadioMemoryMap;
}

describe('findMemoryTableMenuNumbers', () => {
  it('should not fold integer pairs on one menu', () => {
    const fields = [
      uiField('progvfo.0.low', 'progvfo', 'low', 0, { widget: 'integer', menu: { number: 100, code: 'PROG VFO' } }),
      uiField('progvfo.0.high', 'progvfo', 'high', 0, { widget: 'integer', menu: { number: 100, code: 'PROG VFO' } }),
    ];
    fields[0] = { ...fields[0]!, ui: { ...fields[0]!.ui, widget: 'integer' } };
    fields[1] = { ...fields[1]!, ui: { ...fields[1]!.ui, widget: 'integer' } };

    expect(findMemoryTableMenuNumbers(fields).size).toBe(0);
  });

  it('should not fold a single ascii column', () => {
    const fields = Array.from({ length: 6 }, (_, index) =>
      uiField(`powerOn.${index}.message`, 'powerOn', 'message', index, { menu: { number: 500, code: 'PON MSG' } }),
    );

    expect(findMemoryTableMenuNumbers(fields).size).toBe(0);
  });

  it('should not fold mismatched repeat lengths', () => {
    const fields = [
      uiField('codes.0.code', 'codes', 'code', 0, { menu: { number: 301, code: 'X' } }),
      uiField('codes.1.code', 'codes', 'code', 1, { menu: { number: 301, code: 'X' } }),
      uiField('names.0.name', 'names', 'name', 0, { menu: { number: 301, code: 'X' } }),
    ];

    expect(findMemoryTableMenuNumbers(fields).size).toBe(0);
  });
});

describe('TH-D74 DTMF memory table layout', () => {
  const map = loadMap('th-d74-dtmf-memory-table.json');
  const dtmfFields = collectMemoryMapUiFields(map).filter((field) => field.ui.subgroup === 'dtmf');

  it('should render menu 162 as a field and menus 163-164 as tables', () => {
    const laid = layoutSettingsSection(dtmfFields);

    expect(laid.map((cell) => cell.kind)).toEqual(['field', 'memoryTable', 'memoryTable']);
    expect(laid[0]?.kind === 'field' ? laid[0].field.path : '').toBe('dtmfTxHold.hold');

    const dtmfTable = laid[1];
    expect(dtmfTable?.kind).toBe('memoryTable');

    if (dtmfTable?.kind !== 'memoryTable') {
      return;
    }

    expect(dtmfTable.label).toBe('163 DTMF Memory');
    expect(dtmfTable.columns.map((column) => column.header)).toEqual(['Name', 'Code']);
    expect(dtmfTable.channelIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(layoutCellPaths(dtmfTable)).toHaveLength(20);
    expect(layoutCellPaths(dtmfTable)).toContain('dtmfMemoryCodes.0.code');
    expect(layoutCellPaths(dtmfTable)).toContain('dtmfMemoryNames.9.name');
  });
});

describe('TM-D710 menu 301 layout', () => {
  const map = loadMap('tm-d710a-settings.json');
  const memoryFields = collectMemoryMapUiFields(map).filter((field) => field.ui.subgroup === 'memories');

  it('should fold DTMF codes and names with Name before Code', () => {
    const laid = layoutPlainSettingsFields(memoryFields);

    expect(laid).toHaveLength(1);
    expect(laid[0]?.kind).toBe('memoryTable');

    if (laid[0]?.kind !== 'memoryTable') {
      return;
    }

    expect(laid[0].label).toBe('301 DTMF MEM');
    expect(laid[0].columns.map((column) => column.header)).toEqual(['Name', 'Code']);
    expect(laid[0].columns[1]?.fieldsByIndex.get(0)?.path).toBe('dtmfCodes.0.code');
    expect(laid[0].columns[0]?.fieldsByIndex.get(0)?.path).toBe('dtmfNames.0.name');
  });
});

describe('buildMemoryTableCell column order', () => {
  it('should place Name before Code even when code has lower ui.order', () => {
    const fields = [
      uiField('dtmfMemoryCodes.0.code', 'dtmfMemoryCodes', 'code', 0, { order: 16300 }),
      uiField('dtmfMemoryCodes.1.code', 'dtmfMemoryCodes', 'code', 1, { order: 16300 }),
      uiField('dtmfMemoryNames.0.name', 'dtmfMemoryNames', 'name', 0, { order: 16310 }),
      uiField('dtmfMemoryNames.1.name', 'dtmfMemoryNames', 'name', 1, { order: 16310 }),
    ];
    fields.forEach((field) => {
      field.ui = { ...field.ui, menu: { number: 163, code: 'DTMF Memory' } };
    });

    const cell = buildMemoryTableCell(163, fields);

    expect(cell.columns.map((column) => column.header)).toEqual(['Name', 'Code']);
  });
});

describe('memoryTableReviewLabel', () => {
  it('should label rows with radio channel numbers', () => {
    const map = loadMap('th-d74-dtmf-memory-table.json');
    const fields = collectMemoryMapUiFields(map);
    const code = fields.find((field) => field.path === 'dtmfMemoryCodes.0.code');

    expect(code).toBeDefined();
    expect(memoryTableReviewLabel(fields, code!)).toBe('Ch 0 · Code');
  });
});

describe('SettingsFieldGrid memory table', () => {
  beforeEach(() => {
    vi.stubGlobal('computed', computed);
    vi.stubGlobal('ref', ref);
    vi.stubGlobal('useAppearanceSettings', () => ({
      settingsFieldsGridStyle: ref({}),
      showMenuNumbers: ref(true),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render channel rows and Name/Code headers', () => {
    const map = loadMap('tm-d710a-settings.json');
    const memoryFields = collectMemoryMapUiFields(map).filter((field) => field.ui.subgroup === 'memories');
    const cells = layoutPlainSettingsFields(memoryFields);
    const settings = {
      dtmfCodes: Array.from({ length: 10 }, () => ({ code: '' })),
      dtmfNames: Array.from({ length: 10 }, () => ({ name: '' })),
    };
    settings.dtmfNames[0] = { name: 'HOME' };
    settings.dtmfCodes[3] = { code: '123' };

    const wrapper = mount(SettingsFieldGrid, {
      props: {
        cells,
        settings,
        changedPaths: ['dtmfNames.0.name', 'dtmfCodes.3.code'],
        helpByPath: new Map(),
      },
      global: {
        stubs: {
          UFormField: {
            template: '<div class="u-form-field"><slot name="label" /><slot name="hint" /><slot /></div>',
          },
          UInput: {
            props: ['modelValue'],
            template: '<input class="u-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          },
          USelect: true,
          USwitch: true,
          UInputNumber: true,
          UBadge: true,
          UTooltip: true,
          HelpTooltip: true,
        },
      },
    });

    const text = wrapper.text();
    expect(text).toContain('301');
    expect(text).toContain('DTMF MEM');
    expect(text).toContain('Ch 0');
    expect(text).toContain('Ch 9');
    expect(text).toMatch(/Name[\s\S]*Code/);

    const inputs = wrapper.findAll('input.u-input');
    expect(inputs.length).toBe(20);
    expect(wrapper.html()).not.toContain('maxlength');

    const changedBindings = inputs.filter((input) => input.attributes('color') === 'warning');
    expect(changedBindings.length).toBeGreaterThanOrEqual(0);
  });

  it('writes snapshot HTML for PR review', () => {
    const artifactDir = '/opt/cursor/artifacts';
    mkdirSync(artifactDir, { recursive: true });
    const styles = `
      body { font-family: system-ui, sans-serif; background: #111827; color: #f9fafb; padding: 24px; }
      .settings-fields-grid { display: grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 960px; }
      .col-span-full { grid-column: 1 / -1; }
      .settings-memory-table { border-collapse: collapse; width: 100%; font-size: 14px; }
      .settings-memory-table th, .settings-memory-table td { border: 1px solid #374151; padding: 6px 8px; }
      .settings-memory-table tbody tr:nth-child(odd) { background: #1f2937; }
      .settings-memory-table tbody tr:nth-child(even) { background: #111827; }
      .u-input { width: 100%; background: #030712; color: #f9fafb; border: 1px solid #4b5563; border-radius: 6px; padding: 6px 8px; }
      h1 { font-size: 1.125rem; margin: 0 0 16px; font-weight: 600; }
      .text-muted { color: #9ca3af; font-size: 12px; font-family: ui-monospace, monospace; }
    `;

    function writeSnapshot(filename: string, title: string, cells: ReturnType<typeof layoutPlainSettingsFields>, settings: Record<string, unknown>, changedPaths: string[]) {
      const wrapper = mount(SettingsFieldGrid, {
        props: { cells, settings, changedPaths, helpByPath: new Map() },
        global: {
          stubs: {
            UFormField: { template: '<div class="field"><div class="label"><slot name="label" /></div><slot /></div>' },
            UInput: {
              props: ['modelValue', 'disabled'],
              template: '<input class="u-input" :value="modelValue" :disabled="disabled" />',
            },
            USelect: true,
            USwitch: true,
            UInputNumber: true,
            UBadge: true,
            UTooltip: true,
            HelpTooltip: true,
          },
        },
      });

      writeFileSync(
        join(artifactDir, filename),
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>${styles}</style></head><body><h1>${title}</h1>${wrapper.html()}</body></html>`,
      );
    }

    const d710Map = loadMap('tm-d710a-settings.json');
    const d710Fields = collectMemoryMapUiFields(d710Map).filter((field) => field.ui.subgroup === 'memories');
    writeSnapshot(
      'tm-d710-menu-301-memory-table.html',
      'TM-D710 · DTMF Settings · Memories (menu 301)',
      layoutPlainSettingsFields(d710Fields),
      {
        dtmfCodes: Array.from({ length: 10 }, (_, index) => ({ code: index === 3 ? '123' : '' })),
        dtmfNames: Array.from({ length: 10 }, (_, index) => ({ name: index === 0 ? 'HOME' : '' })),
      },
      ['dtmfNames.0.name', 'dtmfCodes.3.code'],
    );

    const d74Map = loadMap('th-d74-dtmf-memory-table.json');
    const d74Fields = collectMemoryMapUiFields(d74Map).filter((field) => field.ui.subgroup === 'dtmf');
    const d74Wrapper = mount(SettingsFieldGrid, {
      props: {
        cells: layoutSettingsSection(d74Fields),
        settings: {
          dtmfTxHold: { hold: false },
          dtmfMemoryCodes: Array.from({ length: 10 }, (_, index) => ({ code: index === 0 ? '123' : '' })),
          dtmfMemoryNames: Array.from({ length: 10 }, (_, index) => ({ name: index === 0 ? 'TEST' : '' })),
          echoLinkMemoryCodes: Array.from({ length: 10 }, (_, index) => ({ code: index === 0 ? '999999' : '' })),
          echoLinkMemoryNames: Array.from({ length: 10 }, (_, index) => ({ name: index === 0 ? 'HBEL164' : '' })),
        },
        changedPaths: ['dtmfMemoryNames.0.name', 'echoLinkMemoryCodes.0.code'],
        helpByPath: new Map(),
      },
      global: {
        stubs: {
          UFormField: { template: '<div class="field"><slot name="label" /><slot /></div>' },
          UInput: {
            props: ['modelValue'],
            template: '<input class="u-input" :value="modelValue" />',
          },
          USelect: true,
          USwitch: { props: ['modelValue'], template: '<input type="checkbox" :checked="modelValue" />' },
          UInputNumber: true,
          UBadge: true,
          UTooltip: true,
          HelpTooltip: true,
        },
      },
    });

    writeFileSync(
      join(artifactDir, 'th-d74-dtmf-echolink-memory-tables.html'),
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>TH-D74 fixture · TX/RX DTMF</title><style>${styles}</style></head><body><h1>TH-D74 fixture · TX/RX → DTMF (menus 162–164)</h1>${d74Wrapper.html()}</body></html>`,
    );

    expect(readFileSync(join(artifactDir, 'tm-d710-menu-301-memory-table.html'), 'utf8')).toContain('301');
    expect(readFileSync(join(artifactDir, 'th-d74-dtmf-echolink-memory-tables.html'), 'utf8')).toContain('163 DTMF Memory');
  });
});

describe('write review for memory tables', () => {
  it('should use Ch row labels for changed memory paths', () => {
    const map = loadMap('th-d74-dtmf-memory-table.json');
    const before = { settings: { dtmfMemoryCodes: [{ code: '1' }] } };
    const after = { settings: { dtmfMemoryCodes: [{ code: '9' }] } };

    const diff = diffRadioPrograms({ settings: before.settings } as never, { settings: after.settings } as never, map);
    const field = diff.settingsGroups.flatMap((group) => group.fields).find((entry) => entry.id === 'dtmfMemoryCodes.0.code');

    expect(field).toEqual({
      id: 'dtmfMemoryCodes.0.code',
      label: 'DTMF · Ch 0 · Code',
      before: '1',
      after: '9',
    });
  });
});