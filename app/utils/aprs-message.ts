import { canonicalAx25Call, encodeAx25Ui, formatAx25Call, parseAx25Ui, type Ax25Call } from '~/utils/aprs-ax25';
import { encodeKissData } from '~/utils/aprs-kiss';

/** APRS 1.0.1 limits the message text, not including the addressee or `{id`. */
export const APRS_MESSAGE_TEXT_MAX = 67;

/** Message number length in APRS 1.0.1. */
export const APRS_MESSAGE_ID_MAX = 5;

/** How many times a user-sent message may be transmitted, including the first. */
export const APRS_MESSAGE_ATTEMPTS = 3;

/** Gap between those transmissions. Retries stop when the message is cancelled. */
export const APRS_MESSAGE_RETRY_MS = 15_000;

const RESERVED = /[{|~]/u;
const ACK_TEXT = /^(ack|rej)([A-Za-z0-9]{1,5})$/u;

export interface AprsMessageBody {
  addressee: string;
  kind: 'text' | 'ack' | 'rej';
  text: string;
  id?: string;
}

export function callsignError(input: string): string | undefined {
  if (canonicalAx25Call(input)) {
    return undefined;
  }

  return 'Use a callsign of 3 to 6 characters, starting with a letter, and an SSID from 0 to 15';
}

export function messageTextError(text: string): string | undefined {
  if (text.length === 0) {
    return 'Enter a message';
  }

  if (text.length > APRS_MESSAGE_TEXT_MAX) {
    return `Message text is limited to ${APRS_MESSAGE_TEXT_MAX} characters`;
  }

  if ([...text].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) > 0x7e)) {
    return 'Use printable ASCII';
  }

  if (RESERVED.test(text)) {
    return 'The characters { | and ~ are reserved';
  }

  if (ACK_TEXT.test(text)) {
    return 'That text is an acknowledgement or reject, not a message';
  }

  return undefined;
}

/**
 * `:ADDRESSEE:text{id` with the addressee padded to 9 characters.
 *
 * An ack or reject is `ack` or `rej` plus the id and has no extra `{`.
 */
export function formatAprsMessage(body: AprsMessageBody): string | undefined {
  const addressee = canonicalAx25Call(body.addressee);

  if (!addressee) {
    return undefined;
  }

  const field = formatAx25Call(addressee).padEnd(9, ' ');

  if (field.length !== 9) {
    return undefined;
  }

  if (body.kind === 'text') {
    if (messageTextError(body.text) || (body.id !== undefined && !/^[A-Za-z0-9]{1,5}$/u.test(body.id))) {
      return undefined;
    }

    return `:${field}:${body.text}${body.id ? `{${body.id}` : ''}`;
  }

  if (!body.id || !/^[A-Za-z0-9]{1,5}$/u.test(body.id)) {
    return undefined;
  }

  return `:${field}:${body.kind}${body.id}`;
}

export function parseAprsMessage(info: string): AprsMessageBody | undefined {
  const match = /^:([^:]{9}):([\s\S]*)$/u.exec(info);

  if (!match?.[1]) {
    return undefined;
  }

  const addressee = canonicalAx25Call(match[1].trim());

  if (!addressee) {
    return undefined;
  }

  const payload = match[2] ?? '';
  const ack = /^(ack|rej)([A-Za-z0-9]{1,5})$/u.exec(payload);

  if (ack?.[1] && ack[2]) {
    return {
      addressee: formatAx25Call(addressee),
      kind: ack[1] === 'ack' ? 'ack' : 'rej',
      text: ack[2],
      id: ack[2],
    };
  }

  const idMatch = /\{([A-Za-z0-9]{1,5})$/u.exec(payload);
  const text = idMatch ? payload.slice(0, payload.length - idMatch[0].length) : payload;

  if (messageTextError(text)) {
    return undefined;
  }

  return {
    addressee: formatAx25Call(addressee),
    kind: 'text',
    text,
    id: idMatch?.[1],
  };
}

/** KISS data frame carrying one direct UI message. Undefined when the text or call is not valid. */
export function encodeAprsMessageFrame(source: Ax25Call, body: AprsMessageBody): Uint8Array | undefined {
  const info = formatAprsMessage(body);

  if (!info) {
    return undefined;
  }

  const ax25 = encodeAx25Ui(source, info);

  if (!ax25) {
    return undefined;
  }

  return encodeKissData(ax25);
}

export function parseAprsMessageFrame(payload: Uint8Array): { source: string; body: AprsMessageBody } | undefined {
  const ax25 = parseAx25Ui(payload);
  const body = ax25 ? parseAprsMessage(ax25.info) : undefined;

  if (!ax25 || !body) {
    return undefined;
  }

  return { source: formatAx25Call(ax25.source), body };
}
