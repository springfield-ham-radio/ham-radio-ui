import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import { collectMemoryMapUiFields, parseSeekAddress, radioAddressToBufferOffset, type RadioMemoryMapUiField } from '@springfield/ham-radio-utils';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  bufferOffsetToRadioAddress,
  collectCodecByteHits,
  describeMemoryMap,
  type CodecFieldSlot,
} from '~/utils/codec-display';
import { compareMemoryImages, type MemoryDiffRun } from '~/utils/driver-debug';
import { HEX_DUMP_BYTES_PER_ROW } from '~/utils/hex-dump';
import { settingsFieldMenuNumber } from '~/utils/settings-field-help';

export const MENU_CAPTURE_SCHEMA_VERSION = 1 as const;
export const MENU_CAPTURE_FILE_EXTENSION = 'hmenucap';
export const MENU_CAPTURE_WIDE_MAX_BYTES = 8;
export const MENU_CAPTURE_WIDE_MAX_RUNS = 1;

export type MenuCaptureStepFlag = 'empty' | 'wide';

export interface MenuCaptureIgnoreEntry {
  address: string | number;
  length: number;
  reason?: string;
}

export interface MenuCaptureResolvedIgnore {
  offset: number;
  length: number;
  address: number;
  reason?: string;
}

export interface MenuCaptureDriverConfig {
  ignore?: MenuCaptureIgnoreEntry[];
}

export interface MenuCaptureMenuLookupField {
  structId: string;
  fieldId: string;
  label: string;
  code?: string;
}

export interface MenuCaptureMenuLookup {
  menuNumber: number;
  prefilledName?: string;
  nameSource: 'map' | 'operator';
  fields: MenuCaptureMenuLookupField[];
}

export interface MenuCaptureFieldAnnotation {
  structId: string;
  fieldId: string;
  label?: string;
  menu?: { number: number; code?: string };
  reserved: boolean;
  bitOffset?: number;
  bitWidth?: number;
}

export interface MenuCaptureDiffContextRow {
  address: string;
  before: string;
  after: string;
}

export interface MenuCaptureDiffRunExport {
  offset: number;
  address: string;
  before: string;
  after: string;
  unmapped: boolean;
  fields: MenuCaptureFieldAnnotation[];
  context: MenuCaptureDiffContextRow[];
}

export interface MenuCaptureStepDiff {
  byteCount: number;
  runCount: number;
  ignoredByteCount: number;
  runs: MenuCaptureDiffRunExport[];
}

export interface MenuCaptureComparedToRef {
  kind: 'baseline' | 'step';
  stepIndex?: number;
}

export interface MenuCaptureStepRecord {
  index: number;
  readAt: string;
  comparedTo: MenuCaptureComparedToRef;
  menu: {
    number: number;
    name: string;
    code?: string;
    nameSource: 'map' | 'operator';
  };
  change: { from: string; to: string; note?: string };
  image: { file: string; byteLength: number; sha256: string };
  flags: MenuCaptureStepFlag[];
  diff: MenuCaptureStepDiff;
}

export interface MenuCaptureRestoreRecord {
  writtenAt?: string;
  verifiedAt?: string;
  matchesBaseline?: boolean;
}

export interface MenuCaptureDocument {
  schemaVersion: typeof MENU_CAPTURE_SCHEMA_VERSION;
  kind: 'ham-radio-menu-capture';
  exportedAt: string;
  app: { name: string; version: string };
  operator: { callsign?: string; notes?: string };
  radio: {
    manufacturer: string;
    model: string;
    name?: string;
    moduleId?: string;
    moduleVersion?: string;
    memoryMapVersion?: string;
    firmware?: string | null;
  };
  ignore: Array<{
    address: string;
    offset: number;
    length: number;
    reason?: string;
  }>;
  baseline: {
    file: string;
    byteLength: number;
    sha256: string;
    readAt: string;
  };
  steps: MenuCaptureStepRecord[];
  restore?: MenuCaptureRestoreRecord;
}

