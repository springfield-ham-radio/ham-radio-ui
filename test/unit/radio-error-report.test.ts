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
  it('replaces home directory segments', () => {
    expect(sanitizeErrorText('failed at C:\\Users\\bryan\\file')).toContain('[path]');
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
