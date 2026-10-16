import { describe, expect, it } from 'vitest';
import {
  compareSemverWithPrerelease,
  isBetaDriverVersion,
  isBetaZipFileName,
  moduleIdFromZipName,
  versionFromZipName,
} from '../../app/utils/radio-module-semver.ts';

describe('radio module semver', () => {
  it('should keep -beta.n in versionFromZipName', () => {
    expect(versionFromZipName('radio-module-kenwood-th-d74-1.11.1-beta.1.zip')).toBe('1.11.1-beta.1');
    expect(versionFromZipName('radio-module-baofeng-uv5r-3.7.0.zip')).toBe('3.7.0');
  });

  it('should parse module id from beta zip names', () => {
    expect(moduleIdFromZipName('radio-module-kenwood-th-d74-1.11.1-beta.1.zip')).toBe('kenwood-th-d74');
  });

  it('should detect beta zip file names', () => {
    expect(isBetaZipFileName('radio-module-kenwood-th-d74-1.11.1-beta.1.zip')).toBe(true);
    expect(isBetaZipFileName('radio-module-baofeng-uv5r-3.7.0.zip')).toBe(false);
  });

  it('should compare release versions above matching beta prereleases', () => {
    expect(compareSemverWithPrerelease('1.11.1', '1.11.1-beta.1')).toBeGreaterThan(0);
    expect(compareSemverWithPrerelease('1.11.1-beta.1', '1.11.1')).toBeLessThan(0);
    expect(compareSemverWithPrerelease('1.11.2-beta.1', '1.11.1')).toBeGreaterThan(0);
  });

  it('should compare beta build numbers numerically', () => {
    expect(compareSemverWithPrerelease('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(isBetaDriverVersion('1.11.1-beta.1')).toBe(true);
    expect(isBetaDriverVersion('1.11.1')).toBe(false);
  });
});
