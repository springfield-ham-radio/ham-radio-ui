import { describe, expect, it } from 'vitest';
import { RadioModelId, type RadioId } from '@springfield/ham-radio-api';
import { snapshotFromDriverSerialLog } from '../../app/utils/serial-log-session.ts';
import {
  WRITE_FAILED_DEV_FIXTURE_QUERY,
  writeFailedDevFixtureSerialLog,
} from '../../app/utils/write-failed-dev-fixture.ts';

const radioId: RadioId = {
  model: RadioModelId('baofeng-uv5r'),
  name: 'Baofeng UV-5R',
  manufacturer: 'Baofeng',
};

describe('write-failed dev fixture', () => {
  it('uses the write-failed query value', () => {
    expect(WRITE_FAILED_DEV_FIXTURE_QUERY).toBe('write-failed');
  });

  it('provides non-empty serial frames for the progress dialog', () => {
    const snapshot = snapshotFromDriverSerialLog('import', radioId, 'fixture', writeFailedDevFixtureSerialLog());

    expect(snapshot?.entryCount).toBeGreaterThan(0);
    expect(snapshot?.fileName).toMatch(/baofeng-uv5r-import-serial-/);
  });
});