export interface MenuCaptureSessionStep {
  index: number;
  readAt: string;
  comparedTo: MenuCaptureComparedToRef;
  menu: MenuCaptureStepRecord['menu'];
  change: MenuCaptureStepRecord['change'];
  flags: MenuCaptureStepFlag[];
  diff: MenuCaptureStepDiff;
  imageFileName: string;
  imageSha256: string;
  imageByteLength: number;
}

export interface MenuCaptureSessionState {
  sessionId: string;
  savedRadioId: string;
  createdAt: string;
  updatedAt: string;
  baselineReadAt: string;
  baselineSha256: string;
  baselineByteLength: number;
  serialPort?: string;
  baudRate?: number;
  steps: MenuCaptureSessionStep[];
  restore?: MenuCaptureRestoreRecord;
  operatorNotes?: string;
  firmware?: string | null;
}

const HEX_BYTE = (value: number | undefined): string =>
  value === undefined ? '--' : value.toString(16).toUpperCase().padStart(2, '0');

function formatAddress(address: number): string {
  const width = address > 0xffff ? 6 : 4;
  return `0x${address.toString(16).toUpperCase().padStart(width, '0')}`;
}

function ignoredOffsetSet(resolved: readonly MenuCaptureResolvedIgnore[]): Set<number> {
  const set = new Set<number>();

  for (const entry of resolved) {
    for (let index = 0; index < entry.length; index += 1) {
      set.add(entry.offset + index);
    }
  }

  return set;
}

/**
 * Driver-declared volatile bytes. `address` is a radio address when `memoryConfig` is present.
 */
export function resolveMenuCaptureIgnore(
  entries: readonly MenuCaptureIgnoreEntry[],
  memoryConfig: RadioMemoryConfig | undefined,
  bufferLength: number,
): MenuCaptureResolvedIgnore[] {
  const resolved: MenuCaptureResolvedIgnore[] = [];

  for (const entry of entries) {
    const radioAddress = parseSeekAddress(entry.address);
    const length = Math.max(0, Math.floor(entry.length));

    if (!Number.isFinite(radioAddress) || radioAddress < 0 || length === 0) {
      continue;
    }

    let offset = radioAddress;

    if (memoryConfig) {
      try {
        offset = radioAddressToBufferOffset(radioAddress, memoryConfig, bufferLength);
      } catch {
        continue;
      }
    }

    if (offset < 0 || offset + length > bufferLength) {
      continue;
    }

    resolved.push({
      offset,
      length,
      address: radioAddress,
      ...(entry.reason?.trim() ? { reason: entry.reason.trim() } : {}),
    });
  }

  return resolved;
}

/** Read `capture.ignore` from an installed module JSON record before catalog hydration drops keys. */
export function parseMenuCaptureConfigFromModule(record: unknown): MenuCaptureIgnoreEntry[] {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return [];
  }

  const capture = (record as Record<string, unknown>).capture;

  if (capture === null || typeof capture !== 'object' || Array.isArray(capture)) {
    return [];
  }

  const ignore = (capture as Record<string, unknown>).ignore;

  if (!Array.isArray(ignore)) {
    return [];
  }

  const entries: MenuCaptureIgnoreEntry[] = [];

  for (const item of ignore) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }

    const row = item as Record<string, unknown>;
    const address = row.address;
    const length = row.length;

    if (
      (typeof address !== 'string' && typeof address !== 'number') ||
      typeof length !== 'number' ||
      !Number.isFinite(length) ||
      length <= 0
    ) {
      continue;
    }

    entries.push({
      address,
      length: Math.floor(length),
      ...(typeof row.reason === 'string' && row.reason.trim() ? { reason: row.reason.trim() } : {}),
    });
  }

  return entries;
}

export function mergeMenuCaptureIgnore(
  fromHydrated: MenuCaptureIgnoreEntry[],
  fromRawModule: MenuCaptureIgnoreEntry[],
): MenuCaptureIgnoreEntry[] {
  if (fromHydrated.length > 0) {
    return fromHydrated;
  }

  return fromRawModule;
}

