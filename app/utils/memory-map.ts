import type { DriverIssue } from './driver-compile';
import {
  formatDriverAddress,
  parseDriverAddress,
  parseDriverInteger,
  type DriverMemoryFieldDraft,
  type DriverMemoryFieldKind,
  type DriverMemoryGroupDraft,
  type DriverMemoryMapDraft,
  type DriverMemoryStructDraft,
  type DriverMemorySubgroupDraft,
} from './driver-draft';

export interface CompiledMemoryMap {
  json: string;
  issues: DriverIssue[];
  errorCount: number;
  warningCount: number;
}

const LENGTH_KINDS = new Set<DriverMemoryFieldKind>(['ascii', 'digits', 'dtmf', 'bbcd', 'lbcd']);
const SCALE_KINDS = new Set<DriverMemoryFieldKind>(['digits', 'lbcd']);
const INTEGER_LIST_KINDS = new Set<DriverMemoryFieldKind>(['tone', 'ctcss-index', 'dcs-index']);

/**
 * Turn the Memory tab into a memory-map document.
 * A field, struct, or group that cannot be emitted is left out so the preview still parses.
 */
export function compileMemoryMap(map: DriverMemoryMapDraft): CompiledMemoryMap {
  const issues: DriverIssue[] = [];
  const groups = map.groups.flatMap((group) => {
    const compiled = compileSettingsGroup(group, issues);
    return compiled ? [compiled] : [];
  });
  const structs = map.structs.flatMap((struct) => {
    const compiled = compileStruct(struct, map.groups, issues);
    return compiled ? [compiled] : [];
  });

  if (map.structs.length === 0) {
    issues.push({ level: 'error', path: 'memory.structs', message: 'Add a struct for the channel records.' });
  }

  const document: Record<string, unknown> = {};
  const version = map.version.trim();
  const description = map.description.trim();

  if (version) {
    document.version = version;
  }

  if (description) {
    document.description = description;
  }

  if (groups.length > 0) {
    document.groups = groups;
  }

  document.structs = structs;
  const channelBindings = compileBindings(map, issues);

  if (channelBindings) {
    document.channelBindings = channelBindings;
  }

  return {
    json: `${JSON.stringify(document, null, 2)}\n`,
    issues,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
    warningCount: issues.filter((issue) => issue.level === 'warning').length,
  };
}

function compileBindings(map: DriverMemoryMapDraft, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const records = requiredBinding(map.records, 'memory.records', 'the channel record struct', issues);
  const receiveFrequency = requiredBinding(map.receiveFrequency, 'memory.receiveFrequency', 'the receive frequency field', issues);
  const transmitFrequency = requiredBinding(map.transmitFrequency, 'memory.transmitFrequency', 'the transmit frequency field', issues);
  const receiveTone = requiredBinding(map.receiveTone, 'memory.receiveTone', 'the receive tone field', issues);
  const transmitTone = requiredBinding(map.transmitTone, 'memory.transmitTone', 'the transmit tone field', issues);

  if (!records || !receiveFrequency || !transmitFrequency || !receiveTone || !transmitTone) {
    return undefined;
  }

  const names = map.names.trim();
  const nameField = map.nameField.trim();
  const extras = map.extras.trim();
  const bindings: Record<string, unknown> = { records };

  if (names) {
    bindings.names = names;

    if (nameField) {
      bindings.nameField = nameField;
    } else {
      issues.push({ level: 'error', path: 'memory.nameField', message: 'Enter the field that holds the channel name.' });
    }
  }

  bindings.receiveFrequency = receiveFrequency;
  bindings.transmitFrequency = transmitFrequency;
  bindings.receiveTone = receiveTone;
  bindings.transmitTone = transmitTone;

  if (extras) {
    bindings.extras = extras;
  }

  warnBindings(map, issues);
  return bindings;
}

