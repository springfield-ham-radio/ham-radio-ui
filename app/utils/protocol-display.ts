import type {
  RadioByteToken,
  RadioCatMemoryConfig,
  RadioCatReadStep,
  RadioCatWriteStep,
  RadioExchange,
  RadioExpect,
  RadioMemoryConfig,
  RadioProtocolStep,
  RadioReadStep,
  RadioSerialConfig,
  RadioWriteStep,
} from '@springfield/ham-radio-api';

export type ProtocolTokenKind = 'hex' | 'ascii' | 'control' | 'placeholder' | 'length' | 'delimiter';

export interface ProtocolDisplayToken {
  kind: ProtocolTokenKind;
  label: string;
  title?: string;
}

export type ProtocolMessageDirection = 'send' | 'expect';

export interface ProtocolDisplayMessage {
  direction: ProtocolMessageDirection;
  tokens: ProtocolDisplayToken[];
  annotation?: string;
}

export type ProtocolStepKind = 'exchange' | 'read' | 'write' | 'catRead' | 'catWrite';

export interface ProtocolDisplayLoop {
  label: string;
  detail: string;
}

export interface ProtocolDisplayStep {
  kind: ProtocolStepKind;
  title: string;
  notes: string[];
  messages: ProtocolDisplayMessage[];
  loop?: ProtocolDisplayLoop;
}

const HEX_BYTE = /^0x[0-9a-fA-F]{1,2}$/i;

const CONTROL_BYTES: Record<number, string> = {
  0x02: 'STX',
  0x06: 'ACK',
  0x0a: 'LF',
  0x0d: 'CR',
  0x15: 'NAK',
};

const PLACEHOLDER_TITLES: Record<string, string> = {
  $address: 'Current chunk address',
  $block: 'Block number',
  $chunkSize: 'Chunk size in bytes',
  $length: 'Payload length',
  $data: 'Memory payload for this chunk',
  $index: 'Channel index',
  $name: 'Channel name',
};