function regroupRunsFromOffsets(
  before: Uint8Array,
  after: Uint8Array,
  offsets: number[],
): MemoryDiffRun[] {
  if (offsets.length === 0) {
    return [];
  }

  const sorted = [...offsets].sort((left, right) => left - right);
  const runs: MemoryDiffRun[] = [];
  let current: MemoryDiffRun | undefined;

  for (const address of sorted) {
    const left = address < before.length ? before[address] : undefined;
    const right = address < after.length ? after[address] : undefined;

    if (!current || current.start + current.before.length !== address) {
      current = { start: address, before: [], after: [] };
      runs.push(current);
    }

    current.before.push(left);
    current.after.push(right);
  }

  return runs;
}

export function filterMemoryDiffRuns(
  before: Uint8Array,
  after: Uint8Array,
  ignoreOffsets: ReadonlySet<number>,
): { runs: MemoryDiffRun[]; ignoredByteCount: number } {
  const raw = compareMemoryImages(before, after);
  let ignoredByteCount = 0;
  const keptOffsets: number[] = [];

  for (const run of raw) {
    for (let index = 0; index < run.before.length; index += 1) {
      const offset = run.start + index;

      if (ignoreOffsets.has(offset)) {
        ignoredByteCount += 1;
        continue;
      }

      keptOffsets.push(offset);
    }
  }

  return {
    runs: regroupRunsFromOffsets(before, after, keptOffsets),
    ignoredByteCount,
  };
}

export function menuCaptureStepFlags(byteCount: number, runCount: number): MenuCaptureStepFlag[] {
  const flags: MenuCaptureStepFlag[] = [];

  if (byteCount === 0) {
    flags.push('empty');
  }

  if (byteCount > MENU_CAPTURE_WIDE_MAX_BYTES || runCount > MENU_CAPTURE_WIDE_MAX_RUNS) {
    flags.push('wide');
  }

  return flags;
}

function extractMsbBitField(byte: number | undefined, bitOffset: number, bitWidth: number): number | undefined {
  if (byte === undefined || bitWidth <= 0) {
    return undefined;
  }

  let value = 0;

  for (let index = 0; index < bitWidth; index += 1) {
    const bitIndex = bitOffset - index;

    if (bitIndex < 0) {
      break;
    }

    value = (value << 1) | ((byte >> bitIndex) & 1);
  }

  return value;
}

function slotForHit(
  structId: string,
  fieldId: string,
  memoryMap: RadioMemoryMap | undefined,
): CodecFieldSlot | undefined {
  if (!memoryMap) {
    return undefined;
  }

  const struct = memoryMap.structs?.find((entry) => entry.id === structId);
  const layout = struct ? describeMemoryMap(memoryMap).structs.find((entry) => entry.id === structId)?.layout : undefined;

  return layout?.slots.find((slot) => slot.id === fieldId);
}

function fieldChangedInRun(
  slot: CodecFieldSlot | undefined,
  before: Uint8Array,
  after: Uint8Array,
  offset: number,
): boolean {
  if (!slot || slot.bitWidth === undefined || slot.bitOffset === undefined) {
    return true;
  }

  const left = offset < before.length ? before[offset] : undefined;
  const right = offset < after.length ? after[offset] : undefined;

  if (left === undefined && right === undefined) {
    return false;
  }

  const beforeBits = extractMsbBitField(left, slot.bitOffset, slot.bitWidth);
  const afterBits = extractMsbBitField(right, slot.bitOffset, slot.bitWidth);

  return beforeBits !== afterBits;
}

