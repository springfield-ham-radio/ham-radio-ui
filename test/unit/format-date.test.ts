import { describe, expect, it } from 'vitest';
import { formatChannelPrintDate } from '~/utils/channel-print';
import { formatChannelPackUpdated, formatShortDate } from '~/utils/format-date';

describe('formatChannelPackUpdated', () => {
  it('formats an ISO timestamp as a short local date', () => {
    expect(formatChannelPackUpdated('2026-10-17T21:00:00.000Z')).toBe('Oct 17, 2026');
  });

  it('uses the same calendar format as printed channel cards', () => {
    const date = new Date('2026-10-17T21:00:00.000Z');

    expect(formatChannelPackUpdated('2026-10-17T21:00:00.000Z')).toBe(formatChannelPrintDate(date));
    expect(formatShortDate(date)).toBe(formatChannelPrintDate(date));
  });

  it('leaves an unparseable timestamp unchanged', () => {
    expect(formatChannelPackUpdated('not-a-date')).toBe('not-a-date');
  });
});
