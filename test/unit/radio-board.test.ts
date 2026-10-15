import { describe, expect, it } from 'vitest';
import {
  focusedCardAfterHydrate,
  hydratedBoardCards,
  parseRadioBoardSettings,
  persistedBoardOpenIds,
  reconcileOpenRadioIds,
  serializeRadioBoardSettings,
} from '../../app/utils/radio-board.ts';

describe('radio board', () => {
  it('should fall back to tabs when storage is empty, invalid, or the old stacked layout', () => {
    expect(parseRadioBoardSettings(null)).toEqual({ layout: 'tabs', openIds: [] });
    expect(parseRadioBoardSettings('{')).toEqual({ layout: 'tabs', openIds: [] });
    expect(parseRadioBoardSettings('[]')).toEqual({ layout: 'tabs', openIds: [] });
    expect(parseRadioBoardSettings(JSON.stringify({ layout: 'stack', openIds: ['base'] }))).toEqual({
      layout: 'tabs',
      openIds: ['base'],
    });
  });

  it('should keep tile layout and unique open ids', () => {
    expect(
      parseRadioBoardSettings(
        JSON.stringify({
          layout: 'tile',
          openIds: ['base', ' ', 'mobile', 'base', 3],
        }),
      ),
    ).toEqual({
      layout: 'tile',
      openIds: ['base', 'mobile'],
    });
  });

  it('should round-trip board settings', () => {
    const settings = { layout: 'tile' as const, openIds: ['mobile', 'base'] };

    expect(parseRadioBoardSettings(serializeRadioBoardSettings(settings))).toEqual(settings);
  });

  it('should drop open cards whose radio was deleted', () => {
    expect(reconcileOpenRadioIds(['mobile', 'gone', 'base'], ['base', 'mobile'])).toEqual(['mobile', 'base']);
  });

  it('keeps guest clones that were opened before the board hydrates', () => {
    const guest = {
      id: 'guest-1',
      guest: { name: 'Fixture UV-5R', manufacturer: 'Baofeng', model: 'baofeng-uv5r', serialPort: 'fixture' },
    };
    const cards = hydratedBoardCards([guest], ['base']);

    expect(cards).toEqual([guest, { id: 'base', savedRadioId: 'base' }]);
    expect(focusedCardAfterHydrate('guest-1', cards)).toBe('guest-1');
    expect(focusedCardAfterHydrate(undefined, cards)).toBe('guest-1');
  });

  it('should keep saved radios on the board and drop guest clones', () => {
    expect(
      persistedBoardOpenIds([
        { savedRadioId: 'base' },
        { guest: { name: 'UV-5R', manufacturer: 'Baofeng', model: 'UV-5R', serialPort: '/dev/cu.usb' } },
        { savedRadioId: 'mobile' },
      ]),
    ).toEqual(['base', 'mobile']);
  });
});