function warnBindings(map: DriverMemoryMapDraft, issues: DriverIssue[]): void {
  const structIds = new Set(map.structs.map((struct) => struct.structId.trim()).filter((id) => id.length > 0));
  const records = map.records.trim();
  const names = map.names.trim();

  if (records && !structIds.has(records)) {
    issues.push({
      level: 'warning',
      path: 'memory.records',
      message: `No struct is named ${records}.`,
    });
  }

  if (names && !structIds.has(names)) {
    issues.push({
      level: 'warning',
      path: 'memory.names',
      message: `No struct is named ${names}.`,
    });
  }

  const recordStruct = map.structs.find((struct) => struct.structId.trim() === records);
  const recordFields = new Set(recordStruct?.fields.map((field) => field.fieldId.trim()) ?? []);

  for (const [path, label, raw] of [
    ['memory.receiveFrequency', 'Receive frequency', map.receiveFrequency],
    ['memory.transmitFrequency', 'Transmit frequency', map.transmitFrequency],
    ['memory.receiveTone', 'Receive tone', map.receiveTone],
    ['memory.transmitTone', 'Transmit tone', map.transmitTone],
  ] as const) {
    const fieldId = raw.trim();

    if (recordStruct && fieldId && !recordFields.has(fieldId)) {
      issues.push({
        level: 'warning',
        path,
        message: `${label} field ${fieldId} is not on the ${records} struct.`,
      });
    }
  }

  const nameStruct = map.structs.find((struct) => struct.structId.trim() === names);
  const nameField = map.nameField.trim();

  if (nameStruct && nameField && !nameStruct.fields.some((field) => field.fieldId.trim() === nameField)) {
    issues.push({
      level: 'warning',
      path: 'memory.nameField',
      message: `Name field ${nameField} is not on the ${names} struct.`,
    });
  }
}

function requiredBinding(raw: string, path: string, label: string, issues: DriverIssue[]): string | undefined {
  const text = raw.trim();

  if (!text) {
    issues.push({ level: 'error', path, message: `Enter ${label}.` });
    return undefined;
  }

  return text;
}

function compileSettingsGroup(group: DriverMemoryGroupDraft, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const path = `memory.groups.${group.id}`;
  const id = group.groupId.trim();
  const label = group.label.trim();
  let valid = true;

  if (!id) {
    issues.push({ level: 'error', path: `${path}.groupId`, message: 'Enter a group id.' });
    valid = false;
  }

  if (!label) {
    issues.push({ level: 'error', path: `${path}.label`, message: 'Enter a group label.' });
    valid = false;
  }

  const subgroups = group.subgroups.flatMap((subgroup) => {
    const compiled = compileSubgroup(group.id, subgroup, issues);
    return compiled ? [compiled] : [];
  });

  if (!valid) {
    return undefined;
  }

  const compiled: Record<string, unknown> = { id, label };
  const description = group.description.trim();
  const icon = group.icon.trim();

  if (description) {
    compiled.description = description;
  }

  if (icon) {
    compiled.icon = icon;
  }

  const warningTitle = group.warningTitle.trim();
  const warningDescription = group.warningDescription.trim();

  if (warningTitle || warningDescription) {
    if (!warningTitle) {
      issues.push({ level: 'error', path: `${path}.warningTitle`, message: 'Enter a warning title.' });
    } else if (!warningDescription) {
      issues.push({ level: 'error', path: `${path}.warningDescription`, message: 'Enter a warning description.' });
    } else {
      compiled.warning = { title: warningTitle, description: warningDescription };
    }
  }

  if (subgroups.length > 0) {
    compiled.groups = subgroups;
  }

  return compiled;
}

function compileSubgroup(groupId: string, subgroup: DriverMemorySubgroupDraft, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const path = `memory.groups.${groupId}.subgroups.${subgroup.id}`;
  const id = subgroup.subgroupId.trim();
  const label = subgroup.label.trim();

  if (!id) {
    issues.push({ level: 'error', path: `${path}.subgroupId`, message: 'Enter a section id.' });
    return undefined;
  }

  if (!label) {
    issues.push({ level: 'error', path: `${path}.label`, message: 'Enter a section label.' });
    return undefined;
  }

  const compiled: Record<string, unknown> = { id, label };
  const description = subgroup.description.trim();

  if (description) {
    compiled.description = description;
  }

  return compiled;
}