function annotateRun(
  run: MemoryDiffRun,
  before: Uint8Array,
  after: Uint8Array,
  memoryMap: RadioMemoryMap | undefined,
  memoryConfig: RadioMemoryConfig | undefined,
): MenuCaptureDiffRunExport {
  const view = memoryMap ? describeMemoryMap(memoryMap) : undefined;
  const hits = view ? collectCodecByteHits(view, Math.max(before.length, after.length), memoryConfig) : new Map();
  const fieldById = new Map<string, MenuCaptureFieldAnnotation>();

  for (let index = 0; index < run.before.length; index += 1) {
    const offset = run.start + index;
    const atOffset = hits.get(offset) ?? [];

    for (const hit of atOffset) {
      const slot = slotForHit(hit.structId, hit.fieldId, memoryMap);
      const key = `${hit.structId}::${hit.fieldId}`;

      if (fieldById.has(key)) {
        continue;
      }

      if (!fieldChangedInRun(slot, before, after, offset)) {
        continue;
      }

      const uiLabel = slot?.uiLabel;
      const uiField = memoryMap
        ? collectMemoryMapUiFields(memoryMap).find(
            (field) => field.structId === hit.structId && field.fieldId === hit.fieldId,
          )
        : undefined;
      const menu = uiField?.ui.menu;
      const menuNumber = menu && typeof menu.number === 'number' ? menu.number : undefined;

      fieldById.set(key, {
        structId: hit.structId,
        fieldId: hit.fieldId,
        ...(uiLabel ? { label: uiLabel } : {}),
        ...(menuNumber !== undefined
          ? {
              menu: {
                number: menuNumber,
                ...(typeof menu?.code === 'string' && menu.code.trim() ? { code: menu.code.trim() } : {}),
              },
            }
          : {}),
        reserved: hit.reserved,
        ...(slot?.bitOffset !== undefined ? { bitOffset: slot.bitOffset } : {}),
        ...(slot?.bitWidth !== undefined ? { bitWidth: slot.bitWidth } : {}),
      });
    }
  }

  const fields = [...fieldById.values()];
  const bufferLength = Math.max(before.length, after.length);
  const radioAddress =
    memoryConfig === undefined
      ? run.start
      : (bufferOffsetToRadioAddress(run.start, memoryConfig, bufferLength) ?? run.start);

  const firstRow = Math.floor(run.start / HEX_DUMP_BYTES_PER_ROW) * HEX_DUMP_BYTES_PER_ROW;
  const lastOffset = run.start + Math.max(run.before.length - 1, 0);
  const lastRow = Math.floor(lastOffset / HEX_DUMP_BYTES_PER_ROW) * HEX_DUMP_BYTES_PER_ROW;
  const context: MenuCaptureDiffContextRow[] = [];

  for (let rowStart = firstRow; rowStart <= lastRow; rowStart += HEX_DUMP_BYTES_PER_ROW) {
    context.push({
      address: formatAddress(
        memoryConfig === undefined
          ? rowStart
          : (bufferOffsetToRadioAddress(rowStart, memoryConfig, bufferLength) ?? rowStart),
      ),
      before: Array.from({ length: HEX_DUMP_BYTES_PER_ROW }, (_, cell) =>
        HEX_BYTE(rowStart + cell < before.length ? before[rowStart + cell] : undefined),
      ).join(' '),
      after: Array.from({ length: HEX_DUMP_BYTES_PER_ROW }, (_, cell) =>
        HEX_BYTE(rowStart + cell < after.length ? after[rowStart + cell] : undefined),
      ).join(' '),
    });
  }

  return {
    offset: run.start,
    address: formatAddress(radioAddress),
    before: run.before.map((value) => HEX_BYTE(value)).join(' '),
    after: run.after.map((value) => HEX_BYTE(value)).join(' '),
    unmapped: fields.length === 0,
    fields,
    context,
  };
}

export function buildMenuCaptureStepDiff(
  before: Uint8Array,
  after: Uint8Array,
  memoryMap: RadioMemoryMap | undefined,
  memoryConfig: RadioMemoryConfig | undefined,
  resolvedIgnore: readonly MenuCaptureResolvedIgnore[],
): MenuCaptureStepDiff {
  const ignore = ignoredOffsetSet(resolvedIgnore);
  const { runs, ignoredByteCount } = filterMemoryDiffRuns(before, after, ignore);
  const byteCount = runs.reduce((count, run) => count + run.before.length, 0);

  return {
    byteCount,
    runCount: runs.length,
    ignoredByteCount,
    runs: runs.map((run) => annotateRun(run, before, after, memoryMap, memoryConfig)),
  };
}

