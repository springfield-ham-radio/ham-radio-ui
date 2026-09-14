import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { expect } from 'chai';
import { APP_VERSION } from '../../app/utils/app-version.ts';

describe('app-version', () => {
  it('should expose the package.json version for the header badge', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
      version: string;
    };

    expect(APP_VERSION).to.equal(packageJson.version);
    expect(APP_VERSION).to.match(/^\d+\.\d+\.\d+/);
  });
});
