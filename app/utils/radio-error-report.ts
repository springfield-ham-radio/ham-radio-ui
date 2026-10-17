import type { LogLayer } from 'loglayer';
import { APP_VERSION } from '~/utils/app-version';
import { APP_HAM_RADIO_API_VERSION } from '~/utils/radio-module-install';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';

import hamRadioDriverPackage from '@springfield/ham-radio-driver/package.json';

export interface RadioErrorContext {
  operation: string;
  step: string;
  cardName?: string;
  manufacturer?: string;
  model?: string;
  moduleId?: string;
  moduleVersion?: string;
  /** Serial device name only (COM3, cu.usbserial-1), not a filesystem path. */
  port?: string;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

export interface RadioErrorEnvironment {
  appVersion: string;
  apiVersion: string;
  driverVersion: string;
  os: string;
}

export interface RadioErrorReport {
  context: RadioErrorContext;
  /** Primary message shown in alerts (top-level error message, redacted). */
  summary: string;
  errors: SerializedError;
  environment: RadioErrorEnvironment;
}

const HOME_PATH_PATTERN =
  /(?:\/Users\/[^/\s]+|\/home\/[^/\s]+|C:\\Users\\[^\\\s]+)(?:\/|\\)[^\s)]*/gi;

let cachedEnvironment: RadioErrorEnvironment | undefined;

export function sanitizeErrorText(text: string): string {
  return text.replace(HOME_PATH_PATTERN, '[path]').replace(/\s+/g, (match) => (match.includes('\n') ? match : ' '));
}

/** Reduce a port path to a device name for reports. */
export function serialPortDeviceName(port: string | undefined): string | undefined {
  if (!port) {
    return undefined;
  }

  const trimmed = port.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const normalized = trimmed.replace(/\\/g, '/');
  const segments = normalized.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return trimmed;
  }

  const last = segments[segments.length - 1]!;

  if (/^com\d+$/i.test(last)) {
    return last.toUpperCase();
  }

  if (last.startsWith('cu.') || last.startsWith('tty.')) {
    return last;
  }

  if (normalized.startsWith('/dev/')) {
    return last;
  }

  return last;
}

function serializeError(error: unknown, depth = 0): SerializedError {
  if (depth > 8) {
    return { name: 'Error', message: '[cause chain truncated]' };
  }

  if (error instanceof Error) {
    const cause = error.cause;
    const serialized: SerializedError = {
      name: error.name,
      message: sanitizeErrorText(error.message),
      stack: error.stack ? sanitizeErrorText(error.stack) : undefined,
    };

    if (cause !== undefined) {
      serialized.cause = serializeError(cause, depth + 1);
    }

    return serialized;
  }

  return {
    name: 'Error',
    message: sanitizeErrorText(String(error)),
  };
}

export function topErrorMessage(errors: SerializedError): string {
  return errors.message;
}

export async function readRadioErrorEnvironment(): Promise<RadioErrorEnvironment> {
  if (cachedEnvironment) {
    return cachedEnvironment;
  }

  let os = 'unknown';

  if (isTauriRuntime()) {
    try {
      const { arch, platform, version } = await import('@tauri-apps/plugin-os');
      const platformName = platform();
      const archName = arch();
      const versionName = version();

      os = [platformName, versionName, archName].filter(Boolean).join(' ');
    } catch {
      os = navigator.userAgent;
    }
  } else {
    os = navigator.userAgent;
  }

  cachedEnvironment = {
    appVersion: APP_VERSION,
    apiVersion: APP_HAM_RADIO_API_VERSION,
    driverVersion: hamRadioDriverPackage.version,
    os: sanitizeErrorText(os),
  };

  return cachedEnvironment;
}

export async function createRadioErrorReport(
  context: RadioErrorContext,
  cause: unknown,
  options?: { summary?: string },
): Promise<RadioErrorReport> {
  const errors = serializeError(cause);
  const environment = await readRadioErrorEnvironment();

  const port = serialPortDeviceName(context.port);

  return {
    context: {
      ...context,
      port,
    },
    summary: options?.summary ?? topErrorMessage(errors),
    errors,
    environment,
  };
}

function formatErrorChain(errors: SerializedError, indent = ''): string {
  const lines = [`${indent}${errors.name}: ${errors.message}`];

  if (errors.stack) {
    lines.push(errors.stack.split('\n').map((line) => `${indent}  ${line}`).join('\n'));
  }

  if (errors.cause) {
    lines.push(`${indent}Caused by: ${formatErrorChain(errors.cause, indent)}`);
  }

  return lines.join('\n');
}

export function formatRadioErrorReportText(report: RadioErrorReport): string {
  const { context, environment } = report;
  const lines: string[] = [];

  lines.push(`${context.operation} · ${context.step}`);

  const radioParts = [context.cardName, context.manufacturer, context.model].filter(Boolean);

  if (radioParts.length > 0) {
    lines.push(radioParts.join(' · '));
  }

  if (context.moduleId || context.moduleVersion) {
    lines.push(`Module ${[context.moduleId, context.moduleVersion].filter(Boolean).join(' ')}`);
  }

  if (context.port) {
    lines.push(`Port ${context.port}`);
  }

  lines.push(
    `HamBench ${environment.appVersion} · API ${environment.apiVersion} · driver ${environment.driverVersion}`,
  );
  lines.push(environment.os);
  lines.push('');
  lines.push(formatErrorChain(report.errors));

  return lines.join('\n');
}

export function logRadioErrorReport(log: LogLayer, report: RadioErrorReport, message?: string): void {
  const text = formatRadioErrorReportText(report);
  log.error(`${message ?? `${report.context.operation}: ${report.context.step}`}\n${text}`);
}

export async function copyRadioErrorReport(report: RadioErrorReport): Promise<void> {
  await navigator.clipboard.writeText(formatRadioErrorReportText(report));
}

export function radioErrorToastActions(report: RadioErrorReport): Array<{ label: string; onClick: () => void }> {
  return [
    {
      label: 'Copy details',
      onClick: () => {
        void copyRadioErrorReport(report).catch((cause) => {
          console.error('Failed to copy error report', cause);
        });
      },
    },
  ];
}

/** Sample nested report for `?fixture=error-report`. */
export async function sampleRadioErrorReport(): Promise<RadioErrorReport> {
  const inner = new DOMException('The object can not be cloned.', 'DataCloneError');
  const outer = new Error('Undo snapshot failed after read', { cause: inner });

  return createRadioErrorReport(
    {
      operation: 'read',
      step: 'undo snapshot',
      cardName: "Rob's TH-F6",
      manufacturer: 'Kenwood',
      model: 'kenwood-th-f6',
      moduleId: 'kenwood-th-f6',
      moduleVersion: '1.12.0',
      port: '/dev/cu.usbserial-1420',
    },
    outer,
  );
}
