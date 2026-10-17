import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createRadioErrorReport,
  formatRadioErrorReportText,
  radioErrorToastActions,
  sanitizeErrorText,
  serialPortDeviceName,
  topErrorMessage,
} from '../../app/utils/radio-error-report.ts';

describe('serialPortDeviceName', () => {
  it('keeps COM ports and cu/tty device names', () => {
    expect(serialPortDeviceName('COM3')).toBe('COM3');
    expect(serialPortDeviceName('/dev/cu.usbserial-1420')).toBe('cu.usbserial-1420');
  });
});

describe('createRadioErrorReport', () => {
  it('serializes cause chains and redacts home paths in stacks', async () => {
    const inner = new Error('inner failure');
    inner.stack = 'Error: inner failure\n    at /Users/bryan/proj/file.ts:1:1';
    const outer = new Error('step failed', { cause: inner });

    const report = await createRadioErrorReport(
      {
        operation: 'read',
        step: 'undo snapshot',
        cardName: "Rob's TH-F6",
        manufacturer: 'Kenwood',
        model: 'kenwood-th-f6',
        port: '/dev/cu.usbserial-1420',
        moduleId: 'kenwood-th-f6',
        moduleVersion: '1.12.0',
      },
      outer,
    );

    expect(topErrorMessage(report.errors)).toBe('step failed');
    expect(report.errors.cause?.message).toBe('inner failure');
    expect(report.context.port).toBe('cu.usbserial-1420');
    expect(report.environment.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.environment.apiVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.environment.driverVersion).toMatch(/^\d+\.\d+\.\d+/);

    const text = formatRadioErrorReportText(report);
    expect(text).toContain("Rob's TH-F6");
    expect(text).toContain('read · undo snapshot');
    expect(text).not.toContain('/Users/bryan');
    expect(text).toContain('Caused by:');
  });

  it('returns undefined report fields as omitted lines in formatted text', async () => {
    const report = await createRadioErrorReport({ operation: 'read', step: 'read radio' }, new Error('fail'));
    const text = formatRadioErrorReportText(report);
    expect(text).not.toContain('undefined');
  });
});

describe('sanitizeErrorText', () => {
  it('redacts macOS, Linux, and Windows home paths including spaces', () => {
    for (const sample of [
      'at /Users/bryan/proj/file.ts:1',
      'at /Users/Bryan Hunt/proj/file.ts',
      'at /home/bryan/proj/file.ts:1',
      'at C:\\Users\\bryan\\file.ts:1',
      'at C:/Users/Bryan Hunt/file.ts:1',
    ]) {
      const redacted = sanitizeErrorText(sample);
      expect(redacted).toContain('[path]');
      expect(redacted).not.toMatch(/\/Users\/|\/home\/|C:[\\/]Users/i);
    }

    const multiline = sanitizeErrorText('line one\n  at /home/ada/app.ts');
    expect(multiline.startsWith('line one\n')).toBe(true);
    expect(multiline).not.toContain('/home/ada');
  });
});

describe('cause chain', () => {
  it('stops on a cause cycle and keeps a non-Error cause', async () => {
    const outer = new Error('outer');
    const inner = new Error('inner at /home/ada/secret.ts');
    outer.cause = inner;
    inner.cause = outer;

    const cycled = await createRadioErrorReport({ operation: 'read', step: 'read radio' }, outer);
    const text = formatRadioErrorReportText(cycled);
    expect(text).toContain('[cause cycle]');
    expect(text).not.toContain('/home/ada');
    expect(text.match(/outer/g)?.length).toBeLessThan(5);

    const stringCause = new Error('wrapped');
    stringCause.cause = 'plain /Users/ada/file.ts';
    const fromString = await createRadioErrorReport({ operation: 'write', step: 'write radio' }, stringCause);
    expect(fromString.errors.cause?.message).toBe('plain [path]');
    expect(formatRadioErrorReportText(fromString)).not.toContain('serial');
    expect(formatRadioErrorReportText(fromString)).not.toContain('callsign');
  });
});

describe('radio error UI wiring', () => {
  it('keeps Save serial log and uses RadioErrorDetails on the progress dialog', () => {
    const progress = readFileSync('app/components/RadioProgressDialog.vue', 'utf8');
    expect(progress).toContain('RadioErrorDetails');
    expect(progress).toContain('Save serial log');
    expect(progress).not.toContain('v-html');
  });

  it('exposes copy details on error toasts', () => {
    const actions = radioErrorToastActions({
      context: { operation: 'read', step: 'test' },
      summary: 'fail',
      errors: { name: 'Error', message: 'fail' },
      environment: {
        appVersion: '1.0.0',
        apiVersion: '18.2.0',
        driverVersion: '3.5.4',
        os: 'test',
      },
    });
    expect(actions[0]?.label).toBe('Copy details');
  });
});