function hexLabel(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function formatLiteralByte(value: number): ProtocolDisplayToken {
  const control = CONTROL_BYTES[value];

  if (control) {
    return {
      kind: 'control',
      label: control,
      title: `0x${hexLabel(value)}`,
    };
  }

  return {
    kind: 'hex',
    label: hexLabel(value),
    title: `0x${hexLabel(value)}`,
  };
}

/**
 * Turns a protocol byte token into a chip for the sequence diagram.
 */
export function formatByteToken(token: RadioByteToken): ProtocolDisplayToken {
  if (typeof token === 'number') {
    return formatLiteralByte(token);
  }

  if (HEX_BYTE.test(token)) {
    return formatLiteralByte(Number.parseInt(token, 16));
  }

  if (token.startsWith('$')) {
    return {
      kind: 'placeholder',
      label: token,
      title: PLACEHOLDER_TITLES[token] ?? 'Protocol placeholder',
    };
  }

  if (token.length === 1) {
    return {
      kind: 'ascii',
      label: token,
      title: `ASCII '${token}' (0x${hexLabel(token.charCodeAt(0))})`,
    };
  }

  return {
    kind: 'ascii',
    label: token,
  };
}

function isExpectBytes(expect: RadioExpect): expect is { bytes: number } {
  return typeof expect === 'object' && expect !== null && !Array.isArray(expect) && 'bytes' in expect;
}

function isExpectUntil(expect: RadioExpect): expect is { until: RadioByteToken } {
  return typeof expect === 'object' && expect !== null && !Array.isArray(expect) && 'until' in expect;
}

/**
 * Turns an expected serial reply into a radio-to-computer message.
 */
export function formatExpect(expect: RadioExpect): ProtocolDisplayMessage {
  if (isExpectBytes(expect)) {
    return {
      direction: 'expect',
      tokens: [
        {
          kind: 'length',
          label: `${expect.bytes} bytes`,
          title: 'Any bytes of this length',
        },
      ],
      annotation: `any ${expect.bytes} bytes`,
    };
  }

  if (isExpectUntil(expect)) {
    const delimiter = formatByteToken(expect.until);

    return {
      direction: 'expect',
      tokens: [
        {
          kind: 'delimiter',
          label: `until ${delimiter.label}`,
          title: delimiter.title,
        },
      ],
      annotation: `until ${delimiter.label}`,
    };
  }

  const tokens = (Array.isArray(expect) ? expect : [expect]).map(formatByteToken);

  return {
    direction: 'expect',
    tokens,
  };
}

function formatSend(tokens: RadioByteToken[]): ProtocolDisplayMessage {
  return {
    direction: 'send',
    tokens: tokens.map(formatByteToken),
  };
}

function isReadStep(step: RadioProtocolStep): step is RadioReadStep {
  return typeof step === 'object' && step !== null && 'read' in step;
}

function isWriteStep(step: RadioProtocolStep): step is RadioWriteStep {
  return typeof step === 'object' && step !== null && 'write' in step;
}

function isCatReadStep(step: RadioProtocolStep): step is RadioCatReadStep {
  return typeof step === 'object' && step !== null && 'catRead' in step;
}

function isCatWriteStep(step: RadioProtocolStep): step is RadioCatWriteStep {
  return typeof step === 'object' && step !== null && 'catWrite' in step;
}

function exchangeMessages(exchange: RadioExchange): ProtocolDisplayMessage[] {
  const messages: ProtocolDisplayMessage[] = [];

  if (exchange.send && exchange.send.length > 0) {
    messages.push(formatSend(exchange.send));
  }

  if (exchange.expect !== undefined) {
    messages.push(formatExpect(exchange.expect));
  }

  return messages;
}

function exchangeNotes(exchange: RadioExchange): string[] {
  const notes: string[] = [];

  if (exchange.setBaudRate !== undefined) {
    notes.push(`Switch baud to ${exchange.setBaudRate}`);
  }

  if (exchange.delay !== undefined) {
    notes.push(`Wait ${exchange.delay} ms after send`);
  }

  if (exchange.timeout !== undefined) {
    notes.push(`Timeout ${exchange.timeout} ms`);
  }

  return notes;
}

function formatAddress(address: number): string {
  return String(address);
}

function formatSegmentList(segmentNames: string[], memoryConfig?: RadioMemoryConfig): string {
  return segmentNames
    .map((name) => {
      const segment = memoryConfig?.segments[name];

      if (!segment) {
        return name;
      }

      return `${name} (${formatAddress(segment.startAddress)}–${formatAddress(segment.endAddress)})`;
    })
    .join(', ');
}

function describeChunkLoop(segments: string[], chunkSize: number, memoryConfig?: RadioMemoryConfig): ProtocolDisplayLoop {
  return {
    label: 'Each chunk',
    detail: `${chunkSize}-byte chunks in ${formatSegmentList(segments, memoryConfig)}`,
  };
}

function kenwoodCatTokens(): { indexToken: ProtocolDisplayToken; cr: ProtocolDisplayToken; untilCr: ProtocolDisplayMessage } {
  const indexToken: ProtocolDisplayToken = {
    kind: 'placeholder',
    label: '$index',
    title: PLACEHOLDER_TITLES.$index,
  };

  return {
    indexToken,
    cr: formatByteToken('0x0D'),
    untilCr: formatExpect({ until: '0x0D' }),
  };
}

function kenwoodCatReadMessages(): ProtocolDisplayMessage[] {
  const { indexToken, cr, untilCr } = kenwoodCatTokens();

  return [
    {
      direction: 'send',
      tokens: [{ kind: 'ascii', label: 'MR 0,' }, indexToken, cr],
    },
    untilCr,
    {
      direction: 'send',
      tokens: [{ kind: 'ascii', label: 'MNA ' }, indexToken, cr],
    },
    untilCr,
  ];
}

function kenwoodCatWriteMessages(): ProtocolDisplayMessage[] {
  const { indexToken, cr, untilCr } = kenwoodCatTokens();
  const dataToken: ProtocolDisplayToken = {
    kind: 'placeholder',
    label: '$data',
    title: PLACEHOLDER_TITLES.$data,
  };
  const nameToken: ProtocolDisplayToken = {
    kind: 'placeholder',
    label: '$name',
    title: PLACEHOLDER_TITLES.$name,
  };

  return [
    {
      direction: 'send',
      tokens: [{ kind: 'ascii', label: 'MW 0,' }, indexToken, { kind: 'ascii', label: ',' }, dataToken, cr],
    },
    untilCr,
    {
      direction: 'send',
      tokens: [{ kind: 'ascii', label: 'MNA ' }, indexToken, { kind: 'ascii', label: ',' }, nameToken, cr],
    },
    untilCr,
  ];
}

function catLoopMessages(pack: string, direction: 'read' | 'write'): ProtocolDisplayMessage[] {
  if (pack !== 'kenwood-th-f6') {
    return [];
  }

  return direction === 'write' ? kenwoodCatWriteMessages() : kenwoodCatReadMessages();
}

function catNotes(config: RadioCatMemoryConfig): string[] {
  const notes: string[] = [];

  if (config.timeout !== undefined) {
    notes.push(`Timeout ${config.timeout} ms`);
  }

  if (config.interCommandDelayMs !== undefined) {
    notes.push(`${config.interCommandDelayMs} ms between commands`);
  }

  return notes;
}

function describeCatLoop(config: RadioCatMemoryConfig, memoryConfig?: RadioMemoryConfig): ProtocolDisplayLoop {
  const segment = formatSegmentList([config.segment], memoryConfig);

  return {
    label: 'Each channel',
    detail: `${config.count} × ${config.recordSize}-byte records in ${segment} · ${config.pack}`,
  };
}

function describeExchange(step: RadioExchange): ProtocolDisplayStep {
  return {
    kind: 'exchange',
    title: step.description ?? 'Serial exchange',
    notes: exchangeNotes(step),
    messages: exchangeMessages(step),
  };
}

function describeRead(step: RadioReadStep, memoryConfig?: RadioMemoryConfig): ProtocolDisplayStep {
  const chunkSize = memoryConfig?.chunkSize ?? 0;
  const messages = exchangeMessages({
    send: step.read.send,
    expect: step.read.expect,
  });

  if (step.read.ack) {
    messages.push(...exchangeMessages(step.read.ack));
  }

  const notes: string[] = [];

  if (step.read.timeout !== undefined) {
    notes.push(`Timeout ${step.read.timeout} ms`);
  }

  return {
    kind: 'read',
    title: step.description ?? 'Read memory',
    notes,
    messages,
    loop: describeChunkLoop(step.read.segments, chunkSize, memoryConfig),
  };
}

function formatProtocolAddress(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

function describeWrite(step: RadioWriteStep, memoryConfig?: RadioMemoryConfig): ProtocolDisplayStep {
  const chunkSize = step.write.chunkSize ?? memoryConfig?.chunkSize ?? 0;
  const notes: string[] = [];

  if (step.write.timeout !== undefined) {
    notes.push(`Timeout ${step.write.timeout} ms`);
  }

  if (step.write.delay !== undefined) {
    notes.push(`Wait ${step.write.delay} ms after each block`);
  }

  if (step.write.skip && step.write.skip.length > 0) {
    const ranges = step.write.skip
      .map((segment) => `${formatProtocolAddress(segment.startAddress)}–${formatProtocolAddress(segment.endAddress)}`)
      .join(', ');
    notes.push(`Skip ${ranges}`);
  }

  return {
    kind: 'write',
    title: step.description ?? 'Write memory',
    notes,
    messages: exchangeMessages({
      send: step.write.send,
      expect: step.write.expect,
    }),
    loop: describeChunkLoop(step.write.segments, chunkSize, memoryConfig),
  };
}

function describeCatRead(step: RadioCatReadStep, memoryConfig?: RadioMemoryConfig): ProtocolDisplayStep {
  return {
    kind: 'catRead',
    title: step.description ?? 'Live CAT read',
    notes: catNotes(step.catRead),
    messages: catLoopMessages(step.catRead.pack, 'read'),
    loop: describeCatLoop(step.catRead, memoryConfig),
  };
}

function describeCatWrite(step: RadioCatWriteStep, memoryConfig?: RadioMemoryConfig): ProtocolDisplayStep {
  return {
    kind: 'catWrite',
    title: step.description ?? 'Live CAT write',
    notes: catNotes(step.catWrite),
    messages: catLoopMessages(step.catWrite.pack, 'write'),
    loop: describeCatLoop(step.catWrite, memoryConfig),
  };
}

/**
 * Builds a sequence-diagram model from a radio protocol (read or write).
 */
export function describeProtocolSteps(
  steps: RadioProtocolStep[],
  memoryConfig?: RadioMemoryConfig,
): ProtocolDisplayStep[] {
  return steps.map((step) => {
    if (isReadStep(step)) {
      return describeRead(step, memoryConfig);
    }

    if (isWriteStep(step)) {
      return describeWrite(step, memoryConfig);
    }

    if (isCatReadStep(step)) {
      return describeCatRead(step, memoryConfig);
    }

    if (isCatWriteStep(step)) {
      return describeCatWrite(step, memoryConfig);
    }

    return describeExchange(step);
  });
}

/**
 * Pretty-prints protocol JSON for the raw view.
 */
export function formatProtocolJson(steps: RadioProtocolStep[]): string {
  return JSON.stringify(steps, null, 2);
}

function parityLetter(parity: RadioSerialConfig['parity']): string {
  if (parity === 'even') {
    return 'E';
  }

  if (parity === 'odd') {
    return 'O';
  }

  return 'N';
}

/**
 * Short serial-port summary shown above the protocol diagram.
 */
export function formatSerialSummary(config: RadioSerialConfig): string {
  const dataBits = config.dataBits ?? 8;
  const stopBits = config.stopBits ?? 1;
  const parts = [`${config.baudRate} baud`, `${dataBits}${parityLetter(config.parity)}${stopBits}`];

  if (config.dtr !== undefined) {
    parts.push(`DTR ${config.dtr ? 'on' : 'off'}`);
  }

  if (config.rts !== undefined) {
    parts.push(`RTS ${config.rts ? 'on' : 'off'}`);
  }

  if (config.rtscts) {
    parts.push('RTS/CTS');
  }

  return parts.join(' · ');
}
