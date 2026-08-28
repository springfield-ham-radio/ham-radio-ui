import { describe, it } from 'node:test';
import { expect } from 'chai';
import { DEFAULT_UPDATE_CHECK_INTERVAL_MS } from '../../app/utils/app-update-settings.ts';
import { shouldCheckForAppUpdate, updateDownloadPercent } from '../../app/utils/app-update-policy.ts';

describe('app update policy', () => {
  const now = new Date('2026-08-28T12:00:00.000Z');

  it('should always allow a manual check when idle', () => {
    expect(
      shouldCheckForAppUpdate({
        reason: 'manual',
        autoUpdateEnabled: false,
        lastCheckAt: now.toISOString(),
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: false,
        readyToRestart: false,
      }),
    ).to.be.true;
  });

  it('should not start another check while one is in flight', () => {
    expect(
      shouldCheckForAppUpdate({
        reason: 'manual',
        autoUpdateEnabled: true,
        lastCheckAt: undefined,
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: true,
        readyToRestart: false,
      }),
    ).to.be.false;
  });

  it('should check on startup when auto-update is enabled', () => {
    expect(
      shouldCheckForAppUpdate({
        reason: 'startup',
        autoUpdateEnabled: true,
        lastCheckAt: now.toISOString(),
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: false,
        readyToRestart: false,
      }),
    ).to.be.true;
  });

  it('should skip startup and interval checks when auto-update is disabled', () => {
    const options = {
      autoUpdateEnabled: false,
      lastCheckAt: undefined,
      now,
      intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
      inFlight: false,
      readyToRestart: false,
    };

    expect(shouldCheckForAppUpdate({ ...options, reason: 'startup' })).to.be.false;
    expect(shouldCheckForAppUpdate({ ...options, reason: 'interval' })).to.be.false;
  });

  it('should skip interval checks until the interval has elapsed', () => {
    expect(
      shouldCheckForAppUpdate({
        reason: 'interval',
        autoUpdateEnabled: true,
        lastCheckAt: '2026-08-28T10:00:00.000Z',
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: false,
        readyToRestart: false,
      }),
    ).to.be.false;

    expect(
      shouldCheckForAppUpdate({
        reason: 'interval',
        autoUpdateEnabled: true,
        lastCheckAt: '2026-08-28T08:00:00.000Z',
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: false,
        readyToRestart: false,
      }),
    ).to.be.true;
  });

  it('should check on interval when there is no previous check', () => {
    expect(
      shouldCheckForAppUpdate({
        reason: 'interval',
        autoUpdateEnabled: true,
        lastCheckAt: undefined,
        now,
        intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
        inFlight: false,
        readyToRestart: false,
      }),
    ).to.be.true;
  });

  it('should not check again after an update is ready to restart', () => {
    const options = {
      autoUpdateEnabled: true,
      lastCheckAt: undefined,
      now,
      intervalMs: DEFAULT_UPDATE_CHECK_INTERVAL_MS,
      inFlight: false,
      readyToRestart: true,
    };

    expect(shouldCheckForAppUpdate({ ...options, reason: 'startup' })).to.be.false;
    expect(shouldCheckForAppUpdate({ ...options, reason: 'interval' })).to.be.false;
    expect(shouldCheckForAppUpdate({ ...options, reason: 'manual' })).to.be.false;
  });

  it('should compute download percent from bytes transferred', () => {
    expect(updateDownloadPercent({ downloaded: 0, contentLength: 0 })).to.equal(0);
    expect(updateDownloadPercent({ downloaded: 50, contentLength: 200 })).to.equal(25);
    expect(updateDownloadPercent({ downloaded: 200, contentLength: 200 })).to.equal(100);
  });
});
