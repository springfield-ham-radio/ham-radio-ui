export type JsonTokenKind = 'key' | 'string' | 'number' | 'literal' | 'punctuation' | 'whitespace' | 'text';

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

const WHITESPACE = new Set([' ', '\n', '\r', '\t']);
const PUNCTUATION = new Set(['{', '}', '[', ']', ':', ',']);
const LITERALS = ['true', 'false', 'null'] as const;

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

function isIdentifierCharacter(character: string | undefined): boolean {
  if (character === undefined) {
    return false;
  }

  return (
    (character >= 'A' && character <= 'Z') ||
    (character >= 'a' && character <= 'z') ||
    (character >= '0' && character <= '9') ||
    character === '_' ||
    character === '$'
  );
}

function isBoundary(character: string): boolean {
  return WHITESPACE.has(character) || PUNCTUATION.has(character) || character === '"';
}

function nextSignificant(source: string, index: number): string | undefined {
  let cursor = index;

  while (cursor < source.length && WHITESPACE.has(source[cursor] ?? '')) {
    cursor += 1;
  }

  return source[cursor];
}

/**
 * End index of a JSON string that starts at `start`, including the closing quote.
 * A missing closer consumes the rest of the source.
 */
function readString(source: string, start: number): number {
  let index = start + 1;

  while (index < source.length) {
    const character = source[index];

    if (character === '\\') {
      index += 2;
      continue;
    }

    if (character === '"') {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

/**
 * End index of a JSON number starting at `start`, or `start` when the text is not a number.
 */
function readNumber(source: string, start: number): number {
  let index = start;

  if (source[index] === '-') {
    index += 1;
  }

  if (!isDigit(source[index])) {
    return start;
  }

  while (isDigit(source[index])) {
    index += 1;
  }

  if (source[index] === '.' && isDigit(source[index + 1])) {
    index += 2;

    while (isDigit(source[index])) {
      index += 1;
    }
  }

  if (source[index] === 'e' || source[index] === 'E') {
    let cursor = index + 1;

    if (source[cursor] === '+' || source[cursor] === '-') {
      cursor += 1;
    }

    if (!isDigit(source[cursor])) {
      return index;
    }

    index = cursor + 1;

    while (isDigit(source[index])) {
      index += 1;
    }
  }

  return index;
}

function readLiteral(source: string, index: number): string | undefined {
  for (const word of LITERALS) {
    if (!source.startsWith(word, index)) {
      continue;
    }

    if (isIdentifierCharacter(source[index + word.length])) {
      continue;
    }

    return word;
  }

  return undefined;
}

/**
 * Splits JSON text into tokens so the UI can color keys, strings, numbers, and literals.
 * The token texts concatenate back to `source`, including invalid fragments.
 */
export function tokenizeJson(source: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index] ?? '';

    if (WHITESPACE.has(character)) {
      const start = index;

      while (index < source.length && WHITESPACE.has(source[index] ?? '')) {
        index += 1;
      }

      tokens.push({ kind: 'whitespace', text: source.slice(start, index) });
      continue;
    }

    if (PUNCTUATION.has(character)) {
      tokens.push({ kind: 'punctuation', text: character });
      index += 1;
      continue;
    }

    if (character === '"') {
      const end = readString(source, index);
      const text = source.slice(index, end);
      const kind = nextSignificant(source, end) === ':' ? 'key' : 'string';

      tokens.push({ kind, text });
      index = end;
      continue;
    }

    if (character === '-' || isDigit(character)) {
      const end = readNumber(source, index);

      if (end > index) {
        tokens.push({ kind: 'number', text: source.slice(index, end) });
        index = end;
        continue;
      }
    }

    const literal = readLiteral(source, index);

    if (literal) {
      tokens.push({ kind: 'literal', text: literal });
      index += literal.length;
      continue;
    }

    const start = index;
    index += 1;

    while (index < source.length && !isBoundary(source[index] ?? '')) {
      index += 1;
    }

    tokens.push({ kind: 'text', text: source.slice(start, index) });
  }

  return tokens;
}
