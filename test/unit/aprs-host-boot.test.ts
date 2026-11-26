import { describe, expect, it } from 'vitest';
import { endsWithBareCommandPrompt, textShowsTncBoot } from '~/utils/aprs-host-boot';

describe('TNC boot detection', () => {
  it('recognizes banner and setup lines', () => {
    expect(textShowsTncBoot('Kenwood Radio Modem')).toBe(true);
    expect(textShowsTncBoot('DA 110101000000\r\n')).toBe(true);
    expect(textShowsTncBoot('cmd:HB 1200\r\n')).toBe(true);
    expect(textShowsTncBoot('HBAUD    was 1200\r\n')).toBe(true);
    expect(textShowsTncBoot('ok>\r\n')).toBe(false);
  });

  it('distinguishes bare cmd: from cmd: plus a command', () => {
    const bare = new TextEncoder().encode('cmd:');
    const setup = new TextEncoder().encode('DA 110101\r\ncmd:HB 1200\r\n');
    expect(endsWithBareCommandPrompt(bare, 'cmd:')).toBe(true);
    expect(endsWithBareCommandPrompt(setup, 'cmd:')).toBe(false);
    expect(endsWithBareCommandPrompt(new TextEncoder().encode('...\r\ncmd:'), 'cmd:')).toBe(true);
  });
});