function compileStruct(struct: DriverMemoryStructDraft, groups: DriverMemoryGroupDraft[], issues: DriverIssue[]): Record<string, unknown> | undefined {
  const path = `memory.structs.${struct.id}`;
  const id = struct.structId.trim();
  let valid = true;

  if (!id) {
    issues.push({ level: 'error', path: `${path}.structId`, message: 'Enter a struct id.' });
    valid = false;
  }

  const seek = parseDriverAddress(struct.seek);

  if (seek === undefined || seek < 0) {
    issues.push({ level: 'error', path: `${path}.seek`, message: 'Enter a start address, such as 0x0000.' });
    valid = false;
  }

  const fields = struct.fields.flatMap((field) => {
    const compiled = compileField(struct.id, field, groups, issues);
    return compiled ? [compiled] : [];
  });

  if (struct.fields.length === 0) {
    issues.push({ level: 'error', path: `${path}.fields`, message: 'Add a field.' });
    valid = false;
  } else if (fields.length === 0) {
    valid = false;
  }

  const repeat = compileRepeat(struct, path, issues);
  const group = compileGroup(struct, path, issues);

  if (!repeat.ok || !group.ok) {
    valid = false;
  }

  if (!valid || seek === undefined) {
    return undefined;
  }

  const compiled: Record<string, unknown> = {
    id,
    seek: formatDriverAddress(seek),
  };

  if (repeat.count !== undefined && repeat.stride !== undefined) {
    compiled.count = repeat.count;
    compiled.stride = repeat.stride;
  }

  if (group.size !== undefined && group.pad !== undefined) {
    compiled.groupSize = group.size;
    compiled.groupPad = group.pad;
  }

  const emptyEquals = struct.emptyEquals.trim();

  if (emptyEquals) {
    const equals = parseDriverInteger(emptyEquals);

    if (equals === undefined || equals < 0 || equals > 255) {
      issues.push({ level: 'error', path: `${path}.emptyEquals`, message: 'The empty byte must be from 0x00 to 0xFF.' });
      return undefined;
    }

    compiled.emptyWhen = { equals };
  }

  if (struct.clearEmpty) {
    compiled.clearEmpty = true;
  }

  compiled.fields = fields;
  return compiled;
}

function compileRepeat(
  struct: DriverMemoryStructDraft,
  path: string,
  issues: DriverIssue[],
): { ok: boolean; count?: number; stride?: number } {
  const countText = struct.count.trim();
  const strideText = struct.stride.trim();

  if (!countText && !strideText) {
    return { ok: true };
  }

  if (!countText) {
    issues.push({ level: 'error', path: `${path}.count`, message: 'Enter how many times this struct repeats.' });
    return { ok: false };
  }

  if (!strideText) {
    issues.push({ level: 'error', path: `${path}.stride`, message: 'Enter a stride in bytes.' });
    return { ok: false };
  }

  const count = positiveInteger(countText, `${path}.count`, 'count', issues);
  const stride = positiveInteger(strideText, `${path}.stride`, 'stride', issues);

  if (count === undefined || stride === undefined) {
    return { ok: false };
  }

  return { ok: true, count, stride };
}

function compileGroup(
  struct: DriverMemoryStructDraft,
  path: string,
  issues: DriverIssue[],
): { ok: boolean; size?: number; pad?: number } {
  const sizeText = struct.groupSize.trim();
  const padText = struct.groupPad.trim();

  if (!sizeText && !padText) {
    return { ok: true };
  }

  if (!sizeText) {
    issues.push({ level: 'error', path: `${path}.groupSize`, message: 'Enter how many records are in a group.' });
    return { ok: false };
  }

  if (!padText) {
    issues.push({ level: 'error', path: `${path}.groupPad`, message: 'Enter the padding bytes after each group.' });
    return { ok: false };
  }

  const size = positiveInteger(sizeText, `${path}.groupSize`, 'group size', issues);
  const pad = nonNegativeInteger(padText, `${path}.groupPad`, 'group padding', issues);

  if (size === undefined || pad === undefined) {
    return { ok: false };
  }

  return { ok: true, size, pad };
}

function compileField(
  structId: string,
  field: DriverMemoryFieldDraft,
  groups: DriverMemoryGroupDraft[],
  issues: DriverIssue[],
): Record<string, unknown> | undefined {
  const path = `memory.structs.${structId}.fields.${field.id}`;
  const id = field.fieldId.trim();

  if (!id) {
    issues.push({ level: 'error', path: `${path}.fieldId`, message: 'Enter a field id.' });
    return undefined;
  }

  const compiled: Record<string, unknown> = { id, type: field.type };

  if (field.type === 'bits') {
    const width = parseDriverInteger(field.width.trim());

    if (width === undefined || width < 1 || width > 8) {
      issues.push({ level: 'error', path: `${path}.width`, message: 'Bit width must be from 1 to 8.' });
      return undefined;
    }

    compiled.width = width;
  }

  if (field.reserved) {
    compiled.reserved = true;
  }

  const value = compileValue(field, path, issues);

  if (value) {
    compiled.value = value;
  }

  const ui = compileFieldUi(field, path, groups, issues);

  if (ui) {
    compiled.ui = ui;
  }

  return compiled;
}

