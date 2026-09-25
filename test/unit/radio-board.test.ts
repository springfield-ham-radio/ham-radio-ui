import { describe, expect, it } from 'vitest';
import {
  parseRadioBoardSettings,
  reconcileOpenRadioIds,
  serializeRadioBoardSettings,
} from '../../app/utils/radio-board.ts';

describe('radio board', () => {
  it('should fall back to a stacked board when storage is empty or invalid', () => {
    expect(parseRadioBoardSettings(null)).toEqual({ layout: 'stack', openIds: [] });
    expect(parseRadioBoardSettings('{')).toEqual({ layout: 'stack', openIds: [] });
    expect(parseRadioBoardSettings('[]')).toEqual({ layout: 'stack', openIds: [] });
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
});
