const ROMAN_NUMERAL = /^(?:X{0,3})(?:IX|IV|V?I{0,3})$/;

/**
 * FCC and ULS lookup names arrive in all capitals. A name that already has
 * lowercase letters is returned unchanged.
 */
export function mixedCaseLookupName(name: string): string {
  if (!shouldConvert(name)) {
    return name;
  }

  return name.trim().split(/\s+/).map(formatToken).join(' ');
}

function shouldConvert(name: string): boolean {
  return /\p{L}/u.test(name) && !/\p{Ll}/u.test(name);
}

function formatToken(token: string): string {
  const bare = token.endsWith('.') ? token.slice(0, -1) : token;
  const upper = bare.toUpperCase();

  if (upper.length > 0 && ROMAN_NUMERAL.test(upper) && /^[IVX]+$/i.test(bare)) {
    return upper;
  }

  if (upper === 'JR') {
    return 'Jr.';
  }

  if (upper === 'SR') {
    return 'Sr.';
  }

  return token
    .split(/([-’'])/u)
    .map((part) => (part === '-' || part === "'" || part === '’' ? part : formatSegment(part)))
    .join('');
}

function formatSegment(segment: string): string {
  if (!segment) {
    return segment;
  }

  if (segment.toUpperCase().startsWith('MC') && segment.length > 2) {
    const rest = segment.slice(2);
    return `Mc${rest.charAt(0).toUpperCase()}${rest.slice(1).toLowerCase()}`;
  }

  return `${segment.charAt(0).toUpperCase()}${segment.slice(1).toLowerCase()}`;
}