function compileFieldUi(
  field: DriverMemoryFieldDraft,
  path: string,
  groups: DriverMemoryGroupDraft[],
  issues: DriverIssue[],
): Record<string, unknown> | undefined {
  if (!field.showUi || field.reserved) {
    return undefined;
  }

  const group = field.uiGroup.trim();
  const label = field.uiLabel.trim();
  let valid = true;

  if (!group) {
    issues.push({ level: 'error', path: `${path}.uiGroup`, message: 'Choose a settings group.' });
    valid = false;
  }

  if (!label) {
    issues.push({ level: 'error', path: `${path}.uiLabel`, message: 'Enter the label shown on the Settings screen.' });
    valid = false;
  }

  if (!valid) {
    return undefined;
  }

  const ui: Record<string, unknown> = {
    group,
    label,
    widget: field.uiWidget,
  };
  const subgroup = field.uiSubgroup.trim();
  const description = field.uiDescription.trim();

  if (subgroup) {
    ui.subgroup = subgroup;
  }

  if (description) {
    ui.description = description;
  }

  const menuNumber = field.uiMenuNumber.trim();
  const menuCode = field.uiMenuCode.trim();

  if (menuNumber || menuCode) {
    const number = parseDriverInteger(menuNumber);

    if (!menuNumber || number === undefined || number < 0) {
      issues.push({ level: 'error', path: `${path}.uiMenuNumber`, message: 'Enter a menu number of 0 or more.' });
    } else {
      const menu: Record<string, unknown> = { number };

      if (menuCode) {
        menu.code = menuCode;
      }

      ui.menu = menu;
    }
  }

  if (!field.uiWritable) {
    ui.writable = false;
  }

  const orderText = field.uiOrder.trim();

  if (orderText) {
    const order = parseDriverInteger(orderText);

    if (order === undefined) {
      issues.push({ level: 'error', path: `${path}.uiOrder`, message: 'Display order must be a whole number.' });
    } else {
      ui.order = order;
    }
  }

  const declared = groups.map((item) => item.groupId.trim()).filter((id) => id.length > 0);

  if (declared.length > 0 && !declared.includes(group)) {
    issues.push({
      level: 'warning',
      path: `${path}.uiGroup`,
      message: `No settings group is named ${group}.`,
    });
  }

  const matched = groups.find((item) => item.groupId.trim() === group);
  const sectionIds = matched?.subgroups.map((item) => item.subgroupId.trim()).filter((id) => id.length > 0) ?? [];

  if (matched && subgroup && sectionIds.length > 0 && !sectionIds.includes(subgroup)) {
    issues.push({
      level: 'warning',
      path: `${path}.uiSubgroup`,
      message: `No section named ${subgroup} is in the ${group} group.`,
    });
  }

  return ui;
}

function compileValue(field: DriverMemoryFieldDraft, path: string, issues: DriverIssue[]): Record<string, unknown> | undefined {
  if (field.kind === 'boolean') {
    return { kind: 'boolean' };
  }

  if (field.kind === 'integer') {
    return compileInteger(field, path, issues);
  }

  if (field.kind === 'enum') {
    return compileEnum(field, path, issues);
  }

  if (LENGTH_KINDS.has(field.kind)) {
    return compileLengthKind(field, path, issues);
  }

  if (INTEGER_LIST_KINDS.has(field.kind)) {
    return compileIntegerList(field, path, issues);
  }

  return undefined;
}

function compileInteger(field: DriverMemoryFieldDraft, path: string, issues: DriverIssue[]): Record<string, unknown> {
  const value: Record<string, unknown> = { kind: 'integer' };
  const minimum = optionalNumber(field.minimum, `${path}.minimum`, 'minimum', issues);
  const maximum = optionalNumber(field.maximum, `${path}.maximum`, 'maximum', issues);

  if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
    issues.push({ level: 'error', path: `${path}.maximum`, message: 'The maximum cannot be below the minimum.' });
    return value;
  }

  if (field.minimum.trim() && minimum !== undefined) {
    value.min = minimum;
  }

  if (field.maximum.trim() && maximum !== undefined) {
    value.max = maximum;
  }

  return value;
}

