import { describe, expect, it } from 'vitest'
import { setCargoLockPackageVersion, setCargoTomlVersion } from '../../scripts/set-cargo-version.mjs'

describe('set cargo version', () => {
  it('should update the package version in Cargo.toml', () => {
    const toml = ['[package]', 'name = "ham-radio"', 'version = "0.39.1"', ''].join('\n')

    expect(setCargoTomlVersion(toml, '0.40.0')).toContain('version = "0.40.0"')
  })

  it('should update only the ham-radio package in Cargo.lock', () => {
    const lock = [
      '[[package]]',
      'name = "ham-radio"',
      'version = "0.35.0"',
      'dependencies = [',
      ' "log",',
      ']',
      '',
      '[[package]]',
      'name = "log"',
      'version = "0.4.28"',
      '',
    ].join('\n')

    const updated = setCargoLockPackageVersion(lock, '0.39.1')

    expect(updated).toContain('name = "ham-radio"\nversion = "0.39.1"')
    expect(updated).toContain('name = "log"\nversion = "0.4.28"')
  })
})
