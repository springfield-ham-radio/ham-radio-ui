import { describe, expect, it } from 'vitest';
import { serialPortMatchKey } from '../../app/utils/serial-port-list.ts';

describe('menu capture port holds', () => {
  it('treats the same serial path under different casing as one port', () => {
    const holds: Record<string, string> = { 'radio-a': '/dev/ttyUSB0' };
    const portKey = serialPortMatchKey('/dev/ttyusb0');
    const blocked = Object.entries(holds).some(([, heldPort]) => serialPortMatchKey(heldPort) === portKey);

    expect(blocked).toBe(true);
  });
});