function compileEnum(field: DriverMemoryFieldDraft, path: string, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const values = splitList(field.values);

  if (values.length === 0) {
    issues.push({ level: 'error', path: `${path}.values`, message: 'Enter at least one enum label.' });
    return undefined;
  }

  return { kind: 'enum', values };
}

function compileLengthKind(field: DriverMemoryFieldDraft, path: string, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const length = positiveInteger(field.length, `${path}.length`, 'length', issues);

  if (length === undefined) {
    return undefined;
  }

  const value: Record<string, unknown> = { kind: field.kind, length };

  if (SCALE_KINDS.has(field.kind) && field.scale.trim()) {
    const scale = optionalNumber(field.scale, `${path}.scale`, 'scale', issues);

    if (scale !== undefined) {
      value.scale = scale;
    }
  }

  if (field.kind === 'ascii' && field.pad.trim()) {
    const pad = parseDriverInteger(field.pad.trim());

    if (pad === undefined || pad < 0 || pad > 255) {
      issues.push({ level: 'error', path: `${path}.pad`, message: 'The pad byte must be from 0x00 to 0xFF.' });
    } else {
      value.pad = pad;
    }
  }

  if (field.kind === 'dtmf' && field.charset.trim()) {
    value.charset = field.charset;
  }

  return value;
}

function compileIntegerList(field: DriverMemoryFieldDraft, path: string, issues: DriverIssue[]): Record<string, unknown> | undefined {
  const tokens = splitList(field.values);

  if (tokens.length === 0) {
    issues.push({ level: 'error', path: `${path}.values`, message: 'Enter at least one value.' });
    return undefined;
  }

  const values: number[] = [];

  for (const token of tokens) {
    const value = parseDriverInteger(token);

    if (value === undefined) {
      issues.push({ level: 'error', path: `${path}.values`, message: `${token} is not a whole number.` });
      return undefined;
    }

    values.push(value);
  }

  const compiled: Record<string, unknown> = { kind: field.kind, values };

  if (field.kind === 'tone') {
    if (field.ctcssMinimum.trim()) {
      const ctcssMinimum = parseDriverInteger(field.ctcssMinimum.trim());

      if (ctcssMinimum === undefined) {
        issues.push({ level: 'error', path: `${path}.ctcssMinimum`, message: 'CTCSS minimum must be a whole number.' });
      } else {
        compiled.ctcssMin = ctcssMinimum;
      }
    }

    if (field.reverseOffset.trim()) {
      const reverseOffset = parseDriverInteger(field.reverseOffset.trim());

      if (reverseOffset === undefined) {
        issues.push({ level: 'error', path: `${path}.reverseOffset`, message: 'Reverse offset must be a whole number.' });
      } else {
        compiled.reverseOffset = reverseOffset;
      }
    }
  }

  return compiled;
}

function positiveInteger(raw: string, path: string, label: string, issues: DriverIssue[]): number | undefined {
  return boundedInteger(raw, path, label, issues, 1, undefined);
}

function nonNegativeInteger(raw: string, path: string, label: string, issues: DriverIssue[]): number | undefined {
  return boundedInteger(raw, path, label, issues, 0, undefined);
}

function boundedInteger(
  raw: string,
  path: string,
  label: string,
  issues: DriverIssue[],
  minimum: number,
  maximum: number | undefined,
): number | undefined {
  const text = raw.trim();

  if (!text) {
    issues.push({ level: 'error', path, message: `Enter a ${label}.` });
    return undefined;
  }

  const value = parseDriverInteger(text);

  if (value === undefined || value < minimum || (maximum !== undefined && value > maximum)) {
    issues.push({
      level: 'error',
      path,
      message: maximum === undefined ? `${label} must be a whole number of ${minimum} or more.` : `${label} is out of range.`,
    });
    return undefined;
  }

  return value;
}

function optionalNumber(raw: string, path: string, label: string, issues: DriverIssue[]): number | undefined {
  const text = raw.trim();

  if (!text) {
    return undefined;
  }

  const value = Number(text);

  if (!Number.isFinite(value)) {
    issues.push({ level: 'error', path, message: `The ${label} must be a number.` });
    return undefined;
  }

  return value;
}

function splitList(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
