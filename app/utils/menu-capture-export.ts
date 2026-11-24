import type { RadioId } from '@springfield/ham-radio-api';
import type { LoadedRadioConfig } from '~/utils/radio-catalog-db';
import {
  MENU_CAPTURE_SCHEMA_VERSION,
  normalizeMenuCaptureStepMenuForExport,
  resolvedIgnoreForExport,
  resolveMenuCaptureIgnore,
  type MenuCaptureDocument,
  type MenuCaptureIgnoreEntry,
  type MenuCaptureSessionState,
} from '~/utils/menu-capture';

export function buildMenuCaptureExportDocument(input: {
  exportedAt: string;
  app: { name: string; version: string };
  operator: { callsign?: string; notes?: string };
  radioId: RadioId;
  savedRadioName?: string;
  moduleId?: string;
  moduleVersion?: string;
  memoryMapVersion?: string;
  firmware?: string | null;
  ignore: readonly MenuCaptureIgnoreEntry[];
  memoryConfig: LoadedRadioConfig['memoryConfig'];
  baselineLength: number;
  session: MenuCaptureSessionState;
}): MenuCaptureDocument {
  const resolved = resolveMenuCaptureIgnore(input.ignore, input.memoryConfig, input.baselineLength);

  return {
    schemaVersion: MENU_CAPTURE_SCHEMA_VERSION,
    kind: 'ham-radio-menu-capture',
    exportedAt: input.exportedAt,
    app: input.app,
    operator: {
      ...(input.operator.callsign ? { callsign: input.operator.callsign } : {}),
      ...(input.operator.notes ? { notes: input.operator.notes } : {}),
    },
    radio: {
      manufacturer: input.radioId.manufacturer,
      model: String(input.radioId.model),
      ...(input.savedRadioName ? { name: input.savedRadioName } : {}),
      ...(input.moduleId ? { moduleId: input.moduleId } : {}),
      ...(input.moduleVersion ? { moduleVersion: input.moduleVersion } : {}),
      ...(input.memoryMapVersion ? { memoryMapVersion: input.memoryMapVersion } : {}),
      firmware: input.firmware ?? input.session.firmware ?? null,
    },
    ignore: resolvedIgnoreForExport(resolved),
    baseline: {
      file: 'images/baseline.img',
      byteLength: input.session.baselineByteLength,
      sha256: input.session.baselineSha256,
      readAt: input.session.baselineReadAt,
    },
    steps: input.session.steps.map((step) => ({
      index: step.index,
      readAt: step.readAt,
      comparedTo: step.comparedTo,
      menu: normalizeMenuCaptureStepMenuForExport(step.menu),
      change: step.change,
      image: {
        file: `images/${step.imageFileName}`,
        byteLength: step.imageByteLength,
        sha256: step.imageSha256,
      },
      flags: step.flags,
      diff: step.diff,
    })),
    ...(input.session.restore ? { restore: input.session.restore } : {}),
  };
}