import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMenuCaptureExportDocument } from '../../app/utils/menu-capture-export.ts';
import {
  menuCaptureDistinctMenuCode,
  menuCaptureMenuCodeForStep,
  normalizeMenuCaptureStepMenuForExport,
  serializeMenuCaptureDocument,
  type MenuCaptureSessionState,
} from '../../app/utils/menu-capture.ts';

const session: MenuCaptureSessionState = {
  sessionId: 's1',
  savedRadioId: 'radio-1',
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T01:00:00.000Z',
  baselineReadAt: '2026-11-24T00:00:00.000Z',
  baselineSha256: 'a'.repeat(64),
  baselineByteLength: 100,
  steps: [
    {
      index: 1,
      readAt: '2026-11-24T00:30:00.000Z',
      comparedTo: { kind: 'baseline' },
      menu: { number: 181, name: 'LED Control', code: 'LED Control', nameSource: 'map' },
      change: { from: '01', to: '03' },
      flags: [],
      diff: { byteCount: 1, runCount: 1, ignoredByteCount: 0, runs: [] },
      imageFileName: 'step-001.img',
      imageSha256: 'b'.repeat(64),
      imageByteLength: 100,
    },
  ],
};

describe('menu capture export document', () => {
  it('includes module id, firmware, and operator notes', () => {
    const document = buildMenuCaptureExportDocument({
      exportedAt: '2026-11-24T02:00:00.000Z',
      app: { name: 'HamBench', version: '3.11.0' },
      operator: { callsign: 'W5KA', notes: 'Please check LED Control menu.' },
      radioId: { manufacturer: 'Kenwood', model: 'TH-D74', name: 'TH-D74' },
      moduleId: 'radio-module-kenwood-th-d74',
      moduleVersion: '1.26.0-beta.1',
      memoryMapVersion: '1.0.0',
      firmware: '1.14',
      ignore: [],
      memoryConfig: undefined,
      baselineLength: 100,
      session,
    });

    expect(document.radio.moduleId).toBe('radio-module-kenwood-th-d74');
    expect(document.radio.moduleVersion).toBe('1.26.0-beta.1');
    expect(document.radio.firmware).toBe('1.14');
    expect(document.operator.notes).toBe('Please check LED Control menu.');
    expect(document.steps[0]?.menu).not.toHaveProperty('code');
  });

  it('drops menu code when it duplicates the menu name', () => {
    expect(menuCaptureDistinctMenuCode('LED Control', 'LED Control')).toBeUndefined();
    expect(menuCaptureDistinctMenuCode('LED Control', 'FM Radio')).toBe('FM Radio');
    expect(
      menuCaptureMenuCodeForStep(
        181,
        'LED Control',
        {
          version: '1.0.0',
          structs: [
            {
              id: 'led',
              seek: '0x10',
              fields: [
                {
                  id: 'fm',
                  type: 'bits',
                  width: 1,
                  ui: { label: 'LED Control', widget: 'switch', menu: { number: 181, code: 'FM Radio' } },
                },
              ],
            },
          ],
        },
        'LED Control',
      ),
    ).toBe('FM Radio');
    expect(normalizeMenuCaptureStepMenuForExport(session.steps[0]!.menu).code).toBeUndefined();
  });

  it('export UI keeps notes separate from the saved path', () => {
    const wizard = readFileSync(new URL('../../app/components/RadioMenuCapture.vue', import.meta.url), 'utf8');

    expect(wizard).toContain('exportSavedPath');
    expect(wizard).toContain('Start new capture');
    expect(wizard).toContain("emit('close')");
    expect(wizard).not.toContain('Saved ${path}');
    expect(serializeMenuCaptureDocument(buildMenuCaptureExportDocument({
      exportedAt: '2026-11-24T02:00:00.000Z',
      app: { name: 'HamBench', version: '3.11.0' },
      operator: {},
      radioId: { manufacturer: 'Kenwood', model: 'TH-D74', name: 'TH-D74' },
      ignore: [],
      memoryConfig: undefined,
      baselineLength: 100,
      session,
    }))).not.toContain('"moduleId": ""');
  });
});