import { describe, expect, it } from 'vitest';
import { ignoreEntriesFromModuleJson, moduleIdentityFromInstallPath } from '../../app/utils/menu-capture-module-config.ts';
import {
  MENU_CAPTURE_SCHEMA_VERSION,
  buildMenuCaptureZip,
  parseMenuCaptureDocument,
  parseMenuCaptureZip,
  serializeMenuCaptureDocument,
  sha256Hex,
  type MenuCaptureDocument,
} from '../../app/utils/menu-capture.ts';

function sampleDocument(): MenuCaptureDocument {
  return {
    schemaVersion: MENU_CAPTURE_SCHEMA_VERSION,
    kind: 'ham-radio-menu-capture',
    exportedAt: '2026-11-24T18:04:11.000Z',
    app: { name: 'HamBench', version: '3.11.0' },
    operator: { callsign: 'W5KA' },
    radio: {
      manufacturer: 'Kenwood',
      model: 'TH-D74',
      moduleVersion: '1.15.1',
      firmware: null,
    },
    ignore: [],
    baseline: {
      file: 'images/baseline.img',
      byteLength: 4,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      readAt: '2026-11-24T17:40:02.000Z',
    },
    steps: [
      {
        index: 1,
        readAt: '2026-11-24T17:44:18.000Z',
        comparedTo: { kind: 'baseline' },
        menu: { number: 100, name: 'Beep', nameSource: 'map' },
        change: { from: 'Off', to: 'On' },
        image: { file: 'images/step-001.img', byteLength: 4, sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
        flags: [],
        diff: { byteCount: 1, runCount: 1, ignoredByteCount: 0, runs: [] },
      },
    ],
  };
}

describe('menu capture schema and zip', () => {
  it('round-trips JSON and drops unknown keys', () => {
    const text = serializeMenuCaptureDocument(sampleDocument());
    const withExtra = JSON.parse(text) as Record<string, unknown>;
    withExtra.extra = 'ignored';
    const parsed = parseMenuCaptureDocument(JSON.stringify(withExtra));

    expect(parsed).not.toHaveProperty('extra');
    expect(parsed.steps).toHaveLength(1);
  });

  it('reads capture.ignore from raw module JSON for the matching model', () => {
    const kenwood = JSON.stringify({
      id: { model: 'TH-D74' },
      capture: { ignore: [{ address: '0x038C', length: 1, reason: 'Read counter' }] },
    });
    const other = JSON.stringify({
      id: { model: 'TM-D710' },
      capture: { ignore: [{ address: '0x0001', length: 2 }] },
    });

    expect(ignoreEntriesFromModuleJson('TH-D74', [other, kenwood])).toEqual([
      { address: '0x038C', length: 1, reason: 'Read counter' },
    ]);
    expect(moduleIdentityFromInstallPath('/data/radio-module-kenwood/1.15.1')).toEqual({
      moduleId: 'radio-module-kenwood',
      version: '1.15.1',
    });
  });

  it('rejects the wrong schema version', () => {
    const broken = { ...sampleDocument(), schemaVersion: 2 };

    expect(() => parseMenuCaptureDocument(JSON.stringify(broken))).toThrow(/schema version/i);
  });

  it('packages capture.json and image files in a zip', async () => {
    const baseline = Uint8Array.from([1, 2, 3, 4]);
    const step = Uint8Array.from([1, 2, 3, 5]);
    const zip = buildMenuCaptureZip(sampleDocument(), {
      'baseline.img': baseline,
      'step-001.img': step,
    });
    const unpacked = parseMenuCaptureZip(zip);

    expect(unpacked.document.baseline.byteLength).toBe(4);
    expect(unpacked.images.get('baseline.img')).toEqual(baseline);
    expect(unpacked.images.get('step-001.img')).toEqual(step);
    expect(await sha256Hex(baseline)).toHaveLength(64);
  });
});