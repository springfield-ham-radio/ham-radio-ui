import {
  DRIVER_MEMORY_FIELD_KINDS,
  DRIVER_MEMORY_FIELD_TYPES,
  DRIVER_MEMORY_WIDGETS,
  createChannelSchemaDraft,
  createMemoryField,
  createMemoryGroup,
  createMemoryStruct,
  createMemorySubgroup,
  formatDriverAddress,
  type DriverChannelSchemaDraft,
  type DriverMemoryFieldDraft,
  type DriverMemoryFieldKind,
  type DriverMemoryFieldType,
  type DriverMemoryGroupDraft,
  type DriverMemoryMapDraft,
  type DriverMemoryStructDraft,
  type DriverMemoryWidget,
} from './driver-draft';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === 'string' ? value : '';
}

function byteText(value: unknown): string {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255) {
    return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return '';
}

function seekText(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return formatDriverAddress(value);
  }

  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();

    if (/^0x[0-9a-fA-F]+$/i.test(text)) {
      const parsed = Number.parseInt(text.slice(2), 16);
      return Number.isSafeInteger(parsed) ? formatDriverAddress(parsed) : text;
    }

    if (/^\d+$/.test(text)) {
      const parsed = Number.parseInt(text, 10);
      return Number.isSafeInteger(parsed) ? formatDriverAddress(parsed) : text;
    }

    return text;
  }

  return '';
}

function listText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value.flatMap((item) => (typeof item === 'number' || typeof item === 'string' ? [String(item)] : [])).join(', ');
}

function asFieldType(value: unknown): DriverMemoryFieldType {
  return typeof value === 'string' && (DRIVER_MEMORY_FIELD_TYPES as readonly string[]).includes(value)
    ? (value as DriverMemoryFieldType)
    : 'u8';
}

function asFieldKind(value: unknown): DriverMemoryFieldKind {
  return typeof value === 'string' && (DRIVER_MEMORY_FIELD_KINDS as readonly string[]).includes(value)
    ? (value as DriverMemoryFieldKind)
    : 'integer';
}

function asWidget(value: unknown): DriverMemoryWidget {
  return typeof value === 'string' && (DRIVER_MEMORY_WIDGETS as readonly string[]).includes(value)
    ? (value as DriverMemoryWidget)
    : 'integer';
}

function toneBounds(property: unknown): { minimum: string; maximum: string; pattern: string } {
  const empty = { minimum: '', maximum: '', pattern: '' };

  if (!isRecord(property) || !isRecord(property.properties) || !isRecord(property.properties.tone)) {
    return empty;
  }

  const tone = property.properties.tone;
  const options = Array.isArray(tone.oneOf) ? tone.oneOf : [];
  const numberOption = options.find((option) => isRecord(option) && option.type === 'number');
  const stringOption = options.find((option) => isRecord(option) && option.type === 'string');

  return {
    minimum: isRecord(numberOption) ? textOf(numberOption.minimum) : '',
    maximum: isRecord(numberOption) ? textOf(numberOption.maximum) : '',
    pattern: isRecord(stringOption) ? textOf(stringOption.pattern) : '',
  };
}

/**
 * Read a channel JSON Schema into the Channel tab.
 * Returns undefined when the document is not an object schema.
 */
export function draftChannelSchema(value: unknown, warnings: string[]): DriverChannelSchemaDraft | undefined {
  if (!isRecord(value) || !isRecord(value.properties)) {
    warnings.push('Skipped the channel schema because it was not an object schema.');
    return undefined;
  }

  const properties = value.properties;
  const name = isRecord(properties.name) ? properties.name : undefined;
  const receive = isRecord(properties.receiveFrequency) ? properties.receiveFrequency : undefined;
  const transmit = isRecord(properties.transmitFrequency) ? properties.transmitFrequency : undefined;
  const tones = toneBounds(properties.receiveTone ?? properties.transmitTone);
  const base = createChannelSchemaDraft();

  return {
    includeName: name !== undefined,
    nameMaxLength: name ? textOf(name.maxLength) : base.nameMaxLength,
    receiveMinimum: receive ? textOf(receive.minimum) : '',
    receiveMaximum: receive ? textOf(receive.maximum) : '',
    transmitMinimum: transmit ? textOf(transmit.minimum) : '',
    transmitMaximum: transmit ? textOf(transmit.maximum) : '',
    includeReceiveTone: properties.receiveTone !== undefined,
    includeTransmitTone: properties.transmitTone !== undefined,
    ctcssMinimum: tones.minimum || base.ctcssMinimum,
    ctcssMaximum: tones.maximum || base.ctcssMaximum,
    dcsPattern: tones.pattern || base.dcsPattern,
  };
}