export function analyzeMenuCaptureStep(input: {
  before: Uint8Array;
  after: Uint8Array;
  memoryMap?: RadioMemoryMap;
  memoryConfig?: RadioMemoryConfig;
  ignore: readonly MenuCaptureIgnoreEntry[];
}): { diff: MenuCaptureStepDiff; flags: MenuCaptureStepFlag[] } {
  const resolved = resolveMenuCaptureIgnore(input.ignore, input.memoryConfig, Math.max(input.before.length, input.after.length));
  const diff = buildMenuCaptureStepDiff(
    input.before,
    input.after,
    input.memoryMap,
    input.memoryConfig,
    resolved,
  );
  const flags = menuCaptureStepFlags(diff.byteCount, diff.runCount);

  return { diff, flags };
}

export function imagesMatchExceptMenuCaptureIgnore(
  baseline: Uint8Array,
  other: Uint8Array,
  ignore: readonly MenuCaptureIgnoreEntry[],
  memoryConfig?: RadioMemoryConfig,
): { matches: boolean; diff: MenuCaptureStepDiff } {
  const length = Math.max(baseline.length, other.length);
  const resolved = resolveMenuCaptureIgnore(ignore, memoryConfig, length);
  const diff = buildMenuCaptureStepDiff(baseline, other, undefined, memoryConfig, resolved);

  return { matches: diff.byteCount === 0, diff };
}

function menuLabelFromField(field: RadioMemoryMapUiField): string {
  const code = field.ui.menu?.code?.trim();
  return code || field.ui.label;
}

/** Driver `ui.menu.code` when it is present and not the same string as the menu name. */
export function menuCaptureDistinctMenuCode(menuName: string, code: string | undefined): string | undefined {
  const trimmed = code?.trim();

  if (!trimmed || trimmed === menuName.trim()) {
    return undefined;
  }

  return trimmed;
}

export function menuCaptureMenuCodeForStep(
  menuNumber: number,
  menuName: string,
  memoryMap: RadioMemoryMap | undefined,
  operatorCode?: string,
): string | undefined {
  const fromMap =
    memoryMap === undefined
      ? undefined
      : lookupMenuCaptureByNumber(memoryMap, menuNumber).fields.map((field) => field.code).find(Boolean);

  const candidate = menuCaptureDistinctMenuCode(menuName, operatorCode) ?? fromMap;

  return menuCaptureDistinctMenuCode(menuName, candidate);
}

export function normalizeMenuCaptureStepMenuForExport(
  menu: MenuCaptureStepRecord['menu'],
): MenuCaptureStepRecord['menu'] {
  const code = menuCaptureDistinctMenuCode(menu.name, menu.code);

  return {
    number: menu.number,
    name: menu.name,
    nameSource: menu.nameSource,
    ...(code ? { code } : {}),
  };
}

export function lookupMenuCaptureByNumber(memoryMap: RadioMemoryMap, menuNumber: number): MenuCaptureMenuLookup {
  const fields = collectMemoryMapUiFields(memoryMap).filter((field) => settingsFieldMenuNumber(field) === menuNumber);
  const lookupFields: MenuCaptureMenuLookupField[] = fields.map((field) => ({
    structId: field.structId,
    fieldId: field.fieldId,
    label: field.ui.label,
    ...(field.ui.menu?.code?.trim() ? { code: field.ui.menu.code.trim() } : {}),
  }));

  if (lookupFields.length === 0) {
    return {
      menuNumber,
      nameSource: 'operator',
      fields: [],
    };
  }

  const codes = [...new Set(lookupFields.map((field) => field.code).filter((code): code is string => Boolean(code)))];

  return {
    menuNumber,
    prefilledName: codes[0] ?? menuLabelFromField(fields[0]!),
    nameSource: 'map',
    fields: lookupFields,
  };
}

export function comparedToForStepIndex(stepIndex: number): MenuCaptureComparedToRef {
  if (stepIndex <= 1) {
    return { kind: 'baseline' };
  }

  return { kind: 'step', stepIndex: stepIndex - 1 };
}

export function menuCaptureStepImageFileName(index: number): string {
  return `step-${String(index).padStart(3, '0')}.img`;
}

