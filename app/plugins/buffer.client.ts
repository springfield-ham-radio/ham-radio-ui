import { Buffer } from 'buffer';

export default defineNuxtPlugin(() => {
  const globalProcess = globalThis as typeof globalThis & {
    Buffer: typeof Buffer;
    process?: { argv?: string[]; env?: Record<string, string | undefined>; exit?: (code?: number) => void };
  };

  globalProcess.Buffer = Buffer;
  globalProcess.process = globalProcess.process ?? {};
  globalProcess.process.argv = globalProcess.process.argv ?? ['nuxt', 'ham-radio-ui'];
  globalProcess.process.env = globalProcess.process.env ?? {};
  globalProcess.process.exit = globalProcess.process.exit ?? (() => undefined);
});
