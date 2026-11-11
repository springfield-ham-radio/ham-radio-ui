/**
 * Search helpers for a host-command reply.
 *
 * The prompt and error text come from the radio module. These functions do
 * not assume `cmd:` or `?EH`.
 */

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.length === 0 || haystack.length < needle.length) {
    return -1;
  }

  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let matched = true;

    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      return start;
    }
  }

  return -1;
}

export function hasCommandPrompt(bytes: Uint8Array, prompt: string): boolean {
  return prompt.length > 0 && indexOfBytes(bytes, new TextEncoder().encode(prompt)) >= 0;
}

export function hasTncError(bytes: Uint8Array, errorReply: string): boolean {
  return errorReply.length > 0 && indexOfBytes(bytes, new TextEncoder().encode(errorReply)) >= 0;
}

export function appendCommandBytes(previous: Uint8Array, chunk: Uint8Array, cap = 4096): Uint8Array {
  const combined = new Uint8Array(previous.length + chunk.length);
  combined.set(previous, 0);
  combined.set(chunk, previous.length);

  if (combined.length <= cap) {
    return combined;
  }

  return combined.subarray(combined.length - cap);
}
