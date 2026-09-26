import type { DriverIssue } from './driver-compile';
import { parseDriverInteger, type DriverChannelSchemaDraft } from './driver-draft';

export interface CompiledChannelSchema {
  json: string;
  issues: DriverIssue[];
  errorCount: number;
}

const TONE_TYPES = ['CTCSS', 'DCS', 'NONE'] as const;

/**
 * Turn the Channel tab into a JSON Schema document.
 * A bound that does not parse is left out so the preview still parses.
 */
export function compileChannelSchema(schema: DriverChannelSchemaDraft): CompiledChannelSchema {
  const issues: DriverIssue[] = [];
  const properties: Record<string, unknown> = {};

  if (schema.includeName) {
    properties.name = nameProperty(schema.nameMaxLength, issues);
  }

  properties.receiveFrequency = frequencyProperty(
    schema.receiveMinimum,
    schema.receiveMaximum,
    'channel.receive',
    'Receive frequency in Hz',
    issues,
  );
  properties.transmitFrequency = frequencyProperty(
    schema.transmitMinimum,
    schema.transmitMaximum,
    'channel.transmit',
    'Transmit frequency in Hz',
    issues,
  );

  const tonesIncluded = schema.includeReceiveTone || schema.includeTransmitTone;
  const tone = tonesIncluded ? toneProperty(schema, issues) : undefined;

  if (schema.includeReceiveTone && tone) {
    properties.receiveTone = tone;
  }

  if (schema.includeTransmitTone && tone) {
    properties.transmitTone = tone;
  }

  const document = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    properties,
    required: ['receiveFrequency', 'transmitFrequency'],
    additionalProperties: false,
  };

  return {
    json: `${JSON.stringify(document, null, 2)}\n`,
    issues,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
  };
}

function nameProperty(raw: string, issues: DriverIssue[]): Record<string, unknown> {
  const property: Record<string, unknown> = {
    type: 'string',
    description: 'Channel name',
  };
  const text = raw.trim();

  if (!text) {
    issues.push({ level: 'error', path: 'channel.nameMaxLength', message: 'Enter a maximum name length.' });
    return property;
  }

  const length = parseDriverInteger(text);

  if (length === undefined || length < 1) {
    issues.push({ level: 'error', path: 'channel.nameMaxLength', message: 'Name length must be a whole number of 1 or more.' });
    return property;
  }

  property.maxLength = length;
  return property;
}

function frequencyProperty(
  minimumRaw: string,
  maximumRaw: string,
  path: string,
  description: string,
  issues: DriverIssue[],
): Record<string, unknown> {
  const property: Record<string, unknown> = {
    type: 'number',
    description,
  };
  const minimum = bound(minimumRaw, `${path}Minimum`, 'minimum', issues);
  const maximum = bound(maximumRaw, `${path}Maximum`, 'maximum', issues);

  if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
    issues.push({
      level: 'error',
      path: `${path}Maximum`,
      message: 'The maximum frequency cannot be below the minimum.',
    });
    return property;
  }

  if (minimum !== undefined) {
    property.minimum = minimum;
  }

  if (maximum !== undefined) {
    property.maximum = maximum;
  }

  return property;
}

function bound(raw: string, path: string, label: string, issues: DriverIssue[]): number | undefined {
  const text = raw.trim();

  if (!text) {
    issues.push({ level: 'error', path, message: `Enter a ${label} frequency in hertz.` });
    return undefined;
  }

  const value = Number(text);

  if (!Number.isFinite(value)) {
    issues.push({ level: 'error', path, message: `The ${label} frequency must be a number of hertz.` });
    return undefined;
  }

  return value;
}

function toneProperty(schema: DriverChannelSchemaDraft, issues: DriverIssue[]): Record<string, unknown> {
  const toneNumber: Record<string, unknown> = {
    type: 'number',
    description: 'CTCSS frequency in Hz',
  };
  const minimum = bound(schema.ctcssMinimum, 'channel.ctcssMinimum', 'minimum CTCSS', issues);
  const maximum = bound(schema.ctcssMaximum, 'channel.ctcssMaximum', 'maximum CTCSS', issues);

  if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
    issues.push({
      level: 'error',
      path: 'channel.ctcssMaximum',
      message: 'The maximum CTCSS tone cannot be below the minimum.',
    });
  } else {
    if (minimum !== undefined) {
      toneNumber.minimum = minimum;
    }

    if (maximum !== undefined) {
      toneNumber.maximum = maximum;
    }
  }

  const toneString: Record<string, unknown> = {
    type: 'string',
    description: 'DCS code (e.g., D023N, D023I)',
  };
  const pattern = schema.dcsPattern.trim();

  if (!pattern) {
    issues.push({ level: 'error', path: 'channel.dcsPattern', message: 'Enter a DCS code pattern.' });
  } else {
    try {
      RegExp(pattern);
      toneString.pattern = pattern;
    } catch {
      issues.push({ level: 'error', path: 'channel.dcsPattern', message: 'The DCS pattern is not a valid regular expression.' });
    }
  }

  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: [...TONE_TYPES],
        description: 'Tone type',
      },
      tone: {
        oneOf: [toneNumber, toneString],
      },
    },
    required: ['type'],
    additionalProperties: false,
  };
}
