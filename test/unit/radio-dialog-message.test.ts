import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { radioDialogMessage } from '../../app/utils/radio-dialog-message.ts';
import type { Radio } from '@springfield/ham-radio-api';

const configWithMessages: Pick<Radio, 'readMessage' | 'writeMessage'> = {
  readMessage: {
    title: 'Read title',
    body: 'Read\nbody',
    severity: 'info',
  },
  writeMessage: {
    title: 'Write title',
    body: 'Write body',
    severity: 'warning',
  },
};

describe('radioDialogMessage', () => {
  it('returns undefined when the config or field is missing', () => {
    expect(radioDialogMessage(undefined, 'read')).toBeUndefined();
    expect(radioDialogMessage({}, 'read')).toBeUndefined();
    expect(radioDialogMessage({ readMessage: configWithMessages.readMessage }, 'write')).toBeUndefined();
  });

  it('maps read and write messages independently', () => {
    expect(radioDialogMessage(configWithMessages, 'read')).toEqual({
      title: 'Read title',
      body: 'Read\nbody',
      color: 'info',
      icon: 'i-lucide-info',
    });
    expect(radioDialogMessage(configWithMessages, 'write')).toEqual({
      title: 'Write title',
      body: 'Write body',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
  });

  it('defaults severity to info', () => {
    expect(
      radioDialogMessage(
        {
          readMessage: { title: 'T', body: 'B' },
        },
        'read',
      )?.color,
    ).toBe('info');
  });
});

describe('dialog wiring', () => {
  it('passes setup alerts into port and direct read dialogs above the serial port', () => {
    const portDialog = readFileSync('app/components/RadioPortDialog.vue', 'utf8');
    const readDialog = readFileSync('app/components/RadioReadDialog.vue', 'utf8');
    const writeDialog = readFileSync('app/components/RadioWriteDialog.vue', 'utf8');
    const directRead = readFileSync('app/components/RadioDirectReadDialog.vue', 'utf8');

    expect(portDialog).toContain('setupAlert');
    expect(portDialog).toContain('whitespace-pre-line');
    expect(readDialog).toContain(':setup-alert="setupAlert"');
    expect(writeDialog).toContain(':setup-alert="setupAlert"');
    expect(directRead).toContain('radioDialogMessage');

    const reviewIndex = portDialog.indexOf('name="review"');
    const setupAlertBlock = portDialog.indexOf('v-if="setupAlert"');
    const serialIndex = portDialog.indexOf('label="Serial port"');
    expect(setupAlertBlock).toBeGreaterThan(reviewIndex);
    expect(serialIndex).toBeGreaterThan(setupAlertBlock);

    const warningIndex = portDialog.indexOf('v-if="warningTitle"');
    expect(warningIndex).toBeLessThan(reviewIndex);
  });
});