export function removeLastMenuCaptureSessionStep(session: MenuCaptureSessionState): MenuCaptureSessionState {
  if (session.steps.length === 0) {
    return session;
  }

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    steps: session.steps.slice(0, -1),
  };
}

export function removeMenuCaptureSessionStepFrom(
  session: MenuCaptureSessionState,
  stepIndex: number,
): MenuCaptureSessionState {
  const target = session.steps.find((step) => step.index === stepIndex);

  if (!target) {
    return session;
  }

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    steps: session.steps.filter((step) => step.index < stepIndex),
  };
}

export function previousMenuCaptureImageReference(
  session: MenuCaptureSessionState,
  nextStepIndex: number,
): { kind: 'baseline' | 'step'; step?: MenuCaptureSessionStep } {
  if (nextStepIndex <= 1 || session.steps.length === 0) {
    return { kind: 'baseline' };
  }

  const previous = session.steps.at(-1);

  if (!previous) {
    return { kind: 'baseline' };
  }

  return { kind: 'step', step: previous };
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const DOCUMENT_ROOT_KEYS: readonly (keyof MenuCaptureDocument)[] = [
  'schemaVersion',
  'kind',
  'exportedAt',
  'app',
  'operator',
  'radio',
  'ignore',
  'baseline',
  'steps',
];

export function parseMenuCaptureDocument(raw: string): MenuCaptureDocument {
  const parsed: unknown = JSON.parse(raw);

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Menu capture file is not an object');
  }

  const record = parsed as Record<string, unknown>;

  if (record.schemaVersion !== MENU_CAPTURE_SCHEMA_VERSION) {
    throw new Error(`Unsupported menu capture schema version ${String(record.schemaVersion)}`);
  }

  if (record.kind !== 'ham-radio-menu-capture') {
    throw new Error('Menu capture file has the wrong kind');
  }

  const cleaned: Record<string, unknown> = {};

  for (const key of DOCUMENT_ROOT_KEYS) {
    if (record[key] !== undefined) {
      cleaned[key] = record[key];
    }
  }

  if (record.restore !== undefined) {
    cleaned.restore = record.restore;
  }

  return cleaned as unknown as MenuCaptureDocument;
}

export function serializeMenuCaptureDocument(document: MenuCaptureDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export interface MenuCaptureZipContents {
  document: MenuCaptureDocument;
  images: Map<string, Uint8Array>;
}

export function buildMenuCaptureZip(document: MenuCaptureDocument, images: Record<string, Uint8Array>): Uint8Array {
  const archive: Record<string, Uint8Array> = {
    'capture.json': strToU8(serializeMenuCaptureDocument(document)),
  };

  for (const [name, bytes] of Object.entries(images)) {
    archive[`images/${name}`] = bytes;
  }

  return zipSync(archive, { level: 0 });
}

export function parseMenuCaptureZip(bytes: Uint8Array): MenuCaptureZipContents {
  const entries = unzipSync(bytes);
  const jsonBytes = entries['capture.json'];

  if (!jsonBytes) {
    throw new Error('Menu capture zip is missing capture.json');
  }

  const document = parseMenuCaptureDocument(strFromU8(jsonBytes));
  const images = new Map<string, Uint8Array>();

  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith('images/') || path === 'images/') {
      continue;
    }

    images.set(path.slice('images/'.length), data);
  }

  const baseline = images.get('baseline.img');

  if (!baseline || baseline.length !== document.baseline.byteLength) {
    throw new Error('Menu capture zip is missing baseline.img or its size does not match capture.json');
  }

  for (const step of document.steps) {
    const fileName = step.image.file.replace(/^images\//, '');
    const stepImage = images.get(fileName);

    if (!stepImage || stepImage.length !== step.image.byteLength) {
      throw new Error(`Menu capture zip is missing ${fileName}`);
    }
  }

  return { document, images };
}

export function resolvedIgnoreForExport(resolved: readonly MenuCaptureResolvedIgnore[]): MenuCaptureDocument['ignore'] {
  return resolved.map((entry) => ({
    address: formatAddress(entry.address),
    offset: entry.offset,
    length: entry.length,
    ...(entry.reason ? { reason: entry.reason } : {}),
  }));
}