function draftField(value: unknown, warnings: string[]): DriverMemoryFieldDraft | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
    warnings.push('Skipped a memory-map field that had no id.');
    return undefined;
  }

  const kindSource = isRecord(value.value) ? value.value : undefined;
  const ui = isRecord(value.ui) ? value.ui : undefined;
  const menu = ui && isRecord(ui.menu) ? ui.menu : undefined;
  const reserved = value.reserved === true;
  const fieldId = value.id.trim();

  if (typeof value.type === 'string' && !(DRIVER_MEMORY_FIELD_TYPES as readonly string[]).includes(value.type)) {
    warnings.push(`Kept field ${fieldId} as u8 because ${value.type} is not a known storage type.`);
  }

  if (kindSource && typeof kindSource.kind === 'string' && !(DRIVER_MEMORY_FIELD_KINDS as readonly string[]).includes(kindSource.kind)) {
    warnings.push(`Kept field ${fieldId} as an integer because ${kindSource.kind} is not a known value.`);
  }

  if (ui && typeof ui.widget === 'string' && !(DRIVER_MEMORY_WIDGETS as readonly string[]).includes(ui.widget)) {
    warnings.push(`Kept field ${fieldId} as an integer widget because ${ui.widget} is not a known widget.`);
  }

  return createMemoryField({
    fieldId,
    type: asFieldType(value.type),
    width: textOf(value.width),
    reserved,
    kind: kindSource ? asFieldKind(kindSource.kind) : 'integer',
    length: kindSource ? textOf(kindSource.length) : '',
    scale: kindSource ? textOf(kindSource.scale) : '',
    minimum: kindSource ? textOf(kindSource.min) : '',
    maximum: kindSource ? textOf(kindSource.max) : '',
    values: kindSource ? listText(kindSource.values) : '',
    pad: kindSource ? byteText(kindSource.pad) : '',
    charset: kindSource ? textOf(kindSource.charset) : '',
    ctcssMinimum: kindSource ? textOf(kindSource.ctcssMin) : '',
    reverseOffset: kindSource ? textOf(kindSource.reverseOffset) : '',
    showUi: ui !== undefined && !reserved,
    uiGroup: ui ? textOf(ui.group) : '',
    uiSubgroup: ui ? textOf(ui.subgroup) : '',
    uiLabel: ui ? textOf(ui.label) : '',
    uiWidget: ui ? asWidget(ui.widget) : 'integer',
    uiDescription: ui ? textOf(ui.description) : '',
    uiMenuNumber: menu ? textOf(menu.number) : '',
    uiMenuCode: menu ? textOf(menu.code) : '',
    uiWritable: ui?.writable !== false,
    uiOrder: ui ? textOf(ui.order) : '',
  });
}

function draftStruct(value: unknown, warnings: string[]): DriverMemoryStructDraft | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
    warnings.push('Skipped a memory-map struct that had no id.');
    return undefined;
  }

  const emptyWhen = isRecord(value.emptyWhen) ? value.emptyWhen : undefined;
  const fields = Array.isArray(value.fields) ? value.fields.flatMap((field) => {
    const drafted = draftField(field, warnings);
    return drafted ? [drafted] : [];
  }) : [];

  return createMemoryStruct({
    structId: value.id.trim(),
    seek: seekText(value.seek),
    count: textOf(value.count),
    stride: textOf(value.stride),
    groupSize: textOf(value.groupSize),
    groupPad: textOf(value.groupPad),
    emptyEquals: emptyWhen ? byteText(emptyWhen.equals) : '',
    clearEmpty: value.clearEmpty === true,
    fields,
  });
}

function draftGroup(value: unknown, warnings: string[]): DriverMemoryGroupDraft | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) {
    warnings.push('Skipped a settings group that had no id.');
    return undefined;
  }

  const warning = isRecord(value.warning) ? value.warning : undefined;
  const subgroups = Array.isArray(value.groups) ? value.groups.flatMap((section) => {
    if (!isRecord(section) || typeof section.id !== 'string' || !section.id.trim()) {
      warnings.push('Skipped a settings section that had no id.');
      return [];
    }

    return [createMemorySubgroup({
      subgroupId: section.id.trim(),
      label: textOf(section.label),
      description: textOf(section.description),
    })];
  }) : [];

  return createMemoryGroup({
    groupId: value.id.trim(),
    label: textOf(value.label),
    description: textOf(value.description),
    icon: textOf(value.icon),
    warningTitle: warning ? textOf(warning.title) : '',
    warningDescription: warning ? textOf(warning.description) : '',
    subgroups,
  });
}

/**
 * Read a memory-map document into the Memory tab.
 * Returns undefined when the document has no struct list.
 */
export function draftMemoryMap(value: unknown, warnings: string[]): DriverMemoryMapDraft | undefined {
  if (!isRecord(value) || !Array.isArray(value.structs)) {
    warnings.push('Skipped the memory map because it had no structs.');
    return undefined;
  }

  const bindings = isRecord(value.channelBindings) ? value.channelBindings : undefined;
  const groups = Array.isArray(value.groups) ? value.groups.flatMap((group) => {
    const drafted = draftGroup(group, warnings);
    return drafted ? [drafted] : [];
  }) : [];
  const structs = value.structs.flatMap((struct) => {
    const drafted = draftStruct(struct, warnings);
    return drafted ? [drafted] : [];
  });

  return {
    version: textOf(value.version),
    description: textOf(value.description),
    records: bindings ? textOf(bindings.records) : '',
    names: bindings ? textOf(bindings.names) : '',
    nameField: bindings ? textOf(bindings.nameField) : '',
    receiveFrequency: bindings ? textOf(bindings.receiveFrequency) : '',
    transmitFrequency: bindings ? textOf(bindings.transmitFrequency) : '',
    receiveTone: bindings ? textOf(bindings.receiveTone) : '',
    transmitTone: bindings ? textOf(bindings.transmitTone) : '',
    extras: bindings ? textOf(bindings.extras) : '',
    groups,
    structs,
  };
}
